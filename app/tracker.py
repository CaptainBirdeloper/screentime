"""Foreground window tracking and idle monitoring engine for Windows.

Uses direct Win32 ctypes calls for microsecond latency and zero external process overhead.
Implements the session delta model with 5-minute display-sleep protection and
periodic heartbeat persistence.
"""

import ctypes
import os
import threading
import time
from ctypes import wintypes
from pathlib import Path
from typing import Dict, Optional, Tuple

from app.config import (
    DISPLAY_TIMEOUT_SECONDS,
    HEARTBEAT_INTERVAL_SECONDS,
    POLL_INTERVAL_SECONDS,
)
from app.database import Database

# Win32 API Constants
PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
PROCESS_QUERY_INFORMATION = 0x0400
PROCESS_VM_READ = 0x0010

# Win32 Libraries
user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32


class LASTINPUTINFO(ctypes.Structure):
    _fields_ = [
        ("cbSize", wintypes.UINT),
        ("dwTime", wintypes.DWORD),
    ]


# Friendly name lookup for common Windows executables
KNOWN_APP_NAMES: Dict[str, str] = {
    "chrome.exe": "Google Chrome",
    "msedge.exe": "Microsoft Edge",
    "firefox.exe": "Mozilla Firefox",
    "brave.exe": "Brave Browser",
    "code.exe": "Visual Studio Code",
    "devenv.exe": "Visual Studio",
    "pycharm64.exe": "PyCharm",
    "idea64.exe": "IntelliJ IDEA",
    "sublime_text.exe": "Sublime Text",
    "notepad.exe": "Notepad",
    "notepad++.exe": "Notepad++",
    "explorer.exe": "Windows Explorer",
    "windowsterminal.exe": "Windows Terminal",
    "powershell.exe": "PowerShell",
    "cmd.exe": "Command Prompt",
    "discord.exe": "Discord",
    "spotify.exe": "Spotify",
    "slack.exe": "Slack",
    "teams.exe": "Microsoft Teams",
    "zoom.exe": "Zoom",
    "steam.exe": "Steam",
    "obs64.exe": "OBS Studio",
    "vlc.exe": "VLC Media Player",
    "taskmgr.exe": "Task Manager",
}


class ScreenTimeTracker:
    """Core tracking engine monitoring foreground window focus and idle state."""

    def __init__(self, db: Database):
        self.db = db
        self._running = False
        self._paused = False
        self._lock = threading.Lock()
        self._thread: Optional[threading.Thread] = None

        # PID to (exe_name, app_name) cache
        self._pid_cache: Dict[int, Tuple[str, str]] = {}

        # Active tracking session state
        self._current_app: Optional[str] = None
        self._current_exe: Optional[str] = None
        self._current_title: Optional[str] = None
        self._session_start: float = 0.0
        self._last_flush_time: float = 0.0

        # Idle tracking
        self._is_idle = False
        self._idle_start_time: float = 0.0

    @staticmethod
    def get_idle_seconds() -> float:
        """Calculate seconds since the last mouse or keyboard input event."""
        lii = LASTINPUTINFO()
        lii.cbSize = ctypes.sizeof(LASTINPUTINFO)
        if not user32.GetLastInputInfo(ctypes.byref(lii)):
            return 0.0

        tick_count = kernel32.GetTickCount64()
        elapsed_ms = max(0, tick_count - lii.dwTime)
        return elapsed_ms / 1000.0

    def _resolve_process_name(self, pid: int) -> Tuple[str, str]:
        """Resolve executable name and user-friendly application name from PID."""
        if pid in self._pid_cache:
            return self._pid_cache[pid]

        if pid <= 0:
            return "system", "System Idle / Lock Screen"

        exe_path = ""
        # Try PROCESS_QUERY_LIMITED_INFORMATION first
        h_proc = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
        if not h_proc:
            # Fallback to standard query information
            h_proc = kernel32.OpenProcess(
                PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, False, pid
            )

        if h_proc:
            try:
                buf = ctypes.create_unicode_buffer(1024)
                size = wintypes.DWORD(1024)
                if kernel32.QueryFullProcessImageNameW(
                    h_proc, 0, buf, ctypes.byref(size)
                ):
                    exe_path = buf.value
            finally:
                kernel32.CloseHandle(h_proc)

        if exe_path:
            exe_name = Path(exe_path).name.lower()
        else:
            exe_name = f"pid_{pid}.exe"

        # Lookup or format friendly app name
        if exe_name in KNOWN_APP_NAMES:
            friendly_name = KNOWN_APP_NAMES[exe_name]
        else:
            # e.g., 'adobe_premiere.exe' -> 'Adobe Premiere'
            base = exe_name.rsplit(".", 1)[0]
            friendly_name = base.replace("_", " ").replace("-", " ").title()

        # Cache result (limit cache size to 500 entries)
        if len(self._pid_cache) > 500:
            self._pid_cache.clear()
        self._pid_cache[pid] = (exe_name, friendly_name)

        return exe_name, friendly_name

    def _get_foreground_window_info(
        self,
    ) -> Optional[Tuple[str, str, str]]:
        """Retrieve current foreground window title, executable name, and app name."""
        hwnd = user32.GetForegroundWindow()
        if not hwnd:
            return None

        # Process ID
        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if pid.value == 0:
            return None

        exe_name, app_name = self._resolve_process_name(pid.value)

        # Window Title
        length = user32.GetWindowTextLengthW(hwnd)
        title = ""
        if length > 0:
            buf = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buf, length + 1)
            title = buf.value

        # Handle UWP ApplicationFrameHost wrapper
        if exe_name == "applicationframehost.exe" and title:
            app_name = title.split(" - ")[-1].strip() or "Windows App"

        return app_name, exe_name, title

    def _flush_active_delta(self, now: float) -> None:
        """Persist accumulated elapsed time since last flush for the active app."""
        if not self._current_app or self._session_start <= 0:
            return

        elapsed = now - self._last_flush_time
        if elapsed >= 0.2:  # Save meaningful slices
            self.db.record_session(
                app_name=self._current_app,
                exe_name=self._current_exe or "unknown.exe",
                window_title=self._current_title or "",
                start_time=self._last_flush_time,
                end_time=now,
                duration=elapsed,
            )
            self._last_flush_time = now

    def _track_loop(self) -> None:
        """Background monitoring loop running at 1 Hz low overhead."""
        while self._running:
            time.sleep(POLL_INTERVAL_SECONDS)

            with self._lock:
                if self._paused:
                    continue

                now = time.time()
                idle_sec = self.get_idle_seconds()

                # Inactivity / Display-off check (5 minutes threshold)
                if idle_sec >= DISPLAY_TIMEOUT_SECONDS:
                    if not self._is_idle:
                        # User just crossed into idle state
                        # Attribute time up until the moment inactivity started
                        active_end = max(self._last_flush_time, now - idle_sec)
                        if active_end > self._last_flush_time:
                            self._flush_active_delta(active_end)
                        self._is_idle = True
                    # While idle, do not accumulate active screen time
                    continue

                # User resumed activity after being idle
                if self._is_idle:
                    self._is_idle = False
                    self._session_start = now
                    self._last_flush_time = now

                # Get current foreground window
                win_info = self._get_foreground_window_info()
                if not win_info:
                    continue

                app_name, exe_name, title = win_info

                # Detect Application Switch
                if app_name != self._current_app or exe_name != self._current_exe:
                    # Finalize session for previous application
                    if self._current_app:
                        self._flush_active_delta(now)

                    # Start session for newly focused application
                    self._current_app = app_name
                    self._current_exe = exe_name
                    self._current_title = title
                    self._session_start = now
                    self._last_flush_time = now

                else:
                    # Same application remains focused
                    # Update window title if it changed (e.g. browser tab switch)
                    if title:
                        self._current_title = title

                    # Periodic heartbeat flush (e.g. every 15 seconds)
                    if now - self._last_flush_time >= HEARTBEAT_INTERVAL_SECONDS:
                        self._flush_active_delta(now)

    def start(self) -> None:
        """Start tracking on a background thread."""
        with self._lock:
            if self._running:
                return
            self._running = True
            self._session_start = time.time()
            self._last_flush_time = self._session_start
            self._thread = threading.Thread(target=self._track_loop, daemon=True)
            self._thread.start()

    def stop(self) -> None:
        """Stop tracking and flush the final active session."""
        with self._lock:
            if not self._running:
                return
            self._running = False
            # Flush final active duration
            if self._current_app and not self._is_idle and not self._paused:
                self._flush_active_delta(time.time())

        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2.0)

    def pause(self) -> None:
        """Pause active tracking and flush current session."""
        with self._lock:
            if not self._paused:
                if self._current_app and not self._is_idle:
                    self._flush_active_delta(time.time())
                self._paused = True

    def resume(self) -> None:
        """Resume tracking with fresh timestamp."""
        with self._lock:
            if self._paused:
                self._paused = False
                now = time.time()
                self._session_start = now
                self._last_flush_time = now

    def is_paused(self) -> bool:
        """Check if tracker is currently paused."""
        with self._lock:
            return self._paused

    def get_status(self) -> Dict[str, Any]:
        """Return live tracker status."""
        with self._lock:
            return {
                "running": self._running,
                "paused": self._paused,
                "is_idle": self._is_idle,
                "current_app": self._current_app if not self._is_idle else "Idle",
                "current_exe": self._current_exe if not self._is_idle else "",
            }
