/**
 * ScreenTime AMOLED Bento Dashboard Client (design1)
 * High-Contrast Palette: Blue, Green, Red, White, Cyan
 */

const PALETTE = [
  "#38bdf8", // Electric Blue / Cyan
  "#4ade80", // Vitality Green
  "#f87171", // Alert Red
  "#a78bfa", // Soft Purple
  "#fbbf24", // Warm Amber
  "#60a5fa", // Cornflower Blue
  "#2dd4bf", // Teal
  "#f43f5e", // Rose
  "#e2e8f0"  // Specular White
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
const horizonMeter = document.getElementById("horizonMeter");
const chartLegend = document.getElementById("chartLegend");
const appsList = document.getElementById("appsList");
const appCountTag = document.getElementById("appCountTag");
const timelineContainer = document.getElementById("timelineContainer");
const tabButtons = document.querySelectorAll(".pill-btn");

function formatDuration(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;

  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatShortDuration(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

async function loadMetrics() {
  try {
    const res = await fetch(`/api/stats?range=${encodeURIComponent(currentRange)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderDashboard(data);
  } catch (err) {
    console.error("Failed to load metrics:", err);
  }
}

function renderDashboard(data) {
  const { total_seconds, apps, hourly } = data;

  // 1. Hero Big Timer
  totalTimeVal.textContent = formatDuration(total_seconds);

  // 2. Hero Top App Strip
  if (apps && apps.length > 0) {
    const top = apps[0];
    topAppVal.textContent = top.app_name;
    topAppSub.textContent = `${formatDuration(top.total_seconds)} • ${top.percentage}%`;
  } else {
    topAppVal.textContent = "—";
    topAppSub.textContent = "0%";
  }

  const appColors = assignAppColors(apps);

  // 3. Stacked Horizon Meter & Legend
  renderHorizonMeter(apps, total_seconds, appColors);

  // 4. App Tile Grid
  renderAppTiles(apps, total_seconds, appColors);

  // 5. 24-Hour Spectrum Heatmap
  renderHeatMatrix(hourly);
}

/**
 * Render Horizontal Stacked Proportional Meter & Legend
 */
function renderHorizonMeter(apps, totalSeconds, appColors) {
  horizonMeter.innerHTML = "";
  chartLegend.innerHTML = "";

  if (!apps || apps.length === 0 || totalSeconds <= 0) {
    horizonMeter.innerHTML = '<div class="meter-segment" style="width: 100%; background: #181820"></div>';
    chartLegend.innerHTML = '<div style="font-size:12px; color:#52525b; padding:8px 0;">No active distribution</div>';
    return;
  }

  apps.forEach((app, idx) => {
    const color = appColors?.get(app.app_name) || PALETTE[idx % PALETTE.length];

    // Meter Segment
    const seg = document.createElement("div");
    seg.className = "meter-segment";
    seg.style.width = `${Math.max(1, app.percentage)}%`;
    seg.style.backgroundColor = color;
    seg.title = `${app.app_name}: ${app.percentage}%`;
    horizonMeter.appendChild(seg);

    // Legend item (Top 5 apps)
    if (idx < 5) {
      const leg = document.createElement("div");
      leg.className = "meter-legend-item";
      leg.innerHTML = `
        <div class="meter-legend-left">
          <span class="meter-color-pip" style="background-color: ${color}"></span>
          <span class="meter-legend-name" title="${escapeHtml(app.app_name)}">${escapeHtml(app.app_name)}</span>
        </div>
        <span class="meter-legend-pct">${app.percentage}%</span>
      `;
      chartLegend.appendChild(leg);
    }
  });
}

/**
 * Render Interactive App Tiles Grid
 */
function renderAppTiles(apps, totalSeconds, appColors) {
  appCountTag.textContent = `${apps ? apps.length : 0} Apps Active`;
  appsList.innerHTML = "";

  if (!apps || apps.length === 0) {
    appsList.innerHTML = '<div class="empty-tile-notice">No screen time recorded for this time window.</div>';
    return;
  }

  apps.forEach((app, idx) => {
    const color = appColors?.get(app.app_name) || PALETTE[idx % PALETTE.length];

    const tile = document.createElement("div");
    tile.className = "app-bento-tile";
    tile.innerHTML = `
      <div class="tile-top-row">
        <div class="tile-meta-group">
          <span class="tile-color-pill" style="background-color: ${color}"></span>
          <div class="tile-titles">
            <span class="tile-app-name">${escapeHtml(app.app_name)}</span>
            <span class="tile-app-exe">${escapeHtml(app.exe_name || "")}</span>
          </div>
        </div>
        <span class="tile-pct-badge">${app.percentage}%</span>
      </div>
      <div class="tile-bottom-row">
        <span class="tile-duration-text">${formatDuration(app.total_seconds)}</span>
      </div>
      <div class="tile-progress-track">
        <div class="tile-progress-bar" style="width: ${Math.min(100, Math.max(1, app.percentage))}%; background-color: ${color}"></div>
      </div>
    `;
    appsList.appendChild(tile);
  });
}

/**
 * Render 24-Hour Spectrum Heatmap Matrix
 */
function renderHeatMatrix(hourly) {
  timelineContainer.innerHTML = "";
  if (!hourly || hourly.length === 0) {
    document.getElementById("timelineSection").style.display = "none";
    return;
  }
  document.getElementById("timelineSection").style.display = "block";

  const maxSeconds = Math.max(...hourly.map(h => h.seconds), 60);

  hourly.forEach(item => {
    const cell = document.createElement("div");
    cell.className = "heat-cell";

    const ratio = item.seconds / maxSeconds;
    const pct = Math.min(100, Math.round(ratio * 100));
    const hStr = item.hour.toString().padStart(2, "0");
    const durStr = formatShortDuration(item.seconds);

    // Color intensity class
    let intensityClass = "";
    if (item.seconds > 0) {
      if (ratio > 0.6) intensityClass = "heat-fill-high";
      else if (ratio > 0.25) intensityClass = "heat-fill-med";
      else intensityClass = "heat-fill-low";
    }

    cell.title = `${hStr}:00 - ${durStr} active`;
    cell.innerHTML = `
      <div class="heat-indicator-pillar">
        <div class="heat-pillar-fill ${intensityClass}" style="height: ${item.seconds > 0 ? Math.max(15, pct) : 0}%"></div>
      </div>
      <span class="heat-hour-label">${hStr}</span>
    `;
    timelineContainer.appendChild(cell);
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

tabButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    tabButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentRange = btn.getAttribute("data-range");
    loadMetrics();
  });
});

function startAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(loadMetrics, 10000);
}

loadMetrics();
startAutoRefresh();
