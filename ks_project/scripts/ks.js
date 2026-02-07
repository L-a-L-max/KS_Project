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

console.log("[Frida] === 脚本初始化 ===");
console.log("[Frida] 进程ID: " + Process.id);

function initWithRetry(maxRetries, interval) {
  var attempt = 0;

  function tryInit() {
    attempt++;
    console.log("[Frida] 初始化尝试 " + attempt + "/" + maxRetries);

    if (typeof Java === 'undefined') {
      if (attempt < maxRetries) {
        console.log("[Frida] Java对象未就绪，" + interval + "ms后重试...");
        setTimeout(tryInit, interval);
        return;
      }
      console.log("[Frida] ✗ Java对象在 " + maxRetries + " 次尝试后仍不可用");
      rpc.exports = {
        ping: function () { return "error: Java不可用"; },
        atlasencryptbytes: function () { throw "Java环境不可用"; },
        atlassignapi: function () { throw "Java环境不可用"; },
        nssig3: function () { throw "Java环境不可用"; },
      };
      send("rpc_ready");
      return;
    }

    console.log("[Frida] ✓ Java对象可用");

    Java.perform(function () {
      console.log("[Frida] ✓ Java.perform回调已执行");
      findInstanceOnce();

      setTimeout(function() {
        if (savedInstance) {
          console.log("[Frida] ✓ 安全桥接实例已找到");
        } else {
          console.log("[Frida] ⚠ 安全桥接实例未找到（将在调用时重试）");
        }
      }, 500);

      rpc.exports = {
        ping: function () {
          return "ok";
        },
        atlasencryptbytes: function (str, str2, i4, dataArray) {
          try {
            findInstanceOnce();
            if (!savedInstance) {
              throw "没有找到security bridge实例，请确保快手应用已启动";
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
              throw "没有找到security bridge实例，请确保快手应用已启动";
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

      console.log("[Frida] ✓ RPC方法已注册");
      send("rpc_ready");
    });
  }

  tryInit();
}

initWithRetry(10, 1000);

