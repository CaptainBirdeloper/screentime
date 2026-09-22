"""SQLite Database layer for ScreenTime Tracker.

Configured with WAL mode and thread-safe connection management for concurrent
background writing and dashboard reading.
"""

import sqlite3
import threading
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.config import DB_PATH


class Database:
    """Thread-safe SQLite database manager for tracking application screen time."""

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or DB_PATH
        self._local = threading.local()
        self._all_conns: List[sqlite3.Connection] = []
        self._conns_lock = threading.Lock()
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        """Retrieve or create a thread-local SQLite connection."""
        if not hasattr(self._local, "connection") or self._local.connection is None:
            conn = sqlite3.connect(
                str(self.db_path),
                timeout=10.0,
                check_same_thread=False,
            )
            conn.row_factory = sqlite3.Row
            # Enable Write-Ahead Logging for high concurrency
            conn.execute("PRAGMA journal_mode = WAL;")
            conn.execute("PRAGMA synchronous = NORMAL;")
            self._local.connection = conn
            with self._conns_lock:
                self._all_conns.append(conn)
        return self._local.connection

    def close(self) -> None:
        """Close all active SQLite connections across all threads."""
        with self._conns_lock:
            for conn in self._all_conns:
                try:
                    conn.close()
                except Exception:
                    pass
            self._all_conns.clear()
        if hasattr(self._local, "connection"):
            self._local.connection = None

    def _init_db(self) -> None:
        """Initialize tables and indexes if they do not exist."""
        with self._get_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    app_name TEXT NOT NULL,
                    exe_name TEXT NOT NULL,
                    window_title TEXT,
                    start_time REAL NOT NULL,
                    end_time REAL NOT NULL,
                    duration REAL NOT NULL,
                    date TEXT NOT NULL,
                    hour INTEGER NOT NULL
                );
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_sessions_date
                ON sessions (date);
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_sessions_app_date
                ON sessions (app_name, date);
                """
            )
            conn.commit()

    def cleanup_ignored_apps(self, ignored_exes) -> None:
        """Purge records belonging to ignored/system executables."""
        if not ignored_exes:
            return
        placeholders = ",".join("?" for _ in ignored_exes)
        conn = self._get_connection()
        with conn:
            conn.execute(
                f"DELETE FROM sessions WHERE LOWER(exe_name) IN ({placeholders});",
                tuple(e.lower() for e in ignored_exes),
            )

    def record_session(
        self,
        app_name: str,
        exe_name: str,
        window_title: str,
        start_time: float,
        end_time: float,
        duration: float,
    ) -> Optional[int]:
        """Record an active session to the database.

        If the session crosses midnight, it gracefully attributes to the starting date.
        Minimum recorded duration is 0.1 seconds to filter instantaneous transient switches.
        """
        if duration < 0.1:
            return None

        clean_app = app_name.strip() or "Unknown Application"
        clean_exe = exe_name.strip() or "unknown.exe"
        clean_title = (window_title or "").strip()

        start_dt = datetime.fromtimestamp(start_time)
        date_str = start_dt.strftime("%Y-%m-%d")
        hour_int = start_dt.hour

        conn = self._get_connection()
        with conn:
            cursor = conn.execute(
                """
                INSERT INTO sessions (
                    app_name, exe_name, window_title,
                    start_time, end_time, duration,
                    date, hour
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
                """,
                (
                    clean_app,
                    clean_exe,
                    clean_title,
                    start_time,
                    end_time,
                    round(duration, 2),
                    date_str,
                    hour_int,
                ),
            )
            return cursor.lastrowid

    def get_daily_summary(self, target_date: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get aggregate usage per application for a specific date (YYYY-MM-DD)."""
        if not target_date:
            target_date = date.today().isoformat()

        conn = self._get_connection()
        cursor = conn.execute(
            """
            SELECT 
                app_name,
                exe_name,
                SUM(duration) as total_duration,
                COUNT(id) as session_count
            FROM sessions
            WHERE date = ?
            GROUP BY app_name
            ORDER BY total_duration DESC;
            """,
            (target_date,),
        )
        rows = cursor.fetchall()

        total_day_seconds = sum(row["total_duration"] for row in rows) or 1.0
        results = []
        for row in rows:
            dur = row["total_duration"]
            pct = round((dur / total_day_seconds) * 100, 1)
            results.append(
                {
                    "app_name": row["app_name"],
                    "exe_name": row["exe_name"],
                    "total_seconds": round(dur, 1),
                    "percentage": pct,
                    "session_count": row["session_count"],
                }
            )
        return results

    def get_hourly_breakdown(self, target_date: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get total screen time distributed across 24 hours for a specific date."""
        if not target_date:
            target_date = date.today().isoformat()

        conn = self._get_connection()
        cursor = conn.execute(
            """
            SELECT hour, SUM(duration) as total_duration
            FROM sessions
            WHERE date = ?
            GROUP BY hour
            ORDER BY hour ASC;
            """,
            (target_date,),
        )
        hourly_map = {row["hour"]: round(row["total_duration"], 1) for row in cursor.fetchall()}

        return [{"hour": h, "seconds": hourly_map.get(h, 0.0)} for h in range(24)]

    def get_range_summary(self, days: int = 7) -> Dict[str, Any]:
        """Get aggregated usage trends over the last N days."""
        today = date.today()
        start_date = (today - timedelta(days=days - 1)).isoformat()
        end_date = today.isoformat()

        conn = self._get_connection()

        # Daily totals
        daily_cursor = conn.execute(
            """
            SELECT date, SUM(duration) as total_duration
            FROM sessions
            WHERE date >= ? AND date <= ?
            GROUP BY date
            ORDER BY date ASC;
            """,
            (start_date, end_date),
        )
        daily_dict = {row["date"]: round(row["total_duration"], 1) for row in daily_cursor.fetchall()}

        # Populate all dates in range even if 0 seconds
        daily_trend = []
        for i in range(days):
            d_str = (today - timedelta(days=days - 1 - i)).isoformat()
            daily_trend.append({"date": d_str, "seconds": daily_dict.get(d_str, 0.0)})

        # App totals across range
        app_cursor = conn.execute(
            """
            SELECT 
                app_name,
                exe_name,
                SUM(duration) as total_duration,
                COUNT(id) as session_count
            FROM sessions
            WHERE date >= ? AND date <= ?
            GROUP BY app_name
            ORDER BY total_duration DESC;
            """,
            (start_date, end_date),
        )
        rows = app_cursor.fetchall()
        total_range_seconds = sum(row["total_duration"] for row in rows) or 1.0

        apps = []
        for row in rows:
            dur = row["total_duration"]
            pct = round((dur / total_range_seconds) * 100, 1)
            apps.append(
                {
                    "app_name": row["app_name"],
                    "exe_name": row["exe_name"],
                    "total_seconds": round(dur, 1),
                    "percentage": pct,
                    "session_count": row["session_count"],
                }
            )

        return {
            "daily_trend": daily_trend,
            "apps": apps,
            "total_seconds": round(sum(d["seconds"] for d in daily_trend), 1),
        }

    def get_today_total(self) -> float:
        """Return total tracked seconds for today."""
        today_str = date.today().isoformat()
        conn = self._get_connection()
        cursor = conn.execute(
            """
            SELECT SUM(duration) as total
            FROM sessions
            WHERE date = ?;
            """,
            (today_str,),
        )
        row = cursor.fetchone()
        return round(row["total"] or 0.0, 1)

    def get_recent_sessions(self, limit: int = 15) -> List[Dict[str, Any]]:
        """Return most recent discrete sessions."""
        conn = self._get_connection()
        cursor = conn.execute(
            """
            SELECT id, app_name, exe_name, window_title, start_time, end_time, duration, date
            FROM sessions
            ORDER BY id DESC
            LIMIT ?;
            """,
            (limit,),
        )
        results = []
        for row in cursor.fetchall():
            results.append(
                {
                    "id": row["id"],
                    "app_name": row["app_name"],
                    "exe_name": row["exe_name"],
                    "window_title": row["window_title"],
                    "start_time": row["start_time"],
                    "end_time": row["end_time"],
                    "duration": row["duration"],
                    "date": row["date"],
                }
            )
        return results
