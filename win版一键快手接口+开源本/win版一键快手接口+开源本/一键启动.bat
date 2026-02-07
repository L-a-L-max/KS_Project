@echo off
title 【快手签名服务】正在启动...

:: 检查 ADB 是否可用
for /f "skip=1 tokens=*" %%i in ('adb devices 2^>nul') do (
    set "line=%%i"
    if /i not "%%i"=="List of devices attached" (
        if not "%%i"=="" (
            goto adb_connected
        )
    )
)

echo.
echo ❌ 未检测到设备！请检查：
echo    1. 手机是否连接电脑
echo    2. 是否开启「USB调试」
echo    3. 手机是否弹出「允许USB调试？」提示
echo.
pause
exit

:adb_connected
echo ✅ 检测到设备，正在启动服务...

:: 检查快手极速版是否运行
adb shell "ps | grep com.kuaishou.nebula" >nul
if errorlevel 1 (
    echo.
    echo ⚠️ 未检测到快手极速版运行，正在尝试启动...
    adb shell am start -n com.kuaishou.nebula/com.yx.kwai.splash.SplashActivity >nul
    timeout /t 5 >nul
)

echo.
echo 🚀 启动 Flask 服务...
echo 服务地址：http://localhost:5000
echo.
echo 支持接口：
echo   POST /encdata   -> atlasEncrypt
echo   POST /sign      -> atlasSign
echo   POST /nssig3    -> atlasSign2 (nssig3)
echo.
python ksapi.py

if errorlevel 1 (
    echo.
    echo ❌ 启动失败，请检查：
    echo    1. 手机是否解锁并允许调试
    echo    2. 快手极速版是否正在运行
    echo    3. Frida Server 是否已启动（运行 push_frida.bat）
    echo    4. ks.js 是否正确导出函数
    echo.
    pause
)