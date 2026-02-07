# 雷电模拟器接入 CentOS 部署指南

本指南专注于**雷电模拟器 (LDPlayer)** 与 **CentOS Stream 9** 虚拟机的配合使用，实现快手金币脚本的自动化运行。

---

## 1. 架构说明

*   **Windows 宿主机**：运行雷电模拟器，提供 Android 环境（自带 Root）。
*   **CentOS 虚拟机**：运行核心业务脚本、Python 签名服务、Web 控制台。
*   **连接方式**：CentOS 通过 ADB 网络调试连接 Windows 上的雷电模拟器。

---

## 2. Windows 端准备 (雷电模拟器)

### 2.1 安装与配置
1.  下载并安装 **雷电模拟器 9** (推荐 Android 9 版本，兼容性好)。
2.  打开模拟器设置：
    *   **性能设置**：建议 2核 4G 以上。
    *   **其他设置**：开启 **Root 权限** (必须开启)。
    *   **网络设置**：开启 **网络桥接模式** (可选，如果开启桥接，模拟器会有独立 IP；如果不开启，使用 NAT 模式连接宿主机 IP 端口)。
        *   *推荐模式*：**默认 NAT 模式**。此时 ADB 连接地址为 `Windows宿主机IP:5555`。

### 2.2 安装应用
1.  在模拟器中安装 **快手极速版**。
2.  (可选) 安装 **HttpCanary** 或其他抓包工具，用于获取 Cookie。

### 2.3 确认 ADB 端口
雷电模拟器默认 ADB 端口通常为 **5555** (第一个实例) 或 **7555**。
在 Windows 命令行 (CMD) 输入 `netstat -ano | findstr 5555` 确认端口监听。

---

## 3. CentOS 环境安装

在 CentOS 终端中执行以下命令安装必要软件：

```bash
# 1. 更新系统
sudo dnf update -y

# 2. 安装 Node.js (Web 控制台环境)
curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
sudo dnf install -y nodejs

# 3. 安装 Python 3 和 pip (签名服务环境)
sudo dnf install -y python3 python3-pip

# 4. 安装 ADB (用于连接模拟器)
wget https://dl.google.com/android/repository/platform-tools-latest-linux.zip
sudo dnf install -y unzip
unzip platform-tools-latest-linux.zip
echo 'export PATH=$PATH:~/platform-tools' >> ~/.bashrc
source ~/.bashrc

# 验证安装
node -v
python3 --version
adb version
```

---

## 4. 部署项目代码

1.  将 `ks_project` 文件夹上传到 CentOS 服务器（例如 `/home/user/ks_project`）。
2.  安装项目依赖：

```bash
cd ks_project

# 安装 Node.js 依赖
npm install express axios

# 安装 Python 依赖
pip3 install frida frida-tools flask
```

---

## 5. 连接雷电模拟器

### 5.1 建立 ADB 连接
确保 Windows 和 CentOS 网络互通（通常虚拟机网络模式为 NAT 或 桥接均可，只要能 ping 通 Windows IP）。

1.  获取 Windows 宿主机 IP（在 Windows CMD 输入 `ipconfig` 查看，例如 `192.168.1.100`）。
2.  在 CentOS 中连接：
    ```bash
    # 替换为你的 Windows IP
    adb connect 192.168.11.56:5555
    ```
3.  验证连接：
    ```bash
    adb devices
    ```
    应该看到类似 `192.168.11.56:5555 device` 的输出。

### 5.2 部署 Frida Server

由于雷电模拟器通常是 x86 架构运行 Android，但为了兼容性通常会有 arm 转换层。
**关键**：推荐使用与模拟器架构匹配的 `frida-server`。
*   如果 `adb shell getprop ro.product.cpu.abi` 返回 `x86` 或 `x86_64`，建议使用 `frida-server-xx-android-x86` (或 x86_64)。
*   雷电 9 默认是 64 位，通常可以使用 `frida-server-android-x86_64`。

1.  **下载 Frida Server**：
    *   在 CentOS 上下载对应版本的 server (版本需与 `pip show frida` 显示的一致)。
    *   下载地址：https://github.com/frida/frida/releases

2.  **推送并启动**：
    ```bash
    # 1. 检查模拟器架构 (雷电9通常是 x86_64)
    adb shell getprop ro.product.cpu.abi
    # 如果输出 x86_64，请务必下载 frida-server-android-x86_64
    # 如果输出 arm64-v8a，才使用 arm64 版本 (极少见)

    # 2. 推送 (以 x86_64 为例)
    adb push frida-server-x86_64 /data/local/tmp/frida-server
    
    # 3. 授权
    adb shell "chmod 755 /data/local/tmp/frida-server"
    
    # 4. 启动 (必须使用 su -c 获取 Root 权限，并指定监听端口)
    # 关键：加上 -l 0.0.0.0:27042 确保监听所有网络接口
    # 注意：命令必须用单引号包裹，防止 su 解析错误
    adb shell "su -c '/data/local/tmp/frida-server -l 0.0.0.0:27042 &'"
    ```

3.  **验证 Frida**：
    由于 frida-ps -H 是走 TCP 连接，需要确保端口转发或网络直通。
    
    **推荐使用 adb 转发模式 (最稳)**：
    ```bash
    # 1. 设置端口转发 (将模拟器的 27042 端口转发到 CentOS 的 27042)
    adb forward tcp:27042 tcp:27042
    ```

4.  **数据抓取与配置 (关键步骤)**

    你询问是否可以使用 **Wireshark** 在 Windows 抓包。
    *   **答案**：可以使用，**但是不推荐**。
    *   **原因**：快手的数据全是 HTTPS 加密的，Wireshark 只能看到乱码（TLS加密数据），看不到关键的 Cookie 和 Token。
    *   **推荐方案**：你的模拟器中已经安装了 **HttpCanary** (小黄鸟)，这是最方便的工具！或者在 Windows 上使用 **Fiddler Classic / Charles** 并配置模拟器代理。

    **使用 HttpCanary 抓取关键数据：**
    1.  打开 HttpCanary，点击右下角飞机图标开始抓包。
    2.  打开快手极速版，**必须登录账号**，然后刷几个视频，点进“去赚钱”或“金币”页面（确保产生业务请求）。
    3.  返回 HttpCanary，停止抓包。
    4.  **筛选与查找**：
        *   在右上角菜单中选择“搜索”或“筛选”。
        *   搜索关键词：`api_st` 或 `kuaishou.api_st`。
        *   或者筛选域名：`api.kuaishou.com` 或 `api.e.kuaishou.com`。
    5.  **查看请求详情**：
        *   点击任意一个包含上述关键词的请求（通常是 POST 或 GET 请求）。
        *   查看 **Overview (概览)** 里的 URL 参数，或者 **Request (请求)** 里的 **Cookie** 和 **Header**。
    6.  **提取以下 5 个核心参数**：
        *   **`kuaishou.api_st`**: (最重要) 通常在 Cookie 中，形如 `kuaishou.api_st=xxxx...;`。
        *   **`uid`**: 用户 ID，通常在 Cookie 或 URL 参数中。
        *   **`did`**: 设备 ID (android_id 或 device_id)，在 URL 参数或 Body 中常见。
        *   **`egid`**: 在 Cookie 或 URL 参数中。
        *   **`salt`**: 这个参数通常用于签名计算。
            *   *技巧*：如果不确定 salt 是什么，可以先随便填一个字符串（例如 `3829` 或 `salt`），很多时候脚本会自动处理或它不是强校验的。如果脚本运行报错提示签名错误，再尝试从 URL 参数中找 `salt` 或 `__NS_sig3` 相关的字段。

    **参数拼凑格式**：
    将提取到的值按以下顺序拼接（注意中间的 `#` 号）：
    ```text
    salt值#kuaishou.api_st=你的st值#uid值#egid值#did值
    ```
    *示例*：
    `3829#kuaishou.api_st=Cp8B...#12345678#DF88...#ANDROID_...`

    **关于 CID/SID/PHID**：
    *   你可能会看到配置文件里有 `cid`, `sid`, `phid` 字段。
    *   **放心**：目前的脚本会自动从服务器获取任务信息（动态获取 CID），所以配置文件里的这三个字段**留空即可**，只要上面的 Cookie 串配置正确就能跑。

    **配置项目：**
    在 `ks_project/config/config.json` 中填入：

    ```json
    {
      "accounts": [
        {
          "cookie": "你的salt#kuaishou.api_st=xxx#uid#egid#did",
          "cid": "",
          "sid": "",
          "phid": ""
        }
      ],
      ...
    }
    ```

    ### 常见问题：HttpCanary Root 权限获取失败
    **HttpCanary 确实需要 Root 权限** 才能将证书安装到系统目录（Android 7+ 解密 HTTPS 必须步骤）。
    如果遇到 Root 授权问题：
    1.  确保雷电模拟器设置中已开启 **Root 权限**（设置 -> 其他设置 -> Root权限 -> 开启）。
    2.  确保在 HttpCanary 首次请求 Root 时点击了 **"允许"**（且勾选"永久记住"）。
    3.  如果错过了弹窗，请进入雷电模拟器的 **设置 -> 其它 -> Root权限管理**（或 SuperSU App），手动给 HttpCanary 授权。
    4.  如果依然无法使用，请尝试下面的 **Fiddler PC 抓包方案**。

5.  **替代方案：使用 Fiddler (PC端) 抓包**

    如果你更习惯在 Windows 上操作，可以使用 Fiddler Classic。

    1.  **电脑端设置**：
        *   安装 Fiddler Classic。
        *   菜单栏 `Tools` -> `Options` -> `HTTPS` -> 勾选 `Decrypt HTTPS traffic`。
        *   菜单栏 `Tools` -> `Options` -> `Connections` -> 勾选 `Allow remote computers to connect` -> 端口默认为 `8888`。
        *   重启 Fiddler。
        *   查看本机 IP (例如 `192.168.1.5`)。

    2.  **模拟器设置**：
        *   设置 -> WiFi -> 修改网络 -> 高级选项 -> 代理: `手动`。
        *   主机名: `你的电脑IP` (如 192.168.1.5)。
        *   端口: `8888`。
        *   保存。

    3.  **安装证书**：
        *   模拟器浏览器访问 `http://ipv4.fiddler:8888`。
        *   点击 `FiddlerRoot certificate` 下载并安装。
        *   名称随便填，凭据用途选 `VPN和应用`。
        *   **注意**：Android 7+ 用户证书默认无效。如果快手抓不到包（显示 unknown），需要将证书移动到系统目录，或者使用 Frida 脚本绕过 SSL Pinning（较为复杂）。
        *   **最简单的办法**：还是尽量搞定 HttpCanary 的 Root 权限，它会自动处理证书移动的问题。

6.  **验证 Frida 连接** (接回原步骤)

    
    # 2. 连接测试 (使用 -U 参数，表示连接 USB/ADB 设备)
    frida-ps -U
    ```
    如果列出了进程列表，说明 Frida 部署成功。

    > **注意**：如果必须使用 `-H` 远程连接（例如 ksapi.py 代码里用的是 RemoteDevice），则需要在启动 server 时指定 `-l 0.0.0.0:27042`，并且确保模拟器网络允许入站。但通常我们建议配合 `adb forward` 使用本地模式。

---

## 6. 获取账号参数 (Cookie)

你需要从模拟器里的快手 App 抓取以下参数：
*   **api_st** (Cookie 中的登录凭证)
*   **uid** (用户 ID)
*   **egid** (设备指纹)
*   **did** (设备 ID)

### 获取方法
1.  **安装抓包工具**：在雷电模拟器里安装 **HttpCanary**。
2.  **配置证书**：HttpCanary 设置 -> SSL 证书设置 -> 安装根证书 (雷电已 Root，直接移动到系统目录即可)。
3.  **开始抓包**：启动抓包，打开快手极速版，刷新首页视频或进入任务中心。
4.  **查找请求**：
    *   过滤域名 `api.e.kuaishou.com`。
    *   查看请求头 (Headers) -> `Cookie` -> 复制 `kuaishou.api_st=xxxxxxx`。
    *   查看 URL 参数 (Query) -> 复制 `egid=xxxx` 和 `did=xxxx`。
    *   如果没找到 `did`，可以用 ADB 获取 Android ID 代替：
        ```bash
        adb shell settings get secure android_id
        ```

### 拼装最终 Cookie 字符串
格式：`salt#kuaishou.api_st=XXX#uid#egid#did`
*   **salt**: 固定填 `95147564-9763-4413-a937-6f0e3c12caf1`
*   **示例**:
    `95147564-9763-4413-a937-6f0e3c12caf1#kuaishou.api_st=AbC123...#123456#DF88...#abcd...`

---

## 7. 启动服务与运行

### 7.1 启动后端
推荐使用 PM2 管理进程（CentOS 中执行）：

```bash
# 安装 PM2
sudo npm install -g pm2

cd ks_project

# 启动 Web 控制台
pm2 start server.js --name "ks-web"

# 启动 Python 签名服务
pm2 start "python3 scripts/ksapi.py" --name "ks-api"

# 查看状态
pm2 list
```

### 7.2 Web 控制台操作
1.  在 Windows 浏览器打开 `http://<CentOS_IP>:3000`。
2.  **添加账号**：
    *   粘贴上面拼装好的 **Cookie (ks)**。
    *   Client ID / Secret ID 留空。
    *   **运行设备**：下拉选择连接的模拟器 (如 `192.168.1.100:5555`)。
3.  **启动**：点击启动按钮。
4.  **观察日志**：如果显示 `获取本地签名成功` -> `任务获取成功` -> `获得金币`，即大功告成！

---

## 8. 常见问题排查

*   **ADB 连接失败 (Connection refused)**：
    *   检查 Windows 防火墙是否允许雷电模拟器端口 (5555/TCP) 通信。
    *   确认模拟器已启动。
*   **Frida 报错 (Unable to load SELinux policy)**：
    *   这是因为使用了错误的 frida-server 版本或模拟器未开启 Root。雷电 9 默认开启 Root，请检查是否使用了 arm64 的 server 但模拟器是 x86 架构。尝试换用 `frida-server-android-x86_64`。
*   **Web 显示 "未检测到设备"**：
    *   在 CentOS 终端手动执行 `adb devices` 确认连接状态。若断开，重新执行 `adb connect`。
