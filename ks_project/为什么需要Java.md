# 为什么Frida脚本需要Java环境？

## 问题说明

你遇到的错误 `ReferenceError: 'Java' is not defined` 是因为Frida脚本尝试访问Java运行时，但附加的进程不是Java进程。

## 为什么需要Java？

### 1. Android应用架构
- Android应用是用 **Java/Kotlin** 编写的
- 快手的加密算法（`atlasEncrypt`, `atlasSign`）是在 **Java代码** 中实现的
- 这些算法位于类 `com.kuaishou.android.security.bridge.middleware.a` 中

### 2. Frida的工作原理
- Frida通过 **Java桥接（Java Bridge）** 来访问Android应用的Java运行时
- `Java.perform()` 是Frida提供的API，用于在Java运行时中执行代码
- 只有附加到 **包含Java运行时的进程** 时，`Java` 对象才可用

### 3. 快手应用的多进程架构
快手应用使用多进程架构：
- **主进程**：`com.kuaishou.nebula` - 包含Java运行时，有加密算法
- **UI进程**：`快手极速版` - 可能只是UI渲染进程，不包含Java运行时
- **子进程**：`com.kuaishou.nebula:kwv_utils_process` 等 - 特定功能的子进程

## 解决方案

### 已修复的问题
我已经修改了进程查找逻辑，现在会：
1. **优先查找** `com.kuaishou.nebula` 主进程（包含Java运行时）
2. 如果找不到，再查找其他包含"kuaishou"的主进程
3. 最后才查找UI进程（作为备选）

### 验证方法
重启服务后，你应该看到：
```
[Frida] Found priority process: com.kuaishou.nebula (PID: xxxx)
[Frida] Attaching to process: com.kuaishou.nebula (PID: xxxx)
[Frida] Successfully attached to com.kuaishou.nebula
[Frida] Java.perform callback executed
[Frida] RPC exports registered
```

而不是：
```
[Frida] Found UI process (may not be Java): 快手极速版 (PID: xxxx)
```

## 如果仍然失败

如果附加到 `com.kuaishou.nebula` 后仍然出现 `Java is not defined`，可能的原因：

1. **Java运行时未初始化**
   - 等待应用完全启动（进入主界面后等待10-20秒）
   - 确保应用不是处于后台或休眠状态

2. **Frida版本不兼容**
   - 检查Frida版本：`frida --version`
   - 确保手机上的 `frida-server` 版本与Python的 `frida` 版本一致

3. **进程权限问题**
   - 确保使用root权限运行 `frida-server`
   - 检查 `adb shell "su -c 'ps | grep frida'"` 确认frida-server在运行

## 测试步骤

1. **确认主进程存在**：
   ```bash
   frida-ps -U | grep nebula
   # 应该看到: com.kuaishou.nebula
   ```

2. **重启签名服务**：
   ```bash
   cd ks_project/scripts
   python3 ksapi.py
   ```

3. **查看日志**，确认附加到了正确的进程

