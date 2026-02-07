#!/usr/bin/env python3
"""
诊断脚本：检查快手应用的所有进程，找出包含Java运行时的进程
"""
import frida
import subprocess

def main():
    print("=== 快手进程诊断工具 ===\n")
    
    # 连接设备（优先USB/ADB，回退到远程）
    device = None
    try:
        device = frida.get_usb_device(timeout=5)
        print("✓ 已通过USB/ADB连接到Frida设备\n")
    except Exception as e:
        print(f"USB连接失败: {e}，尝试远程连接...")
        try:
            dm = frida.get_device_manager()
            device = dm.add_remote_device("127.0.0.1:27042")
            print("✓ 已通过远程连接到Frida设备\n")
        except Exception as e2:
            print(f"✗ 连接失败: {e2}")
            return
    
    # 枚举所有进程
    processes = device.enumerate_processes()
    kuaishou_processes = [p for p in processes if "kuaishou" in p.name.lower() or "快手" in p.name or "nebula" in p.name.lower()]
    
    print(f"找到 {len(kuaishou_processes)} 个快手相关进程：\n")
    for p in kuaishou_processes:
        print(f"  - {p.name} (PID: {p.pid})")
    
    print("\n=== 检查每个进程的Java运行时支持 ===\n")
    
    java_available_processes = []
    
    for p in kuaishou_processes:
        print(f"检查进程: {p.name} (PID: {p.pid})...")
        try:
            session = device.attach(p.pid)
            test_script_code = """
            if (typeof Java !== 'undefined') {
                send('java_available');
            } else {
                send('java_not_available');
            }
            """
            test_script = session.create_script(test_script_code)
            result = {"value": None}
            def on_message(message, data):
                if message['type'] == 'send':
                    result["value"] = message['payload']
            test_script.on('message', on_message)
            test_script.load()
            import time
            time.sleep(1.0)
            test_script.unload()
            session.detach()
            
            if result["value"] == "java_available":
                print(f"  ✓ Java运行时可用！")
                java_available_processes.append(p)
            else:
                print(f"  ✗ Java运行时不可用")
        except Exception as e:
            print(f"  ✗ 检查失败: {e}")
        print()
    
    print("=== 结果总结 ===\n")
    if java_available_processes:
        print("包含Java运行时的进程：")
        for p in java_available_processes:
            print(f"  ✓ {p.name} (PID: {p.pid})")
        print(f"\n建议：在ksapi.py中使用进程名 '{java_available_processes[0].name}'")
    else:
        print("✗ 未找到包含Java运行时的进程！")
        print("\n可能的原因：")
        print("  1. 主进程com.kuaishou.nebula未启动")
        print("  2. 应用使用了不同的进程架构")
        print("  3. 需要通过其他方式访问Java运行时")
        print("\n建议：")
        print("  1. 完全关闭并重新打开快手应用")
        print("  2. 等待应用完全启动（进入主界面后等待10-20秒）")
        print("  3. 再次运行此诊断脚本")

if __name__ == "__main__":
    main()

