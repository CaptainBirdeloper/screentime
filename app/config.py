"""Configuration settings for ScreenTime Tracker."""

import os
from pathlib import Path

# Project paths - all application data is confined strictly to the project directory
PROJECT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_DIR / "data"
DB_PATH = DATA_DIR / "screentime.db"
WEB_DIR = PROJECT_DIR / "app" / "web"

# Ensure data directory exists
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Tracking parameters
# Aligned to Windows power setting: 5 minutes plugged-in display off timeout
DISPLAY_TIMEOUT_SECONDS = 300.0  # 5 minutes
HEARTBEAT_INTERVAL_SECONDS = 15.0  # Periodic database flush to prevent data loss
POLL_INTERVAL_SECONDS = 1.0  # 1 Hz low-overhead foreground window polling

# Web server configuration
SERVER_HOST = "127.0.0.1"
DEFAULT_SERVER_PORT = 54321

# Startup configuration
APPDATA = os.environ.get("APPDATA", "")
STARTUP_FOLDER = (
    Path(APPDATA) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup"
    if APPDATA
    else None
)
STARTUP_BAT_PATH = STARTUP_FOLDER / "ScreenTimeTracker.bat" if STARTUP_FOLDER else None
