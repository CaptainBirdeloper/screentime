/**
 * ScreenTime Precision AMOLED Client (design1)
 */

const PALETTE = [
  "#38bdf8", // Electric Blue
  "#10b981", // Emerald Green
  "#f43f5e", // Crimson Red
  "#a855f7", // Purple
  "#f59e0b", // Warm Amber
  "#60a5fa", // Cornflower Blue
  "#2dd4bf", // Teal
  "#ec4899", // Fuchsia
  "#ffffff"  // Pure White
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
const appsList = document.getElementById("appsList");
const appCountTag = document.getElementById("appCountTag");
const donutSegments = document.getElementById("donutSegments");
const chartLegend = document.getElementById("chartLegend");
const timelineContainer = document.getElementById("timelineContainer");
const tabButtons = document.querySelectorAll(".range-btn");

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

  // 1. Hero Metrics
  totalTimeVal.textContent = formatDuration(total_seconds);

  if (apps && apps.length > 0) {
    const top = apps[0];
    topAppVal.textContent = top.app_name;
    topAppSub.textContent = `${formatDuration(top.total_seconds)} • ${top.percentage}%`;
  } else {
    topAppVal.textContent = "—";
    topAppSub.textContent = "0% of total";
  }

  const appColors = assignAppColors(apps);

  // 2. Apps Leaderboard
  renderAppsList(apps, total_seconds, appColors);

  // 3. Donut Gauge
  renderDonutChart(apps, total_seconds, appColors);

  // 4. Waveform Timeline
  renderWaveformTimeline(hourly);
}

function renderAppsList(apps, totalSeconds, appColors) {
  appCountTag.textContent = `${apps ? apps.length : 0} Apps`;
  appsList.innerHTML = "";

  if (!apps || apps.length === 0) {
    appsList.innerHTML = '<div class="empty-state">No screen time logged for this period.</div>';
    return;
  }

  apps.forEach((app, idx) => {
    const color = appColors?.get(app.app_name) || PALETTE[idx % PALETTE.length];
    const rankStr = (idx + 1).toString().padStart(2, "0");

    const row = document.createElement("div");
    row.className = "app-stream-row";
    row.innerHTML = `
      <div class="app-stream-meta">
        <div class="app-meta-left">
          <span class="rank-index">${rankStr}</span>
          <div class="app-text-group">
            <span class="app-name-title">${escapeHtml(app.app_name)}</span>
            <span class="app-exe-badge">${escapeHtml(app.exe_name || "")}</span>
          </div>
        </div>
        <div class="app-meta-right">
          <span class="app-time-stat">${formatDuration(app.total_seconds)}</span>
          <span class="app-share-chip">${app.percentage}%</span>
        </div>
      </div>
      <div class="stream-progress-track">
        <div class="stream-progress-fill" style="width: ${Math.min(100, Math.max(1, app.percentage))}%; background-color: ${color}"></div>
      </div>
    `;
    appsList.appendChild(row);
  });
}

function renderDonutChart(apps, totalSeconds, appColors) {
  donutSegments.innerHTML = "";
  chartLegend.innerHTML = "";

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

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", "100");
    circle.setAttribute("cy", "100");
    circle.setAttribute("r", radius.toString());
    circle.setAttribute("class", "gauge-arc");
    circle.setAttribute("stroke", color);
    circle.setAttribute("stroke-dasharray", `${strokeDash} ${circumference}`);
    circle.setAttribute("stroke-dashoffset", strokeOffset.toString());
    donutSegments.appendChild(circle);

    accumulatedPercent += pct;

    if (idx < 7) {
      const leg = document.createElement("div");
      leg.className = "legend-item-row";
      leg.innerHTML = `
        <div class="legend-item-left">
          <span class="legend-dot" style="background-color: ${color}"></span>
          <span class="legend-label" title="${escapeHtml(app.app_name)}">${escapeHtml(app.app_name)}</span>
        </div>
        <span class="legend-value">${app.percentage}%</span>
      `;
      chartLegend.appendChild(leg);
    }
  });
}

function renderWaveformTimeline(hourly) {
  timelineContainer.innerHTML = "";
  if (!hourly || hourly.length === 0) {
    document.getElementById("timelineSection").style.display = "none";
    return;
  }
  document.getElementById("timelineSection").style.display = "flex";

  const maxSeconds = Math.max(...hourly.map(h => h.seconds), 60);

  hourly.forEach(item => {
    const col = document.createElement("div");
    col.className = "time-slot-column";

    const pct = Math.min(100, Math.round((item.seconds / maxSeconds) * 100));
    const hStr = item.hour.toString().padStart(2, "0");
    const durStr = formatShortDuration(item.seconds);
    const hasTime = item.seconds > 0;

    col.innerHTML = `
      <div class="time-slot-bar-shell">
        <div class="precision-bar-fill ${hasTime ? 'has-time' : ''}" style="height: ${hasTime ? Math.max(8, pct) : 3}%" title="${hStr}:00 - ${durStr} active"></div>
      </div>
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
