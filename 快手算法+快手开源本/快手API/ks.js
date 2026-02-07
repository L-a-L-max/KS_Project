var savedInstance = null;

function findInstanceOnce() {
  if (!savedInstance) {
    Java.choose("com.kuaishou.android.security.bridge.middleware.a", {
      onMatch: function (instance) {
        savedInstance = instance;
      },
      onComplete: function () {},
    });
  }
}

Java.perform(function () {
  findInstanceOnce(); // 只查找一次实例

  rpc.exports = {
    atlasencryptbytes: function (str, str2, i4, dataArray) {
      try {
        findInstanceOnce(); // 再次确保实例已查找（如果热重载）
        if (!savedInstance) {
          throw "没有找到实例";
        }
        var byteArray = Java.array("byte", dataArray);
        // 记录开始时间
        var result = savedInstance.atlasEncrypt(
          str,
          str2,
          parseInt(i4),
          byteArray
        );
        // 仅在参数匹配时打印耗时

        return result;
      } catch (e) {
        console.log("RPC 错误: " + e);
        return null;
      }
    },
    atlassignapi: function (str, str2, i4, str3) {
      findInstanceOnce(); // 再次确保实例已查找（如果热重载）
      if (!savedInstance) {
        throw "没有找到实例";
      }
      var result = savedInstance.atlasSign(str, str2, parseInt(i4), str3);
      return result;
    },
    nssig3: function (obj0) {
      try {
        var KSecurity = Java.use("com.kuaishou.android.security.KSecurity");
        let res = KSecurity.atlasSign(obj0);
        return res;
      } catch (e) {
        console.log("nssig3 错误: " + e);
        console.log(e.stack);
        return null;
      }
    },
  };
});
