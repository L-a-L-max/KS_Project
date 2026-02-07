import Java from "frida-java-bridge";

var savedInstance = null;

function findInstanceOnce() {
  if (!savedInstance) {
    try {
      Java.choose("com.kuaishou.android.security.bridge.middleware.a", {
        onMatch: function (instance) {
          savedInstance = instance;
          console.log("[Frida] Found security bridge instance");
        },
        onComplete: function () {},
      });
    } catch (e) {
      console.log("[Frida] Error in findInstanceOnce: " + e);
    }
  }
}

console.log("[Frida] === ks.js 脚本开始加载 ===");
console.log("[Frida] Process.id: " + Process.id);
console.log("[Frida] Process.arch: " + Process.arch);
console.log("[Frida] Frida.version: " + Frida.version);
console.log("[Frida] Java.available: " + Java.available);

Java.perform(function () {
  console.log("[Frida] Java.perform回调已执行");
  findInstanceOnce();

  rpc.exports = {
    ping: function () {
      return "ok";
    },
    atlasencryptbytes: function (str, str2, i4, dataArray) {
      try {
        findInstanceOnce();
        if (!savedInstance) {
          throw "没有找到security bridge实例";
        }
        var byteArray = Java.array("byte", dataArray);
        var result = savedInstance.atlasEncrypt(str, str2, parseInt(i4), byteArray);
        return result;
      } catch (e) {
        console.log("[Frida] atlasencryptbytes错误: " + e);
        throw e;
      }
    },
    atlassignapi: function (str, str2, i4, str3) {
      try {
        findInstanceOnce();
        if (!savedInstance) {
          throw "没有找到security bridge实例";
        }
        var result = savedInstance.atlasSign(str, str2, parseInt(i4), str3);
        return result;
      } catch (e) {
        console.log("[Frida] atlassignapi错误: " + e);
        throw e;
      }
    },
    nssig3: function (obj0) {
      try {
        var KSecurity = Java.use("com.kuaishou.android.security.KSecurity");
        var res = KSecurity.atlasSign(obj0);
        return res;
      } catch (e) {
        console.log("[Frida] nssig3错误: " + e);
        throw e;
      }
    },
  };

  console.log("[Frida] RPC方法已注册");
  send("rpc_ready");
});
