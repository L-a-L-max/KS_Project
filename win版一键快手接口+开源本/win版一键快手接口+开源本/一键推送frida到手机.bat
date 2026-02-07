@echo off
title 【推送 Frida Server】到手机

echo.
echo 正在检查设备连接...
adb devices

echo.
echo 正在推送 frida-server 到手机 /data/local/tmp/
adb push assets/frida-server-arm64 /data/local/tmp/frida-server

echo 设置权限...
adb shell chmod 755 /data/local/tmp/frida-server

echo 启动 Frida Server（后台运行）...
adb shell nohup /data/local/tmp/frida-server > /dev/null 2>&1 &

echo.
echo ✅ Frida Server 已推送并启动！
echo 提示：每次重启手机后需重新运行此脚本。
echo.
pause