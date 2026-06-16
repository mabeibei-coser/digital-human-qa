@echo off
chcp 65001 >nul
title 数字人演示 - 有声启动

REM ============================================================
REM  一键以「允许有声自动播放」模式全屏打开数字人演示。
REM  打开瞬间就自动播放欢迎语音，不用点任何按钮。
REM  做大屏演示 / 现场呈现就用这个。
REM
REM  要换网址：改下面 set "URL=..." 这一行。
REM    - 上线后用：  https://h100.jsai100.com/a900/
REM    - 本地测试用：http://localhost:3008
REM ============================================================

set "URL=https://h100.jsai100.com/a900/"

start "" chrome.exe --autoplay-policy=no-user-gesture-required --start-fullscreen --new-window "%URL%"

REM 没装 Chrome、想用 Edge：把上面一行前面加 REM，并去掉下面这行前面的 REM。
REM start "" msedge.exe --autoplay-policy=no-user-gesture-required --start-fullscreen --new-window "%URL%"
