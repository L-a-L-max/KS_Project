import frida
import time
import json
from flask import Flask, request, jsonify
import base64
#frida rpc远程调用 提供接口 具体传参自己找一下
app = Flask(__name__)
# 连接到设备
device = frida.get_usb_device()
session = device.attach("快手极速版")

# 加载脚本
with open("ks.js", "r", encoding="utf-8") as f:
    script_code = f.read()

script = session.create_script(script_code)
script.load()

def call_atlasEncrypt(str_):
    try:
        # 将 JSON 字符串转换为字节数组（UTF-8）
        byte_array = list(str_.encode("utf-8"))

        # 调用 RPC
        result = script.exports_sync.atlasencryptbytes(
            "KwaiAdAwardVideo", 
            "95147564-9763-4413-a937-6f0e3c12caf1", 
            0, 
            byte_array
        )
        return result
    except Exception as e:
        return {"error": str(e)}
def call_atlasSign(str_):
    try: 
        result = script.exports_sync.atlassignapi(
          "KwaiAdAwardVideo", 
            "95147564-9763-4413-a937-6f0e3c12caf1", 
            0, 
            str_
        )
        
        return result
    except Exception as e:
        return {"error": str(e)}
def call_nssig3(str_):
    try: 
        result = script.exports_sync.nssig3(
            str_
        )
        return result
    except Exception as e:
        return {"error": str(e)}
@app.route('/encdata', methods=['POST'])
def frida_rpc_endpoint():
    try:
        # 获取请求参数
        json_data = request.json.get('data')
        if json_data is None:
            return jsonify({"error": "Missing 'data' parameter"}), 400

        # 调用 Frida RPC
        result = call_atlasEncrypt(json_data)

        # 判断 result 是否异常
        if isinstance(result, dict) and "error" in result:
            return jsonify(result), 500

        # 字节数组转换为 bytes
        result_bytes = bytes([b & 0xFF for b in result])

        # 转换为 base64 字符串
        result_b64 = base64.b64encode(result_bytes).decode('utf-8')

        return jsonify({"result": result_b64})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/sign', methods=['POST'])
def frida_rpc_endpoint_sign():
    try:
        # 获取请求参数
        json_data = request.json.get('data')
        if json_data is None:
            return jsonify({"error": "Missing 'data' parameter"}), 400

        # 调用 Frida RPC
        result = call_atlasSign(json_data)
        
        # 判断 result 是否异常
        if isinstance(result, dict) and "error" in result:
            return jsonify(result), 500
        return jsonify({"result": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/nssig3', methods=['POST'])
def frida_rpc_endpoint_nssig3():
    try:
        # 获取请求参数
        json_data = request.json.get('data')
        if json_data is None:
            return jsonify({"error": "Missing 'data' parameter"}), 400

        # 调用 Frida RPC
        result = call_nssig3(json_data)
        
        # 判断 result 是否异常
        if isinstance(result, dict) and "error" in result:
            return jsonify(result), 500
        return jsonify({"result": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    
    app.run(host='0.0.0.0', port=5000)