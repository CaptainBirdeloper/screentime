@echo off
setlocal

set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "TARGET_BAT=%STARTUP_DIR%\ScreenTimeTracker.bat"
set "PYTHONW=C:\Users\jesmi\AppData\Local\Programs\Python\Python314\pythonw.exe"
set "RUN_PY=%~dp0run.py"

echo ===================================================
echo     ScreenTime Tracker - Windows Startup Setup
echo ===================================================
echo.

if exist "%TARGET_BAT%" (
    echo [FOUND] Startup entry is currently ENABLED.
    echo.
    set /p CHOICE="Do you want to REMOVE ScreenTime from Windows Startup? (y/n): "
    if /i "%CHOICE%"=="y" (
        del "%TARGET_BAT%"
        echo [OK] Removed from Windows Startup.
    ) else (
        echo [INFO] No changes made.
    )
) else (
    echo [INFO] Startup entry is currently DISABLED.
    echo.
    set /p CHOICE="Do you want to ADD ScreenTime to Windows Startup? (y/n): "
    if /i "%CHOICE%"=="y" (
        (
            echo @echo off
            echo cd /d "%~dp0"
            echo start "" "%PYTHONW%" "%RUN_PY%"
            echo exit
        ) > "%TARGET_BAT%"
        echo [OK] Added ScreenTime to Windows Startup!
        echo Location: %TARGET_BAT%
    ) else (
        echo [INFO] No changes made.
    )
)

echo.
pause
