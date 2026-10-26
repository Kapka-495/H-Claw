@echo off
chcp 65001 >nul
cd /d "C:\Users\hongzikang\Desktop\hzkclaw"
echo 用法:
echo   Leader 窗口:  双击本文件
echo   Worker 窗口:  新开终端，敲: npx tsx entries/orch.ts --worker
echo.
echo 在新终端中启动 Workers 后，回到这里输入任务。
echo.
npx tsx entries/orch.ts
