# 快手金币脚本 - CentOS Stream 9 部署指南

本指南将帮助你在 CentOS Stream 9 虚拟机上部署快手金币脚本服务。

---

## 1. 基础环境安装

在 CentOS 终端中执行以下命令：

```bash
# 1. 更新系统
sudo dnf update -y

# 2. 安装 Node.js (使用 NodeSource 源安装最新 LTS 版)
curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
sudo dnf install -y nodejs

# 3. 安装 Python 3 和 pip
sudo dnf install -y python3 python3-pip

# 4. 安装 ADB (Android Platform Tools)
# 下载
wget https://dl.google.com/android/repository/platform-tools-latest-linux.zip
# 解压
sudo dnf install -y unzip
unzip platform-tools-latest-linux.zip
# 配置环境变量 (添加到 ~/.bashrc)
echo 'export PATH=$PATH:~/platform-tools' >> ~/.bashrc
source ~/.bashrc
# 验证
adb version

# 5. 安装 Git (可选，如果通过 git 拉取代码)
sudo dnf install -y git
```

---

## 2. 项目依赖安装

将 `ks_project` 文件夹上传到服务器（例如 `/home/user/ks_project`），然后进入目录：

```bash
cd ks_project

# 1. 安装 Node.js 后端依赖
npm install express axios

# 2. 安装 Python 签名服务依赖
pip3 install frida frida-tools flask
```

---

## 3. 手机端准备 (在物理机操作)

虽然服务器在虚拟机，但手机需要通过 USB 连接并直通给虚拟机。

1.  **USB 直通**：在虚拟机软件（VMware/VirtualBox）设置中，将 USB 手机设备勾选直通给 CentOS。
2.  **验证连接**：
    在 CentOS 终端输入：
    ```bash
    adb devices
    ```
    如果看到设备列表（`device` 状态），说明连接**成功**。

    > **注意**：只要 `adb devices` 显示为 `device`，哪怕 `dmesg` 日志里出现 `CD-ROM`、`USB Mass Storage` 等字样也**完全正常**（这是手机自带的驱动安装盘），请忽略这些日志，直接进行下一步。

3.  **推送 Frida Server**：
    你需要下载 `frida-server-xx.x.x-android-arm64`（版本需与 pip 安装的 frida 一致，可用 `frida --version` 查看）。
    ```bash
    ```bash
    # 推送
    adb push frida-server-arm64 /data/local/tmp/frida-server
    # 授权
    adb shell "chmod 755 /data/local/tmp/frida-server"
    # 启动 (后台运行)
    adb shell "/data/local/tmp/frida-server &"
    ```

    > **🔴 致命错误：Permission denied / unable to load SELinux policy?**
    >
    > 如果你遇到 `Permission denied` 或者 `Unable to load SELinux policy`，这说明你的手机 **没有 Root 权限**。
    >
    > **Frida Server 必须在 Root 环境下才能运行**，这是安卓系统的硬性安全限制，无法绕过。
    >
    > **解决方案 (二选一)**：
    >
    > **方案 A：使用电脑模拟器 (推荐，最稳)**
    > 1.  在 Windows 电脑上安装 **雷电模拟器 9** 或 **MuMu 模拟器 12**。
    > 2.  模拟器设置中开启 **Root 权限** (通常默认开启)。
    > 3.  模拟器设置中开启 **ADB 远程调试** (或网络桥接)。
    > 4.  在 CentOS 中使用 `adb connect <WindowsIP>:5555` 连接模拟器。
    > 5.  此方案完全符合"本地网页版"需求，且运行最稳定。
    >
    > **方案 B：在手机上安装虚拟机 App (免 Root)**
    > 1.  在你的 vivo 手机上下载安装 **[光速虚拟机 (VPhoneGaGa)](https://gsxnj.cn/)** 或 **VMOS Pro**。
    > 2.  在虚拟机 App 的设置中开启 **超级用户 (Root)**。
    > 3.  在虚拟机里安装快手极速版。
    > 4.  **难点**：你需要将 `frida-server` 放入虚拟机内部运行，并让 CentOS 连接到虚拟机内部的 ADB。
    >     *   这通常需要手机和电脑在同一 WiFi 下，使用无线调试 (`adb connect`)。
    >     *   或者在虚拟机里使用终端模拟器直接启动 frida-server。

---

## 4. 故障排查：ADB 无法识别手机

如果你执行 `adb devices` 显示为空，或者 `dmesg` 显示手机已连接但 ADB 没反应（特别是 vivo/OPPO/小米等国产手机），请按以下步骤排查。

### 1. 手机端设置（最常见原因）

1.  **开启开发者选项**：
    *   **vivo**: 设置 -> 系统管理/更多设置 -> 关于手机 -> 连续点击 **"软件版本号"** 7次。
2.  **开启 USB 调试**：
    *   进入 开发者选项 -> 开启 **"USB调试"**。
    *   **注意**：部分手机还需要开启 **"USB安全设置"**（允许模拟点击）才能运行脚本。
3.  **切换 USB 模式**（关键）：
    *   手机连接 USB 后，下拉通知栏。
    *   点击 "正在充电" 或 "USB连接方式"。
    *   选择 **"文件传输" (MTP)** 或 **"管理文件"**。
    *   *不要* 选 "仅充电"，仅充电模式下很多手机不开放 ADB 端口。
4.  **允许调试授权**：
    *   当电脑/虚拟机尝试连接时，手机屏幕会弹出 "允许 USB 调试吗？"。
    *   勾选 "始终允许来自此计算机的调试"，点击 **"确定"**。

### 2. Linux 系统配置 (udev 规则)

如果手机设置正确但 CentOS 仍无法识别，通常是因为 Linux 缺少设备权限规则。

1.  **查看 USB 厂商 ID**：
    在终端执行 `lsusb`（如果没有该命令，执行 `dnf install usbutils`）。
    或者查看 `dmesg` 输出，找到 `idVendor`。
    *   例如 vivo 的 idVendor 通常是 `2d95`。
    *   小米: `2717` / `18d1`
    *   华为: `12d1`

2.  **添加 udev 规则**：
    创建或编辑规则文件：
    ```bash
    sudo vi /etc/udev/rules.d/51-android.rules
    ```
    添加以下内容（将 `2d95` 替换为你的手机厂商 ID）：
    ```properties
    SUBSYSTEM=="usb", ATTR{idVendor}=="2d95", MODE="0666", GROUP="plugdev"
    ```

3.  **重载规则并重启 ADB**：
    ```bash
    sudo udevadm control --reload-rules
    sudo udevadm trigger
    
    adb kill-server
    adb start-server
    adb devices
    ```

---

## 5. 启动服务

建议使用 `tmux` 或 `screen` 来保持服务后台运行，或者配置为 systemd 服务。

### 方式 A：直接运行 (测试用)

**终端 1：启动签名服务**
```bash
cd ks_project/scripts
python3 ksapi.py
# 输出: Running on http://0.0.0.0:5000
```

**终端 2：启动 Web 控制台**
```bash
cd ks_project
node server.js
# 输出: Web console running at http://localhost:3000
```

### 方式 B：使用 PM2 管理 (推荐)

```bash
# 安装 PM2
sudo npm install -g pm2

# 启动 Web 后端
cd ks_project
pm2 start server.js --name "ks-web"

# 启动 Python 服务 (PM2 也能管 Python)
pm2 start "python3 scripts/ksapi.py" --name "ks-api"

# 保存开机自启
pm2 save
pm2 startup
```

---

## 5. 访问控制台

1.  查看虚拟机 IP：
    ```bash
    ip addr
    ```
2.  在宿主机（Windows）浏览器打开：
    `http://<虚拟机IP>:3000`

---

## 常见问题

*   **防火墙拦截**：如果不通，尝试放行端口或关闭防火墙（测试环境）。
    ```bash
    sudo systemctl stop firewalld
    ```
*   **ADB 掉线**：USB 直通有时不稳定，重新插拔或重启 adb server (`adb kill-server && adb start-server`)。
*   **Frida 连接失败**：确认手机上 `frida-server` 正在运行 (`adb shell ps | grep frida`)。
