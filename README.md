# ScreenTime Tracker & Offline Dashboard

A high-performance, lightweight background screen time tracker for Windows that records active application focus time in the background, docks into the system tray, and serves an on-demand barebones offline dashboard built with pure HTML, CSS, and JavaScript.

---

## Key Features

- **Transition-Based Session Tracking**: Captures the exact moment an app gains focus ($T_{\text{start}}$) and switches/closes ($T_{\text{end}}$), accumulating $\Delta T = T_{\text{end}} - T_{\text{start}}$ per application.
- **5-Minute Display Sleep Protection**: Aligned with Windows display-off settings. When mouse/keyboard inactivity reaches 5 minutes ($300\text{s}$), the active session is paused and capped at the moment inactivity began—preventing phantom screen time when you step away or your PC sleeps.
- **Heartbeat Checkpointing**: Flushes running time every 15 seconds so no data is lost on unexpected system restarts.
- **Zero Framework Dashboard**: 100% vanilla HTML5, barebones CSS, and vanilla JS with native SVG charts. Completely offline with zero npm or external CDN dependencies.
- **System Tray Controls**:
  - Right-click menu with live status, Today's total screen time, and "Open Dashboard".
  - Pause / Resume tracking toggle.
  - "Start with Windows" toggle.
  - Clean shutdown on Quit.
- **Confined Architecture**: Everything (code, database, assets) stays strictly inside this project directory.

---

## Directory Structure

```text
screentime test\
├── app\
│   ├── __init__.py
│   ├── config.py           # Configuration & thresholds (5 min display timeout)
│   ├── database.py         # SQLite WAL mode & thread-safe aggregations
│   ├── tracker.py          # Windows ctypes foreground monitor & idle detector
│   ├── server.py           # On-demand localhost HTTP server & REST API
│   ├── tray.py             # pystray runner & dynamic icon generator
│   └── web\                # Barebones offline dashboard
│       ├── index.html
│       ├── style.css
│       └── app.js
├── data\
│   └── screentime.db       # Local SQLite database (created on first run)
├── run.py                  # Main entry point with single-instance lock
├── start_silent.bat        # Silent launcher (no console window)
└── requirements.txt        # Minimal dependencies (pystray, Pillow)
```

---

## Setup & Installation

### 1. Install Dependencies
```powershell
pip install -r requirements.txt
```

### 2. Run the Application

* **Silent Background Mode (Recommended)**:
  Double-click `start_silent.bat` or run:
  ```powershell
  pythonw.exe run.py
  ```
  The app will dock directly into your Windows system tray (bottom-right taskbar).

* **With Dashboard Opened Immediately**:
  ```powershell
  python run.py --dashboard
  ```

* **Console Debug Mode**:
  ```powershell
  python run.py --no-tray
  ```

---

## Windows Startup Configuration

To have ScreenTime start automatically when you turn on your PC:
- Right-click the system tray icon and check **"Start with Windows"** (uncheck anytime to disable).
