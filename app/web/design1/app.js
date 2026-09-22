/**
 * ScreenTime AMOLED M3 Expressive Client (design1)
 * Intentional Palette: Blue (Primary), Green (Vitality/Top), Red (Alert), White, Cyan
 */

const PALETTE = [
  "#3b82f6", // Vibrant Blue
  "#22c55e", // Vitality Green
  "#38bdf8", // Electric Cyan
  "#f87171", // Soft Red
  "#a855f7", // Purple
  "#fbbf24", // Warm Amber
  "#34d399", // Mint Green
  "#60a5fa", // Cornflower Blue
  "#f43f5e", // Rose Red
  "#818cf8", // Indigo
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
const appsList = document.getElementById("appsList");
const appCountTag = document.getElementById("appCountTag");
const donutSegments = document.getElementById("donutSegments");
const chartLegend = document.getElementById("chartLegend");
const timelineContainer = document.getElementById("timelineContainer");
const tabButtons = document.querySelectorAll(".tab-pill");

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

  // 2. Apps List
  renderAppsList(apps, total_seconds, appColors);

  // 3. Donut Gauge
  renderDonutChart(apps, total_seconds, appColors);

  // 4. Timeline
  renderTimeline(hourly);
}

function renderAppsList(apps, totalSeconds, appColors) {
  appCountTag.textContent = `${apps ? apps.length : 0} Apps`;
  appsList.innerHTML = "";

  if (!apps || apps.length === 0) {
    appsList.innerHTML = '<div class="empty-notice">No screen time recorded for this period.</div>';
    return;
  }

  apps.forEach((app, idx) => {
    const color = appColors?.get(app.app_name) || PALETTE[idx % PALETTE.length];

    const row = document.createElement("div");
    row.className = "app-card-row";
    row.innerHTML = `
      <div class="app-card-meta-line">
        <div class="app-meta-left">
          <span class="app-vertical-pill" style="background-color: ${color}"></span>
          <div class="app-title-group">
            <span class="app-primary-name">${escapeHtml(app.app_name)}</span>
            <span class="app-exe-subtext">${escapeHtml(app.exe_name || "")}</span>
          </div>
        </div>
        <div class="app-metrics-right">
          <span class="app-duration-val">${formatDuration(app.total_seconds)}</span>
          <span class="app-pct-pill-tag">${app.percentage}%</span>
        </div>
      </div>
      <div class="m3-progress-track">
        <div class="m3-progress-fill" style="width: ${Math.min(100, Math.max(1, app.percentage))}%; background-color: ${color}"></div>
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
    circle.setAttribute("class", "donut-arc-segment");
    circle.setAttribute("stroke", color);
    circle.setAttribute("stroke-dasharray", `${strokeDash} ${circumference}`);
    circle.setAttribute("stroke-dashoffset", strokeOffset.toString());
    donutSegments.appendChild(circle);

    accumulatedPercent += pct;

    if (idx < 8) {
      const leg = document.createElement("div");
      leg.className = "legend-row";
      leg.innerHTML = `
        <div class="legend-left">
          <span class="legend-squircle" style="background-color: ${color}"></span>
          <span class="legend-app-name" title="${escapeHtml(app.app_name)}">${escapeHtml(app.app_name)}</span>
        </div>
        <span class="legend-pct-val">${app.percentage}%</span>
      `;
      chartLegend.appendChild(leg);
    }
  });
}

function renderTimeline(hourly) {
  timelineContainer.innerHTML = "";
  if (!hourly || hourly.length === 0) {
    document.getElementById("timelineSection").style.display = "none";
    return;
  }
  document.getElementById("timelineSection").style.display = "flex";

  const maxSeconds = Math.max(...hourly.map(h => h.seconds), 60);

  hourly.forEach(item => {
    const col = document.createElement("div");
    col.className = "timeline-pillar-col";

    const pct = Math.min(100, Math.round((item.seconds / maxSeconds) * 100));
    const hStr = item.hour.toString().padStart(2, "0");
    const durStr = formatShortDuration(item.seconds);
    const hasActivity = item.seconds > 0;

    col.innerHTML = `
      <div class="timeline-bar-holder">
        <div class="timeline-pillar-bar ${hasActivity ? 'active-hour' : ''}" style="height: ${Math.max(3, pct)}%" title="${hStr}:00 - ${durStr}"></div>
      </div>
      <span class="timeline-hour-tick">${item.hour % 4 === 0 ? hStr : ""}</span>
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
