@echo off
title 【安装依赖】请以管理员身份运行

echo.
echo 正在安装 Python 依赖...
echo.

pip install -r requirements.txt

echo.
echo ✅ 安装完成！
echo.
echo 请确保已安装 ADB 工具（Android Platform Tools）
echo 并将 adb 所在目录添加到系统 PATH 环境变量。
echo.
echo 打开手机「开发者选项」和「USB调试」，连接电脑。
echo.
pause