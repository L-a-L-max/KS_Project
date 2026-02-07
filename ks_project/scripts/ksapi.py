import frida
import time
import json
import os
import subprocess
import sys
from flask import Flask, request, jsonify
import base64

app = Flask(__name__)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
KS_JS_PATH = os.path.join(SCRIPT_DIR, "ks.js")

device_scripts = {}
_compiled_bundle = None


def compile_script():
    global _compiled_bundle
    if _compiled_bundle is not None:
        return _compiled_bundle

    print("[Frida] === 编译Frida脚本 (Frida 17.x需要编译Java bridge) ===")
    print(f"[Frida] 脚本路径: {KS_JS_PATH}")
    print(f"[Frida] 项目根目录: {SCRIPT_DIR}")

    node_modules = os.path.join(SCRIPT_DIR, "node_modules", "frida-java-bridge")
    if not os.path.exists(node_modules):
        print(f"[Frida] *** 错误: frida-java-bridge未安装! ***")
        print(f"[Frida] *** 请在scripts目录执行: npm install ***")
        print(f"[Frida] *** 或者: npm install frida-java-bridge ***")
        raise Exception(
            "frida-java-bridge未安装。"
            "Frida 17.x不再自动包含Java bridge，需要手动安装。"
            f"请在 {SCRIPT_DIR} 目录执行: npm install"
        )

    compiler = frida.Compiler()

    diag_messages = []
    def on_diagnostics(diag):
        diag_messages.append(diag)
        print(f"[Frida][Compiler] {diag}")

    compiler.on("diagnostics", on_diagnostics)

    try:
        bundle = compiler.build(
            os.path.basename(KS_JS_PATH),
            project_root=SCRIPT_DIR
        )
        print(f"[Frida] 脚本编译成功 (bundle大小: {len(bundle)} bytes)")
        _compiled_bundle = bundle
        return bundle
    except Exception as e:
        print(f"[Frida] *** 脚本编译失败: {e} ***")
        if diag_messages:
            for msg in diag_messages:
                print(f"[Frida][Compiler] {msg}")
        raise


def print_diagnostics(device):
    print("[Diag] === 环境诊断 ===")
    print(f"[Diag] Python Frida版本: {frida.__version__}")
    print(f"[Diag] Python版本: {sys.version}")
    print(f"[Diag] 设备类型: {device.type}")
    print(f"[Diag] 设备ID: {device.id}")
    print(f"[Diag] 设备名称: {device.name}")
    major_ver = int(frida.__version__.split('.')[0])
    if major_ver >= 17:
        print(f"[Diag] Frida {frida.__version__} (>=17.0): Java bridge需要通过frida.Compiler()编译")
    try:
        params = device.query_system_parameters()
        print(f"[Diag] 系统参数: {json.dumps(params, indent=2, ensure_ascii=False)}")
    except Exception as e:
        print(f"[Diag] 获取系统参数失败: {e}")
    print("[Diag] === 诊断结束 ===")


def try_connect_device(device_id):
    print(f"[Frida] === 连接Frida设备 ===")

    try:
        device = frida.get_usb_device(timeout=5)
        print(f"[Frida] [方法1] USB/ADB设备连接成功 (id={device.id})")
        return device
    except Exception as e:
        print(f"[Frida] [方法1] USB设备连接失败: {e}")

    dm = frida.get_device_manager()
    remote_addrs = ["127.0.0.1:27042"]
    if ":" in device_id:
        host = device_id.split(":")[0]
        remote_addrs.append(f"{host}:27042")

    for addr in remote_addrs:
        try:
            print(f"[Frida] [方法2] 尝试远程设备: {addr}")
            device = dm.add_remote_device(addr)
            print(f"[Frida] [方法2] 远程设备连接成功: {addr}")
            return device
        except Exception as e:
            print(f"[Frida] [方法2] 远程设备 {addr} 失败: {e}")

    raise Exception("无法连接Frida设备。请确保frida-server正在运行且adb已连接。")




def attach_and_load(device, device_id):
    processes = device.enumerate_processes()

    ks_procs = [p for p in processes
                if "kuaishou" in p.name.lower() or "快手" in p.name
                or "nebula" in p.name.lower()]
    print(f"[Frida] === 找到 {len(ks_procs)} 个快手相关进程 ===")
    for p in ks_procs:
        print(f"[Frida]   - {p.name} (PID: {p.pid})")

    if not ks_procs:
        print("[Frida] 未找到快手进程，前20个进程:")
        for p in processes[:20]:
            print(f"[Frida]   - {p.name} (PID: {p.pid})")

    attach_targets = []
    for p in ks_procs:
        if "快手" in p.name and ":" not in p.name:
            attach_targets.insert(0, p)
        elif p.name in ("com.kuaishou.nebula", "com.smile.gifmaker"):
            attach_targets.append(p)

    script_code = compile_script()

    for proc in attach_targets:
        print(f"\n[Frida] === 尝试attach并加载脚本: {proc.name} (PID: {proc.pid}) ===")
        try:
            session = device.attach(proc.pid)
            print(f"[Frida] attach成功")

            script = session.create_script(script_code)
            rpc_state = {"ready": False, "error": None}

            def on_message(message, data):
                msg_type = message.get('type')
                payload = message.get('payload')
                if msg_type == 'send':
                    if payload == 'rpc_ready':
                        rpc_state["ready"] = True
                    print(f"[Frida][JS] {payload}")
                elif msg_type == 'error':
                    rpc_state["error"] = message.get('description', str(message))
                    print(f"[Frida][JS-Error] {message.get('description', message)}")

            script.on('message', on_message)
            script.load()
            print(f"[Frida] 脚本已加载，等待RPC就绪...")

            wait_max = 20
            for i in range(wait_max):
                if rpc_state["ready"]:
                    break
                time.sleep(1)
                if (i + 1) % 5 == 0:
                    print(f"[Frida]   等待RPC... ({i+1}/{wait_max}秒)")

            if rpc_state["ready"]:
                try:
                    ping = script.exports_sync.ping()
                    print(f"[Frida] RPC ping结果: {ping}")
                    if ping == "ok":
                        exports = [x for x in dir(script.exports_sync)
                                   if not x.startswith('_')]
                        print(f"[Frida] RPC方法: {exports}")
                        print(f"[Frida] === 成功! 使用进程: {proc.name} ===")
                        device_scripts[device_id] = script
                        return script
                    else:
                        print(f"[Frida] ping返回非ok: {ping}, 尝试下一个进程")
                        try:
                            script.unload()
                            session.detach()
                        except Exception:
                            pass
                except Exception as e:
                    print(f"[Frida] RPC调用失败: {e}")
                    try:
                        script.unload()
                        session.detach()
                    except Exception:
                        pass
            else:
                err_info = rpc_state.get("error", "超时")
                print(f"[Frida] RPC未就绪: {err_info}")
                try:
                    script.unload()
                    session.detach()
                except Exception:
                    pass

        except Exception as e:
            print(f"[Frida] attach失败: {e}")

    print(f"\n[Frida] === 所有已有进程均失败，尝试spawn模式 ===")
    spawn_pkg = "com.kuaishou.nebula"
    try:
        pid = device.spawn([spawn_pkg])
        print(f"[Frida] spawn成功: {spawn_pkg} PID={pid}")
        session = device.attach(pid)
        print(f"[Frida] attach到spawn进程成功")

        spawn_script_code = compile_script()
        script = session.create_script(spawn_script_code)
        rpc_state = {"ready": False, "error": None}

        def on_message_spawn(message, data):
            msg_type = message.get('type')
            payload = message.get('payload')
            if msg_type == 'send':
                if payload == 'rpc_ready':
                    rpc_state["ready"] = True
                print(f"[Frida][JS-Spawn] {payload}")
            elif msg_type == 'error':
                rpc_state["error"] = message.get('description', str(message))
                print(f"[Frida][JS-Spawn-Error] {message.get('description', message)}")

        script.on('message', on_message_spawn)
        print(f"[Frida] 加载脚本(spawn模式, resume前)...")
        script.load()

        print(f"[Frida] resume进程...")
        device.resume(pid)

        wait_max = 30
        for i in range(wait_max):
            if rpc_state["ready"]:
                break
            time.sleep(1)
            if (i + 1) % 5 == 0:
                print(f"[Frida]   等待RPC(spawn)... ({i+1}/{wait_max}秒)")

        if rpc_state["ready"]:
            try:
                ping = script.exports_sync.ping()
                print(f"[Frida] spawn RPC ping: {ping}")
                if ping == "ok":
                    exports = [x for x in dir(script.exports_sync)
                               if not x.startswith('_')]
                    print(f"[Frida] RPC方法: {exports}")
                    print(f"[Frida] === spawn模式成功! ===")
                    device_scripts[device_id] = script
                    return script
            except Exception as e:
                print(f"[Frida] spawn RPC失败: {e}")

        err_info = rpc_state.get("error", "超时")
        print(f"[Frida] spawn模式也失败: {err_info}")

    except Exception as e:
        print(f"[Frida] spawn失败: {e}")

    raise Exception("所有连接方式均失败，无法获取Java运行时。请检查上方诊断信息。")


def get_script_for_device(device_id):
    if device_id in device_scripts:
        try:
            if not device_scripts[device_id].is_destroyed:
                return device_scripts[device_id]
        except Exception:
            pass

    try:
        device = try_connect_device(device_id)
        print_diagnostics(device)
        return attach_and_load(device, device_id)
    except Exception as e:
        print(f"[Frida] 连接失败: {e}")
        return None


def call_frida_rpc(device_id, method_name, *args):
    script = get_script_for_device(device_id)
    if not script:
        return {"error": f"Failed to connect to device {device_id}"}

    try:
        if not hasattr(script.exports_sync, method_name):
            available = [x for x in dir(script.exports_sync) if not x.startswith('_')]
            return {"error": f"Method '{method_name}' not found. Available: {available}"}

        method = getattr(script.exports_sync, method_name)
        result = method(*args)

        if result is None:
            return {"error": f"Method '{method_name}' returned None"}

        return result
    except frida.InvalidOperationError as e:
        if device_id in device_scripts:
            del device_scripts[device_id]
        return {"error": f"Frida connection error: {str(e)}"}
    except Exception as e:
        error_msg = str(e)
        if "detached" in error_msg.lower() or "destroyed" in error_msg.lower():
            if device_id in device_scripts:
                del device_scripts[device_id]
        return {"error": error_msg}


@app.route('/encdata', methods=['POST'])
def encdata():
    try:
        json_data = request.json.get('data')
        device_id = request.args.get('device') or request.json.get('device')

        if not json_data or not device_id:
            return jsonify({"error": "Missing 'data' or 'device' parameter"}), 400

        byte_array = list(json_data.encode("utf-8"))
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

        result = call_frida_rpc(device_id, 'nssig3', json_data)

        if isinstance(result, dict) and "error" in result:
            return jsonify(result), 500
        return jsonify({"result": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
