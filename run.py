"""Main entry point for ScreenTime Tracker.

Coordinates the background window tracker, the on-demand dashboard server,
and the system tray runner with single-instance enforcement.
"""

import argparse
import ctypes
from ctypes import wintypes
import sys
import time

from app.database import Database
from app.server import DashboardServer
from app.tracker import ScreenTimeTracker
from app.tray import TrayRunner

# Win32 Single Instance Mutex Constants
ERROR_ALREADY_EXISTS = 183
MUTEX_NAME = "Local\\ScreenTimeTracker_SingleInstance_Mutex"


def acquire_single_instance_mutex():
    """Ensure only one instance of the tracker runs at a time."""
    kernel32 = ctypes.windll.kernel32
    mutex = kernel32.CreateMutexW(None, False, MUTEX_NAME)
    last_error = kernel32.GetLastError()

    if last_error == ERROR_ALREADY_EXISTS:
        return None
    return mutex


def main():
    parser = argparse.ArgumentParser(description="ScreenTime Background Tracker")
    parser.add_argument(
        "--dashboard", action="store_true", help="Immediately launch dashboard in browser"
    )
    parser.add_argument(
        "--no-tray", action="store_true", help="Run in console mode without tray icon"
    )
    args = parser.parse_args()

    # Enforce single instance
    mutex = acquire_single_instance_mutex()
    if mutex is None:
        print("ScreenTime Tracker is already running in the background.")
        # If user explicitly requested dashboard, open it via default port
        if args.dashboard:
            import webbrowser
            from app.config import DEFAULT_SERVER_PORT, SERVER_HOST
            webbrowser.open(f"http://{SERVER_HOST}:{DEFAULT_SERVER_PORT}")
        sys.exit(0)

    db = Database()
    tracker = ScreenTimeTracker(db)
    server = DashboardServer(db, tracker)

    # Start tracking
    tracker.start()

    if args.dashboard:
        server.start(open_browser=True)

    if args.no_tray:
        print("Running in headless console mode. Press Ctrl+C to terminate.")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\nShutting down gracefully...")
        finally:
            tracker.stop()
            server.stop()
            sys.exit(0)

    # Launch system tray (blocks on main thread until Quit)
    try:
        tray = TrayRunner(db, tracker, server)
        tray.run()
    except Exception as e:
        print(f"Tray error: {e}")
    finally:
        tracker.stop()
        server.stop()


if __name__ == "__main__":
    main()
