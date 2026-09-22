@echo off
:: Launch ScreenTime Tracker silently without a persistent console window
cd /d "%~dp0"
start "" "C:\Users\jesmi\AppData\Local\Programs\Python\Python314\pythonw.exe" "%~dp0run.py"
exit
