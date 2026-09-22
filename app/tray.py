"""System tray icon and context menu runner using pystray and Pillow."""

import os
import sys
import threading
from pathlib import Path
from typing import Optional

from PIL import Image, ImageDraw
import pystray
from pystray import MenuItem as item

from app.config import PROJECT_DIR, STARTUP_BAT_PATH
from app.database import Database
from app.server import DashboardServer
from app.tracker import ScreenTimeTracker


def generate_tray_icon_image(is_paused: bool = False) -> Image.Image:
    """Generate a crisp 64x64 RGBA system tray icon dynamically."""
    size = (64, 64)
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    # Theme colors
    bg_color = "#0f172a"  # Slate dark
    border_color = "#f59e0b" if is_paused else "#10b981"  # Amber vs Emerald
    center_color = "#f59e0b" if is_paused else "#38bdf8"  # Amber vs Sky Blue

    # Outer pill/circle
    draw.ellipse((4, 4, 60, 60), fill=bg_color, outline=border_color, width=4)

    if is_paused:
        # Draw pause bars (two vertical bars)
        draw.rectangle((22, 20, 27, 44), fill=center_color)
        draw.rectangle((37, 20, 42, 44), fill=center_color)
    else:
        # Draw miniature monitor/clock symbol
        draw.rectangle((18, 18, 46, 38), outline=center_color, width=3)
        # Stand base
        draw.line((26, 44, 38, 44), fill=center_color, width=3)
        draw.line((32, 38, 32, 44), fill=center_color, width=3)

    return image


class TrayRunner:
    """Manages the Windows system tray icon, menu actions, and startup toggles."""

    def __init__(
        self,
        db: Database,
        tracker: ScreenTimeTracker,
        server: DashboardServer,
    ):
        self.db = db
        self.tracker = tracker
        self.server = server
        self.icon: Optional[pystray.Icon] = None

    def is_startup_enabled(self, item_ref=None) -> bool:
        """Check if startup batch file exists in Windows Startup folder."""
        return STARTUP_BAT_PATH is not None and STARTUP_BAT_PATH.exists()

    def toggle_startup(self, icon, item_ref) -> None:
        """Toggle the presence of the startup batch file."""
        if not STARTUP_BAT_PATH:
            return

        if self.is_startup_enabled():
            try:
                STARTUP_BAT_PATH.unlink(missing_ok=True)
            except Exception as e:
                print(f"Error removing startup file: {e}")
        else:
            try:
                STARTUP_BAT_PATH.parent.mkdir(parents=True, exist_ok=True)
                # Resolve pythonw.exe path
                python_dir = Path(sys.executable).parent
                pythonw_path = python_dir / "pythonw.exe"
                if not pythonw_path.exists():
                    pythonw_path = Path(sys.executable)

                run_py = PROJECT_DIR / "run.py"
                bat_content = (
                    "@echo off\r\n"
                    f'cd /d "{PROJECT_DIR}"\r\n'
                    f'start "" "{pythonw_path}" "{run_py}"\r\n'
                )
                STARTUP_BAT_PATH.write_text(bat_content, encoding="utf-8")
            except Exception as e:
                print(f"Error writing startup file: {e}")

    def on_open_dashboard(self, icon=None, item=None) -> None:
        """Launch or focus on-demand dashboard in default web browser."""
        self.server.start(open_browser=True)

    def on_toggle_pause(self, icon=None, item=None) -> None:
        """Toggle tracking pause state and update icon badge."""
        if self.tracker.is_paused():
            self.tracker.resume()
        else:
            self.tracker.pause()
        self._update_icon()

    def _update_icon(self) -> None:
        """Refresh tray icon visuals and tooltip text."""
        if not self.icon:
            return
        is_paused = self.tracker.is_paused()
        self.icon.icon = generate_tray_icon_image(is_paused=is_paused)

        total_sec = self.db.get_today_total()
        hours = int(total_sec // 3600)
        minutes = int((total_sec % 3600) // 60)
        status = "Paused" if is_paused else "Tracking"
        self.icon.title = f"ScreenTime: {hours}h {minutes}m ({status})"

    def on_quit(self, icon=None, item=None) -> None:
        """Clean shutdown: flush database, stop server, and remove tray icon."""
        self.tracker.stop()
        self.server.stop()
        if self.icon:
            self.icon.stop()

    def _create_menu(self) -> pystray.Menu:
        """Build the system tray context menu."""
        return pystray.Menu(
            item(
                lambda text: (
                    f"Status: {'Paused' if self.tracker.is_paused() else 'Tracking'} "
                    f"({int(self.db.get_today_total() // 3600)}h "
                    f"{int((self.db.get_today_total() % 3600) // 60)}m)"
                ),
                None,
                enabled=False,
            ),
            pystray.Menu.SEPARATOR,
            item("Open Dashboard", self.on_open_dashboard, default=True),
            item(
                lambda text: (
                    "Resume Tracking" if self.tracker.is_paused() else "Pause Tracking"
                ),
                self.on_toggle_pause,
            ),
            item(
                "Start with Windows",
                self.toggle_startup,
                checked=self.is_startup_enabled,
            ),
            pystray.Menu.SEPARATOR,
            item("Quit", self.on_quit),
        )

    def run(self) -> None:
        """Start the system tray icon loop."""
        initial_img = generate_tray_icon_image(is_paused=False)
        self.icon = pystray.Icon(
            name="ScreenTimeTracker",
            icon=initial_img,
            title="ScreenTime Tracker (Initializing...)",
            menu=self._create_menu(),
        )

        # Background periodic tooltip / status updater
        def _tooltip_updater():
            while self.icon and self.icon.visible:
                self._update_icon()
                threading.Event().wait(10.0)

        update_thread = threading.Thread(target=_tooltip_updater, daemon=True)
        update_thread.start()

        # Run system tray event loop (blocks until on_quit)
        self.icon.run()
