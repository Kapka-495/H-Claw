@echo off
chcp 65001 >nul
cd /d "C:\Users\hongzikang\Desktop\hzkclaw"
set AGENT_ID=worker-%random%
npx tsx entries/orch.ts --worker
pause
