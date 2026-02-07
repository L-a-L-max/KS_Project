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
console.log("[Frida] Process.platform: " + Process.platform);
console.log("[Frida] Frida.version: " + Frida.version);

var modules = Process.enumerateModules();
console.log("[Frida] 模块总数: " + modules.length);
var artFound = false;
for (var i = 0; i < modules.length; i++) {
  var n = modules[i].name.toLowerCase();
  if (n.indexOf("libart") !== -1 || n.indexOf("libdvm") !== -1 ||
      n.indexOf("dalvik") !== -1) {
    console.log("[Frida] Java模块: " + modules[i].name + " @ " + modules[i].base);
    artFound = true;
  }
}
if (!artFound) {
  console.log("[Frida] *** 未找到libart/libdvm模块! 这说明当前进程没有加载Java VM ***");
  console.log("[Frida] *** 可能原因: 1.frida-server架构不匹配 2.进程不是Java进程 3.frida版本不匹配 ***");
}

console.log("[Frida] typeof Java = " + typeof Java);

if (typeof Java !== 'undefined') {
  console.log("[Frida] Java.available = " + Java.available);
} else {
  console.log("[Frida] *** Java对象未定义 ***");
  console.log("[Frida] 前10个模块:");
  for (var j = 0; j < Math.min(10, modules.length); j++) {
    console.log("[Frida]   " + modules[j].name + " (" + modules[j].base + ", " + modules[j].size + ")");
  }
}

try {
  Java.perform(function () {
    console.log("[Frida] Java.perform回调已执行");
    findInstanceOnce();

    setTimeout(function () {
      if (savedInstance) {
        console.log("[Frida] 安全桥接实例已找到");
      } else {
        console.log("[Frida] 安全桥接实例未找到（将在调用时重试）");
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
} catch (e) {
  console.log("[Frida] *** Java.perform失败: " + e + " ***");
  if (e.stack) {
    console.log("[Frida] 堆栈: " + e.stack);
  }
  console.log("[Frida] 注册错误回退RPC...");
  rpc.exports = {
    ping: function () {
      return "error: Java不可用 - " + e;
    },
    atlasencryptbytes: function () {
      throw "Java不可用: " + e;
    },
    atlassignapi: function () {
      throw "Java不可用: " + e;
    },
    nssig3: function () {
      throw "Java不可用: " + e;
    },
  };
  send("rpc_ready");
}
