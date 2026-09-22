/**
 * ScreenTime Dashboard - Barebones, High-Performance Offline Client
 */

const PALETTE = [
  "#38bdf8", // Sky Blue
  "#34d399", // Emerald Green
  "#a78bfa", // Soft Purple
  "#fbbf24", // Warm Amber
  "#fb7185", // Coral Rose
  "#2dd4bf", // Teal
  "#818cf8", // Indigo
  "#f472b6", // Pink
  "#f97316", // Orange
  "#4ade80", // Light Green
  "#60a5fa", // Cornflower Blue
  "#c084fc", // Violet
  "#e879f9", // Fuchsia
  "#94a3b8"  // Slate
];

function assignAppColors(apps) {
  const colorMap = new Map();
  const used = new Set();
  (apps || []).forEach((app, idx) => {
    let colorIdx = idx % PALETTE.length;
    if (used.has(colorIdx) && used.size < PALETTE.length) {
      for (let i = 0; i < PALETTE.length; i++) {
        if (!used.has(i)) {
          colorIdx = i;
          break;
        }
      }
    }
    used.add(colorIdx);
    colorMap.set(app.app_name, PALETTE[colorIdx]);
  });
  return colorMap;
}

let currentRange = "today";
let autoRefreshTimer = null;

// DOM Elements
const totalTimeVal = document.getElementById("totalTimeVal");
const topAppVal = document.getElementById("topAppVal");
const topAppSub = document.getElementById("topAppSub");
const currentAppVal = document.getElementById("currentAppVal");
const sessionCountVal = document.getElementById("sessionCountVal");
const statusIndicator = document.getElementById("statusIndicator");
const statusLabel = document.getElementById("statusLabel");
const togglePauseBtn = document.getElementById("togglePauseBtn");
const pauseBtnText = document.getElementById("pauseBtnText");
const refreshBtn = document.getElementById("refreshBtn");
const lastSyncText = document.getElementById("lastSyncText");
const appsList = document.getElementById("appsList");
const appCountTag = document.getElementById("appCountTag");
const donutSvg = document.getElementById("donutSvg");
const donutSegments = document.getElementById("donutSegments");
const donutCenterTime = document.getElementById("donutCenterTime");
const chartLegend = document.getElementById("chartLegend");
const timelineContainer = document.getElementById("timelineContainer");
const tabButtons = document.querySelectorAll(".tab-btn");

/**
 * Format seconds into a readable string: Xh Ym Zs
 */
function formatDuration(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;

  if (h > 0) {
    return `${h}h ${m}m ${s}s`;
  }
  if (m > 0) {
    return `${m}m ${s}s`;
  }
  return `${s}s`;
}

function formatShortDuration(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Fetch and render metrics
 */
async function loadMetrics() {
  try {
    const res = await fetch(`/api/stats?range=${encodeURIComponent(currentRange)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderDashboard(data);
  } catch (err) {
    console.error("Failed to load metrics:", err);
    lastSyncText.textContent = "Sync failed (re-trying...)";
  }
}

/**
 * Render all dashboard sections
 */
function renderDashboard(data) {
  const { total_seconds, apps, hourly, status, recent_sessions } = data;

  // 1. Live status & pause toggle
  const isPaused = status?.paused ?? false;
  if (isPaused) {
    statusIndicator.classList.add("paused");
    statusLabel.textContent = "Paused";
    pauseBtnText.textContent = "Resume";
  } else {
    statusIndicator.classList.remove("paused");
    statusLabel.textContent = status?.is_idle ? "Idle" : "Tracking";
    pauseBtnText.textContent = "Pause";
  }

  // 2. Summary stats cards
  totalTimeVal.textContent = formatDuration(total_seconds);
  currentAppVal.textContent = status?.current_app || "None";
  sessionCountVal.textContent = recent_sessions ? recent_sessions.length : (apps.length || 0);

  if (apps && apps.length > 0) {
    const top = apps[0];
    topAppVal.textContent = top.app_name;
    topAppSub.textContent = `${formatDuration(top.total_seconds)} (${top.percentage}%)`;
  } else {
    topAppVal.textContent = "—";
    topAppSub.textContent = "0% of total time";
  }

  const appColors = assignAppColors(apps);

  // 3. Ranked Apps List
  renderAppsList(apps, total_seconds, appColors);

  // 4. Donut Chart
  renderDonutChart(apps, total_seconds, appColors);

  // 5. Timeline Breakdown
  renderTimeline(hourly);

  // 6. Update sync timestamp
  const now = new Date();
  lastSyncText.textContent = `Updated ${now.toLocaleTimeString()}`;
}

/**
 * Render Ranked Applications Breakdown
 */
function renderAppsList(apps, totalSeconds, appColors) {
  appCountTag.textContent = `${apps ? apps.length : 0} Apps`;
  appsList.innerHTML = "";

  if (!apps || apps.length === 0) {
    appsList.innerHTML = '<div class="empty-state">No screen time recorded for this period yet.</div>';
    return;
  }

  apps.forEach((app, idx) => {
    const color = appColors?.get(app.app_name) || PALETTE[idx % PALETTE.length];
    const initial = (app.app_name || "A").trim().charAt(0).toUpperCase();

    const row = document.createElement("div");
    row.className = "app-row";
    row.innerHTML = `
      <div class="app-info-line">
        <div class="app-meta">
          <div class="app-avatar" style="background-color: ${color}">${initial}</div>
          <div class="app-titles">
            <span class="app-title-name">${escapeHtml(app.app_name)}</span>
            <span class="app-title-exe">${escapeHtml(app.exe_name || "")}</span>
          </div>
        </div>
        <div class="app-stats">
          <span class="app-duration">${formatDuration(app.total_seconds)}</span>
          <span class="app-badge">${app.percentage}%</span>
        </div>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width: ${Math.min(100, Math.max(1, app.percentage))}%; background-color: ${color}"></div>
      </div>
    `;
    appsList.appendChild(row);
  });
}

/**
 * Render SVG Donut Chart
 */
function renderDonutChart(apps, totalSeconds, appColors) {
  donutSegments.innerHTML = "";
  chartLegend.innerHTML = "";
  donutCenterTime.textContent = formatShortDuration(totalSeconds);

  if (!apps || apps.length === 0 || totalSeconds <= 0) {
    return;
  }

  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  let accumulatedPercent = 0;

  apps.forEach((app, idx) => {
    const color = appColors?.get(app.app_name) || PALETTE[idx % PALETTE.length];
    const pct = app.percentage / 100;
    const strokeDash = pct * circumference;
    const strokeOffset = -(accumulatedPercent * circumference);

    // SVG Circle Segment
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", "100");
    circle.setAttribute("cy", "100");
    circle.setAttribute("r", radius.toString());
    circle.setAttribute("class", "donut-segment");
    circle.setAttribute("stroke", color);
    circle.setAttribute("stroke-dasharray", `${strokeDash} ${circumference}`);
    circle.setAttribute("stroke-dashoffset", strokeOffset.toString());
    donutSegments.appendChild(circle);

    accumulatedPercent += pct;

    // Legend item (show top 7 apps in legend)
    if (idx < 7) {
      const leg = document.createElement("div");
      leg.className = "legend-item";
      leg.innerHTML = `
        <div class="legend-left">
          <span class="legend-color-dot" style="background-color: ${color}"></span>
          <span class="legend-name" title="${escapeHtml(app.app_name)}">${escapeHtml(app.app_name)}</span>
        </div>
        <span class="legend-pct">${app.percentage}%</span>
      `;
      chartLegend.appendChild(leg);
    }
  });
}

/**
 * Render 24-Hour Timeline
 */
function renderTimeline(hourly) {
  timelineContainer.innerHTML = "";
  if (!hourly || hourly.length === 0) {
    document.getElementById("timelineSection").style.display = "none";
    return;
  }
  document.getElementById("timelineSection").style.display = "block";

  const maxSeconds = Math.max(...hourly.map(h => h.seconds), 60);

  hourly.forEach(item => {
    const col = document.createElement("div");
    col.className = "timeline-col";

    const pct = Math.min(100, Math.round((item.seconds / maxSeconds) * 100));
    const hStr = item.hour.toString().padStart(2, "0");
    const durStr = formatShortDuration(item.seconds);

    col.innerHTML = `
      <div class="timeline-bar-wrapper">
        <div class="timeline-bar" style="height: ${Math.max(4, pct)}%" title="${hStr}:00 - ${durStr}"></div>
      </div>
      <span class="timeline-label">${item.hour % 3 === 0 ? hStr : ""}</span>
    `;
    timelineContainer.appendChild(col);
  });
}

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[m]);
}

// Event Listeners
tabButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    tabButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentRange = btn.getAttribute("data-range");
    loadMetrics();
  });
});

togglePauseBtn.addEventListener("click", async () => {
  try {
    const res = await fetch("/api/toggle-pause", { method: "POST" });
    if (res.ok) {
      loadMetrics();
    }
  } catch (err) {
    console.error("Failed to toggle pause:", err);
  }
});

refreshBtn.addEventListener("click", () => {
  loadMetrics();
});

// Auto-refresh every 10 seconds while dashboard is open
function startAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(loadMetrics, 10000);
}

// Initial load
loadMetrics();
startAutoRefresh();
