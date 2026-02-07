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

// 诊断：检查Java是否可用
console.log("[Frida] === 脚本初始化诊断 ===");
console.log("[Frida] 检查Java对象是否可用...");

try {
  // 直接尝试使用Java（如果不可用会立即失败，不需要等待）
  if (typeof Java === 'undefined') {
    throw "Java对象未定义 - 附加的进程不包含Java运行时";
  }
  
  console.log("[Frida] ✓ Java对象可用");
  console.log("[Frida] 调用Java.perform...");
  
  Java.perform(function () {
    console.log("[Frida] ✓ Java.perform回调已执行");
    console.log("[Frida] 开始查找安全桥接实例...");
    
    findInstanceOnce(); // 只查找一次实例
    
    // 等待一小段时间让Java.choose完成
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
          findInstanceOnce(); // 再次确保实例已查找（如果热重载）
          if (!savedInstance) {
            throw "没有找到com.kuaishou.android.security.bridge.middleware.a实例，请确保快手应用已启动";
          }
          var byteArray = Java.array("byte", dataArray);
          var result = savedInstance.atlasEncrypt(str, str2, parseInt(i4), byteArray);
          return result;
        } catch (e) {
          console.log("[Frida] atlasencryptbytes RPC错误: " + e);
          throw e;
        }
      },
      atlassignapi: function (str, str2, i4, str3) {
        try {
          findInstanceOnce(); // 再次确保实例已查找（如果热重载）
          if (!savedInstance) {
            throw "没有找到com.kuaishou.android.security.bridge.middleware.a实例，请确保快手应用已启动";
          }
          var result = savedInstance.atlasSign(str, str2, parseInt(i4), str3);
          return result;
        } catch (e) {
          console.log("[Frida] atlassignapi RPC错误: " + e);
          throw e;
        }
      },
      nssig3: function (obj0) {
        try {
          var KSecurity = Java.use("com.kuaishou.android.security.KSecurity");
          let res = KSecurity.atlasSign(obj0);
          return res;
        } catch (e) {
          console.log("[Frida] nssig3错误: " + e);
          if (e.stack) {
            console.log("[Frida] nssig3堆栈: " + e.stack);
          }
          throw e;
        }
      },
    };

    console.log("[Frida] ✓ RPC方法已注册");
    send("rpc_ready");
  });
} catch (e) {
  console.log("[Frida] ✗ 脚本初始化错误: " + e);
  console.log("[Frida] 错误堆栈: " + (e.stack || "无堆栈信息"));
  console.log("[Frida] 错误类型: " + (typeof e));
  
  // 诊断信息
  console.log("[Frida] === 诊断信息 ===");
  console.log("[Frida] Java对象类型: " + typeof Java);
  console.log("[Frida] 当前进程信息: " + Process.id);
  console.log("[Frida] 进程名称: " + Process.getCurrentDir());
  
  // 即使Java不可用，也导出RPC方法以便诊断
  rpc.exports = {
    ping: function () {
      return "error: Java不可用 - " + e;
    },
    atlasencryptbytes: function () {
      throw "Java环境不可用: " + e + "。请确保附加到包含Java运行时的进程（通常是'快手极速版'或com.kuaishou.nebula主进程）";
    },
    atlassignapi: function () {
      throw "Java环境不可用: " + e;
    },
    nssig3: function () {
      throw "Java环境不可用: " + e;
    },
  };
  send("rpc_ready");
}

