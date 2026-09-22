"""On-demand embedded HTTP server for the ScreenTime offline dashboard.

Spawns an ephemeral localhost server when requested from the tray, serving static
vanilla frontend assets and aggregated metrics from SQLite.
"""

import json
import mimetypes
import threading
import urllib.parse
import webbrowser
from datetime import date, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Optional

from app.config import DEFAULT_SERVER_PORT, SERVER_HOST, WEB_DIR
from app.database import Database
from app.tracker import ScreenTimeTracker


class DashboardHandler(BaseHTTPRequestHandler):
    """HTTP Request handler serving static files and API endpoints."""

    db: Database = None  # Injected on server initialization
    tracker: ScreenTimeTracker = None

    def log_message(self, format: str, *args) -> None:
        """Suppress standard HTTP request logging for quiet background operation."""
        return

    def do_GET(self) -> None:
        """Handle GET requests for static assets and API data."""
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query = urllib.parse.parse_qs(parsed_url.query)

        if path == "/api/stats":
            self._handle_api_stats(query)
        elif path == "/api/status":
            self._handle_api_status()
        else:
            self._handle_static_file(path)

    def do_POST(self) -> None:
        """Handle POST actions like toggling pause."""
        parsed_url = urllib.parse.urlparse(self.path)
        if parsed_url.path == "/api/toggle-pause":
            if self.tracker:
                if self.tracker.is_paused():
                    self.tracker.resume()
                else:
                    self.tracker.pause()
            self._send_json({"paused": self.tracker.is_paused() if self.tracker else False})
        else:
            self.send_error(404, "Endpoint not found")

    def _handle_api_stats(self, query: dict) -> None:
        """Return aggregated screen time statistics."""
        range_param = query.get("range", ["today"])[0]

        if range_param == "yesterday":
            target_date = (date.today() - timedelta(days=1)).isoformat()
            apps = self.db.get_daily_summary(target_date)
            hourly = self.db.get_hourly_breakdown(target_date)
            total_sec = sum(a["total_seconds"] for a in apps)
            daily_trend = []
        elif range_param in ("7days", "30days"):
            days = 7 if range_param == "7days" else 30
            range_data = self.db.get_range_summary(days=days)
            apps = range_data["apps"]
            hourly = []
            total_sec = range_data["total_seconds"]
            daily_trend = range_data["daily_trend"]
        else:
            # Default: today
            target_date = date.today().isoformat()
            apps = self.db.get_daily_summary(target_date)
            hourly = self.db.get_hourly_breakdown(target_date)
            total_sec = sum(a["total_seconds"] for a in apps)
            daily_trend = []

        status = self.tracker.get_status() if self.tracker else {}
        recent = self.db.get_recent_sessions(limit=10)

        response = {
            "range": range_param,
            "total_seconds": round(total_sec, 1),
            "apps": apps,
            "hourly": hourly,
            "daily_trend": daily_trend,
            "recent_sessions": recent,
            "status": status,
        }
        self._send_json(response)

    def _handle_api_status(self) -> None:
        """Return live status of the tracker."""
        status = self.tracker.get_status() if self.tracker else {}
        status["today_total_seconds"] = self.db.get_today_total()
        self._send_json(status)

    def _handle_static_file(self, path: str) -> None:
        """Serve files from the app/web directory."""
        if path in ("/", ""):
            path = "/index.html"

        # Sanitize path to prevent directory traversal
        rel_path = path.lstrip("/")
        file_path = (WEB_DIR / rel_path).resolve()

        if not str(file_path).startswith(str(WEB_DIR.resolve())) or not file_path.is_file():
            self.send_error(404, "File not found")
            return

        mime_type, _ = mimetypes.guess_type(str(file_path))
        mime_type = mime_type or "application/octet-stream"

        try:
            content = file_path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", f"{mime_type}; charset=utf-8")
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(500, f"Error reading file: {e}")

    def _send_json(self, data: dict, status_code: int = 200) -> None:
        """Helper to send JSON response."""
        content = json.dumps(data).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(content)


class DashboardServer:
    """Manages the lifecycle of the on-demand HTTP server."""

    def __init__(self, db: Database, tracker: ScreenTimeTracker):
        self.db = db
        self.tracker = tracker
        self.server: Optional[ThreadingHTTPServer] = None
        self.thread: Optional[threading.Thread] = None
        self.port: int = DEFAULT_SERVER_PORT
        self._lock = threading.Lock()

    def start(self, open_browser: bool = True) -> int:
        """Start the HTTP server on-demand and optionally open default browser."""
        with self._lock:
            if self.server is None:
                # Assign handler dependencies
                DashboardHandler.db = self.db
                DashboardHandler.tracker = self.tracker

                # Try preferred port, fallback to dynamic port (0) if occupied
                try:
                    self.server = ThreadingHTTPServer(
                        (SERVER_HOST, DEFAULT_SERVER_PORT), DashboardHandler
                    )
                    self.port = DEFAULT_SERVER_PORT
                except OSError:
                    self.server = ThreadingHTTPServer(
                        (SERVER_HOST, 0), DashboardHandler
                    )
                    self.port = self.server.server_address[1]

                self.thread = threading.Thread(
                    target=self.server.serve_forever, daemon=True
                )
                self.thread.start()

        dashboard_url = f"http://{SERVER_HOST}:{self.port}"
        if open_browser:
            webbrowser.open(dashboard_url)

        return self.port

    def stop(self) -> None:
        """Shutdown the dashboard server."""
        with self._lock:
            if self.server:
                self.server.shutdown()
                self.server.server_close()
                self.server = None
                self.thread = None
