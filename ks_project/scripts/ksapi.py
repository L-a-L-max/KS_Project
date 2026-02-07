import frida
import time
import json
import os
import subprocess
from flask import Flask, request, jsonify
import base64

app = Flask(__name__)

# 获取脚本所在目录
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
KS_JS_PATH = os.path.join(SCRIPT_DIR, "ks.js")

# 全局字典，用于缓存已连接的设备session
# key: device_id, value: script_object
device_scripts = {}

def get_script_for_device(device_id):
    """
    根据设备ID获取或创建Frida脚本实例
    """
    if device_id in device_scripts:
        # 简单检查脚本是否还存活 (可选)
        try:
            if not device_scripts[device_id].is_destroyed:
                return device_scripts[device_id]
        except:
            pass
    
    # 重新连接
    try:
        # 关键修复：使用USB/ADB设备连接（-U模式），而不是远程连接（-H模式）
        # 远程连接时Java运行时可能不可用，这是Frida的限制
        # 参考部署指南：应该配合adb forward使用本地模式
        print(f"[Frida] === 连接Frida设备 ===")
        print(f"[Frida] 尝试使用USB/ADB设备连接（推荐方式）...")
        
        device = None
        last_err = None
        
        # 方法1: 尝试使用USB设备（通过adb forward，这是推荐方式）
        try:
            device = frida.get_usb_device(timeout=5)
            print(f"[Frida] ✓ 成功连接到USB/ADB设备")
        except Exception as e:
            last_err = e
            print(f"[Frida] USB设备连接失败: {e}")
            print(f"[Frida] 尝试使用远程设备连接（备选方案）...")
            
            # 方法2: 如果USB连接失败，尝试远程连接（不推荐，Java可能不可用）
            dm = frida.get_device_manager()
            remote_candidates = []
            remote_candidates.append("127.0.0.1:27042")
            if ":" in device_id:
                host = device_id.split(":")[0]
                remote_candidates.append(f"{host}:27042")

            for addr in remote_candidates:
                try:
                    print(f"[Frida] 尝试远程设备: {addr} ...")
                    device = dm.add_remote_device(addr)
                    print(f"[Frida] ⚠ 使用远程设备连接（Java运行时可能不可用）")
                    break
                except Exception as e2:
                    last_err = e2
                    print(f"[Frida] 远程设备 {addr} 失败: {e2}")

        if device is None:
            error_msg = "无法连接到Frida设备。"
            error_msg += "\n请确保："
            error_msg += "\n  1. frida-server正在运行: adb shell 'su -c \"ps | grep frida\"'"
            error_msg += "\n  2. 已设置端口转发: adb forward tcp:27042 tcp:27042"
            error_msg += "\n  3. adb设备已连接: adb devices"
            raise Exception(error_msg)

        processes = device.enumerate_processes()
        
        # 首先，列出所有快手相关进程用于诊断
        kuaishou_processes = [p for p in processes if "kuaishou" in p.name.lower() or "快手" in p.name or "nebula" in p.name.lower()]
        print(f"[Frida] === 诊断信息：找到 {len(kuaishou_processes)} 个快手相关进程 ===")
        if kuaishou_processes:
            for p in kuaishou_processes:
                print(f"[Frida]   - {p.name} (PID: {p.pid})")
        else:
            print("[Frida]   未找到任何快手相关进程！")
            print("[Frida]   前20个进程列表：")
            for p in processes[:20]:
                print(f"[Frida]     - {p.name} (PID: {p.pid})")
        
        target_name = None
        target_pid = None
        
        # 方法1: 优先查找包名主进程（必须优先，因为只有主进程包含Java运行时）
        priority_names = ["com.kuaishou.nebula", "com.smile.gifmaker"]
        print(f"[Frida] === 步骤1: 优先查找包名主进程 {priority_names} ===")
        # 先检查所有进程，看看是否有主进程
        found_main = False
        for p in processes:
            n = p.name
            if n in priority_names:
                found_main = True
                print(f"[Frida]   发现主进程: {n} (PID: {p.pid})")
        
        if found_main:
            # 再次遍历，选择主进程
            for p in processes:
                n = p.name
                if n in priority_names:
                    target_name = n
                    target_pid = p.pid
                    print(f"[Frida] ✓ 选择包名主进程: {target_name} (PID: {target_pid})")
                    print(f"[Frida]   这是包含Java运行时的主进程，将优先使用")
                    break
        else:
            print(f"[Frida]   未发现主进程")
        
        if not target_name:
            print(f"[Frida] ✗ 未找到包名主进程")
        
        # 方法2: 如果主进程不存在，才查找中文名"快手极速版"（不推荐，可能不包含Java运行时）
        if not target_name:
            print(f"[Frida] === 步骤2: 查找'快手极速版'进程（备选，可能不包含Java运行时） ===")
            for p in processes:
                n = p.name
                if "快手" in n and "极速" in n:
                    target_name = n
                    target_pid = p.pid
                    print(f"[Frida] ⚠ 找到'快手极速版'进程: {target_name} (PID: {target_pid})")
                    print(f"[Frida] ⚠ 警告：此进程可能不包含Java运行时，建议使用主进程com.kuaishou.nebula")
                    break
        
        # 方法3: 通过adb命令查找主进程（如果Frida枚举不到）
        if not target_name:
            print(f"[Frida] === 步骤3: 通过adb查找主进程 ===")
            try:
                # 获取包名的主进程PID
                result = subprocess.run(
                    ['adb', 'shell', 'pidof', 'com.kuaishou.nebula'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result.returncode == 0 and result.stdout.strip():
                    main_pid = result.stdout.strip().split()[0]  # 取第一个PID
                    print(f"[Frida] adb找到主进程PID: {main_pid}")
                    # 在Frida进程列表中查找这个PID
                    for p in processes:
                        if str(p.pid) == main_pid:
                            target_name = p.name
                            target_pid = p.pid
                            print(f"[Frida] ✓ 通过PID找到进程: {target_name} (PID: {target_pid})")
                            break
            except Exception as e:
                print(f"[Frida] adb查找失败: {e}")
        
        # 方法4: 查找所有包含"快手"的进程
        if not target_name:
            print(f"[Frida] === 步骤4: 查找所有'快手'进程 ===")
            for p in processes:
                n = p.name
                if "快手" in n and ":" not in n:  # 排除子进程
                    target_name = n
                    target_pid = p.pid
                    print(f"[Frida] ⚠ 找到'快手'进程: {target_name} (PID: {target_pid})")
                    break
        
        if not target_name:
            print("[Frida] === 未找到任何快手主进程，尝试使用 spawn 回退 ===")
            try:
                spawn_pkg = "com.kuaishou.nebula"
                pid = device.spawn([spawn_pkg])
                print(f"[Frida] Spawned {spawn_pkg} with PID {pid}")
                session = device.attach(pid)
                print(f"[Frida] Successfully attached to spawned process {pid}")
                device.resume(pid)
                time.sleep(2)
                # 更新目标信息
                target_name = spawn_pkg
                target_pid = pid
            except Exception as e:
                print("[Frida] === 所有进程列表（用于调试） ===")
                for p in sorted(processes, key=lambda x: x.name):
                    print(f"[Frida]   - {p.name} (PID: {p.pid})")
                raise Exception(f"Kuaishou process not found and spawn failed: {e}")
        
        # 如果选择了子进程，添加额外提示
        if target_name and ":" in target_name:
            print(f"[Frida] ⚠ 注意：选择了子进程 {target_name}")
            print(f"[Frida] ⚠ 如果Java不可用，请尝试：")
            print(f"[Frida]   1. 重启快手应用，确保主进程启动")
            print(f"[Frida]   2. 检查主进程是否存在：frida-ps -U | grep nebula")
            print(f"[Frida]   3. 如果主进程确实不存在，可能需要使用不同的方法")

        print(f"[Frida] Attaching to process: {target_name} (PID: {target_pid})")
        session = None
        
        # 关键修复：如果主进程存在但Java不可用，尝试使用spawn方式重新启动
        # spawn方式可以确保Java运行时在脚本加载前初始化
        use_spawn = False
        
        # 先尝试attach，检查Java是否可用
        # 关键修复：如果找到的进程Java不可用，先检查所有进程，找到真正包含Java运行时的进程
        java_available_process = None
        
        if target_name:
            try:
                print(f"[Frida] 检查进程 {target_name} (PID: {target_pid}) 的Java运行时...")
                temp_session = device.attach(target_name)
                # 快速检查Java是否可用
                test_script_code = "if (typeof Java !== 'undefined') { send('java_ok'); } else { send('java_not_ok'); }"
                test_script = temp_session.create_script(test_script_code)
                java_check = {"result": None}
                def check_msg(msg, data):
                    if msg['type'] == 'send':
                        java_check["result"] = msg['payload']
                test_script.on('message', check_msg)
                test_script.load()
                time.sleep(0.5)  # 增加等待时间，确保脚本执行
                test_script.unload()
                temp_session.detach()
                
                if java_check["result"] == "java_ok":
                    print(f"[Frida] ✓ 进程已附加，Java运行时可用")
                    java_available_process = target_name
                else:
                    print(f"[Frida] ⚠ 进程 {target_name} Java运行时不可用")
                    print(f"[Frida] 检查所有快手进程，查找包含Java运行时的进程...")
            except Exception as e:
                print(f"[Frida] Attach测试失败: {e}")
        
        # 如果当前进程Java不可用，检查所有进程
        if not java_available_process:
            print(f"[Frida] === 扫描所有进程查找Java运行时 ===")
            for p in processes:
                # 只检查主进程（不包含冒号的进程名）
                if (p.name in priority_names or "kuaishou" in p.name.lower() or "nebula" in p.name.lower()) and ":" not in p.name:
                    try:
                        print(f"[Frida]   检查进程: {p.name} (PID: {p.pid})...")
                        temp_session = device.attach(p.name)
                        test_script_code = "if (typeof Java !== 'undefined') { send('java_ok'); } else { send('java_not_ok'); }"
                        test_script = temp_session.create_script(test_script_code)
                        java_check = {"result": None}
                        def check_msg(msg, data):
                            if msg['type'] == 'send':
                                java_check["result"] = msg['payload']
                        test_script.on('message', check_msg)
                        test_script.load()
                        time.sleep(0.5)
                        test_script.unload()
                        temp_session.detach()
                        
                        if java_check["result"] == "java_ok":
                            print(f"[Frida]   ✓ 找到包含Java运行时的进程: {p.name} (PID: {p.pid})")
                            java_available_process = p.name
                            target_name = p.name
                            target_pid = p.pid
                            break
                    except Exception as e:
                        # 忽略检查失败的进程
                        pass
        
        if java_available_process:
            print(f"[Frida] ✓ 使用包含Java运行时的进程: {java_available_process}")
            session = device.attach(java_available_process)
            print(f"[Frida] Successfully attached to {java_available_process}")
        else:
            print(f"[Frida] ⚠ 未找到包含Java运行时的进程")
            print(f"[Frida] 尝试使用spawn方式重新启动应用...")
            use_spawn = True
        
        # 如果Java不可用，使用spawn方式
        if use_spawn or session is None:
            try:
                spawn_pkg = "com.kuaishou.nebula"
                print(f"[Frida] Spawning {spawn_pkg}...")
                pid = device.spawn([spawn_pkg])
                print(f"[Frida] ✓ Spawned {spawn_pkg} with PID {pid}")
                
                # 关键修复：先resume让进程启动，然后再attach
                # 如果在resume之前attach，session可能锁定进程的早期状态，无法看到后续加载的Java运行时
                device.resume(pid)
                print(f"[Frida] ✓ Resumed process, waiting for process to start...")
                
                # 等待进程启动（给进程一些时间开始运行）
                time.sleep(3)
                
                # 现在attach到已经运行的进程
                print(f"[Frida] Attaching to running process (PID: {pid})...")
                session = device.attach(pid)
                print(f"[Frida] ✓ Attached to process")
                
                # 使用轮询方式等待Java运行时初始化
                max_wait_time = 30  # 最多等待30秒
                check_interval = 1  # 每1秒检查一次
                elapsed_time = 0
                java_ready = False
                
                print(f"[Frida] Waiting for Java runtime to initialize...")
                while elapsed_time < max_wait_time and not java_ready:
                    try:
                        # 创建一个临时脚本来检查Java是否可用
                        test_script_code = """
                        if (typeof Java !== 'undefined') {
                            send('java_ok');
                        } else {
                            send('java_not_ok');
                        }
                        """
                        test_script = session.create_script(test_script_code)
                        java_check = {"result": None}
                        def check_msg(msg, data):
                            if msg['type'] == 'send':
                                java_check["result"] = msg['payload']
                        test_script.on('message', check_msg)
                        test_script.load()
                        time.sleep(0.5)  # 给脚本一点时间执行
                        test_script.unload()
                        
                        if java_check["result"] == "java_ok":
                            java_ready = True
                            print(f"[Frida] ✓ Java运行时已就绪（等待了 {elapsed_time} 秒）")
                            break
                        else:
                            print(f"[Frida]   等待Java运行时初始化... ({elapsed_time}/{max_wait_time}秒)")
                    except Exception as e:
                        # 如果检查失败，继续等待（可能是进程还在启动中）
                        print(f"[Frida]   检查Java时出错（可能还在启动中）: {e}")
                    
                    time.sleep(check_interval)
                    elapsed_time += check_interval
                
                if not java_ready:
                    print(f"[Frida] ⚠ 警告：等待 {max_wait_time} 秒后Java运行时仍未就绪")
                    print(f"[Frida]   可能的原因：")
                    print(f"[Frida]   1. 应用启动失败或崩溃")
                    print(f"[Frida]   2. 进程架构问题（32位/64位不匹配）")
                    print(f"[Frida]   3. Frida连接方式问题（建议使用USB/ADB连接）")
                    print(f"[Frida]   继续尝试加载脚本...")
                
                target_name = spawn_pkg
                target_pid = pid
            except Exception as e:
                print(f"[Frida] ✗ Spawn failed: {e}")
                # 如果spawn失败，回退到普通attach
                if session is None:
                    try:
                        session = device.attach(target_name)
                        print(f"[Frida] Fallback: attached to {target_name}")
                    except Exception as e2:
                        raise Exception(f"All attachment methods failed. Last error: {e2}")
        
        # 注意：如果附加到"快手极速版"但Java不可用，脚本会处理错误
        # 这里我们继续加载脚本，让脚本内部处理Java不可用的情况
        
        # 使用绝对路径加载脚本
        if not os.path.exists(KS_JS_PATH):
            raise Exception(f"Script file not found: {KS_JS_PATH}")
        
        with open(KS_JS_PATH, "r", encoding="utf-8") as f:
            script_code = f.read()
        
        script = session.create_script(script_code)
        
        # RPC就绪标志
        rpc_ready = {"ready": False}
        
        def on_message(message, data):
            try:
                msg_type = message.get('type')
                payload = message.get('payload')
                
                if msg_type == 'send':
                    if payload == 'rpc_ready':
                        rpc_ready["ready"] = True
                        print("[Frida] RPC methods ready")
                    else:
                        print(f"[Frida] {payload}")
                elif msg_type == 'error':
                    print(f"[Frida] Error: {message.get('description', message)}")
                else:
                    print(f"[Frida] {msg_type}: {payload if payload else message}")
            except Exception as e:
                print(f"[Frida] Message parse error: {e}, raw: {message}")
        
        script.on('message', on_message)
        print(f"[Frida] Loading script from: {KS_JS_PATH}")
        script.load()
        print(f"[Frida] Script loaded successfully")
        
        # 等待RPC就绪（最多等待5秒）
        timeout = 5
        elapsed = 0
        while not rpc_ready["ready"] and elapsed < timeout:
            time.sleep(0.1)
            elapsed += 0.1
        
        if not rpc_ready["ready"]:
            print("[Frida] ⚠ Warning: RPC ready signal not received, but continuing...")
        
        # 验证RPC方法是否可用
        print(f"[Frida] === 验证RPC方法 ===")
        try:
            ping_result = script.exports_sync.ping()
            print(f"[Frida] ✓ RPC ping ok: {ping_result}")
            
            # 检查关键方法是否存在
            if not hasattr(script.exports_sync, 'atlasencryptbytes'):
                raise Exception("atlasencryptbytes method not exported")
            print("[Frida] ✓ atlasencryptbytes method found")
            
            # 列出所有可用的导出方法
            exports = [x for x in dir(script.exports_sync) if not x.startswith('_')]
            print(f"[Frida] ✓ Available RPC methods: {exports}")
            
        except Exception as e:
            print(f"[Frida] ✗ RPC verification failed: {e}")
            # 列出所有可用的导出方法
            try:
                exports = [x for x in dir(script.exports_sync) if not x.startswith('_')]
                print(f"[Frida] Available exports: {exports}")
            except Exception as e2:
                print(f"[Frida] Failed to list exports: {e2}")
            raise Exception(f"RPC methods not available: {e}")
        
        device_scripts[device_id] = script
        return script
    except Exception as e:
        print(f"Error attaching to device {device_id}: {e}")
        return None

def call_frida_rpc(device_id, method_name, *args):
    script = get_script_for_device(device_id)
    if not script:
        return {"error": f"Failed to connect to device {device_id}"}
    
    try:
        # 检查方法是否存在
        if not hasattr(script.exports_sync, method_name):
            available_methods = [x for x in dir(script.exports_sync) if not x.startswith('_')]
            return {"error": f"Method '{method_name}' not found. Available methods: {available_methods}"}
        
        # 动态调用 rpc 方法
        method = getattr(script.exports_sync, method_name)
        result = method(*args)
        
        # 如果结果是None，可能是Frida端抛出了错误
        if result is None:
            return {"error": f"Method '{method_name}' returned None. Check Frida logs for details."}
        
        return result
    except frida.InvalidOperationError as e:
        # Frida连接问题，清除缓存
        if device_id in device_scripts:
            del device_scripts[device_id]
        return {"error": f"Frida connection error: {str(e)}"}
    except Exception as e:
        error_msg = str(e)
        # 如果是连接断开，尝试清除缓存
        if "detached" in error_msg.lower() or "destroyed" in error_msg.lower():
            if device_id in device_scripts:
                del device_scripts[device_id]
        return {"error": error_msg}

@app.route('/encdata', methods=['POST'])
def encdata():
    try:
        json_data = request.json.get('data')
        device_id = request.args.get('device') or request.json.get('device') # 从URL或Body获取设备ID
        
        if not json_data or not device_id:
            return jsonify({"error": "Missing 'data' or 'device' parameter"}), 400

        byte_array = list(json_data.encode("utf-8"))
        # 调用 atlasencryptbytes
        # 参数固定为: "KwaiAdAwardVideo", "95147564-9763-4413-a937-6f0e3c12caf1", 0, byte_array
        print(f"Calling atlasencryptbytes for device {device_id}...")
        result = call_frida_rpc(device_id, 'atlasencryptbytes', 
                              "KwaiAdAwardVideo", 
                              "95147564-9763-4413-a937-6f0e3c12caf1", 
                              0, 
                              byte_array)

        if isinstance(result, dict) and "error" in result:
            print(f"Frida RPC Error: {result['error']}")
            return jsonify(result), 500
            
        print(f"Frida RPC Success. Result type: {type(result)}")

        result_bytes = bytes([b & 0xFF for b in result])
        result_b64 = base64.b64encode(result_bytes).decode('utf-8')
        return jsonify({"result": result_b64})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/sign', methods=['POST'])
def sign():
    try:
        json_data = request.json.get('data')
        device_id = request.args.get('device') or request.json.get('device')
        
        if not json_data or not device_id:
            return jsonify({"error": "Missing 'data' or 'device' parameter"}), 400

        # 调用 atlassignapi
        result = call_frida_rpc(device_id, 'atlassignapi',
                              "KwaiAdAwardVideo", 
                              "95147564-9763-4413-a937-6f0e3c12caf1", 
                              0, 
                              json_data)
        
        if isinstance(result, dict) and "error" in result:
            return jsonify(result), 500
        return jsonify({"result": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/nssig3', methods=['POST'])
def nssig3():
    try:
        json_data = request.json.get('data')
        device_id = request.args.get('device') or request.json.get('device')
        
        if not json_data or not device_id:
            return jsonify({"error": "Missing 'data' or 'device' parameter"}), 400

        # 调用 nssig3
        result = call_frida_rpc(device_id, 'nssig3', json_data)
        
        if isinstance(result, dict) and "error" in result:
            return jsonify(result), 500
        return jsonify({"result": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # 监听所有IP，端口5000
    app.run(host='0.0.0.0', port=5000)
