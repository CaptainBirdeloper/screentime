/**
 * ScreenTime Dashboard - Core Data & Logic Layer
 */

const PALETTE = [
  "#38bdf8", "#34d399", "#a78bfa", "#fbbf24", 
  "#fb7185", "#2dd4bf", "#818cf8", "#f472b6", 
  "#f97316", "#4ade80", "#60a5fa", "#c084fc"
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
const refreshBtn = document.getElementById("refreshBtn");
const lastSyncText = document.getElementById("lastSyncText");
const appsList = document.getElementById("appsList");
const appCountTag = document.getElementById("appCountTag");
const donutSvg = document.getElementById("donutSvg");
const donutSegments = document.getElementById("donutSegments");
const chartLegend = document.getElementById("chartLegend");
const timelineContainer = document.getElementById("timelineContainer");
const tabButtons = document.querySelectorAll(".tab-btn");

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
    if (lastSyncText) lastSyncText.textContent = "Sync failed";
  }
}

function renderDashboard(data) {
  const { total_seconds, apps, hourly } = data;

  if (totalTimeVal) totalTimeVal.textContent = formatDuration(total_seconds);

  if (apps && apps.length > 0) {
    const top = apps[0];
    if (topAppVal) topAppVal.textContent = top.app_name;
    if (topAppSub) topAppSub.textContent = `${formatDuration(top.total_seconds)} (${top.percentage}%)`;
  } else {
    if (topAppVal) topAppVal.textContent = "—";
    if (topAppSub) topAppSub.textContent = "0%";
  }

  const appColors = assignAppColors(apps);

  renderAppsList(apps, total_seconds, appColors);
  renderDonutChart(apps, total_seconds, appColors);
  renderTimeline(hourly);

  if (lastSyncText) {
    const now = new Date();
    lastSyncText.textContent = `Updated ${now.toLocaleTimeString()}`;
  }
}

function renderAppsList(apps, totalSeconds, appColors) {
  if (!appsList) return;
  if (appCountTag) appCountTag.textContent = apps ? apps.length.toString() : "0";
  appsList.innerHTML = "";

  if (!apps || apps.length === 0) {
    appsList.innerHTML = "<div>No screen time recorded for this period yet.</div>";
    return;
  }

  apps.forEach((app, idx) => {
    const color = appColors?.get(app.app_name) || PALETTE[idx % PALETTE.length];
    const item = document.createElement("div");
    item.className = "app-item";
    item.innerHTML = `
      <span style="color: ${color}">■</span>
      <strong>${escapeHtml(app.app_name)}</strong> 
      (${escapeHtml(app.exe_name || "")}): 
      ${formatDuration(app.total_seconds)} — ${app.percentage}%
    `;
    appsList.appendChild(item);
  });
}

function renderDonutChart(apps, totalSeconds, appColors) {
  if (!donutSegments || !chartLegend) return;
  donutSegments.innerHTML = "";
  chartLegend.innerHTML = "";

  if (!apps || apps.length === 0 || totalSeconds <= 0) return;

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
    circle.setAttribute("fill", "none");
    circle.setAttribute("stroke-width", "20");
    circle.setAttribute("stroke", color);
    circle.setAttribute("stroke-dasharray", `${strokeDash} ${circumference}`);
    circle.setAttribute("stroke-dashoffset", strokeOffset.toString());
    donutSegments.appendChild(circle);

    accumulatedPercent += pct;

    if (idx < 7) {
      const leg = document.createElement("div");
      leg.innerHTML = `<span style="color: ${color}">■</span> ${escapeHtml(app.app_name)}: ${app.percentage}%`;
      chartLegend.appendChild(leg);
    }
  });
}

function renderTimeline(hourly) {
  if (!timelineContainer) return;
  timelineContainer.innerHTML = "";
  if (!hourly || hourly.length === 0) return;

  const maxSeconds = Math.max(...hourly.map(h => h.seconds), 60);

  hourly.forEach(item => {
    const durStr = formatShortDuration(item.seconds);
    const hStr = item.hour.toString().padStart(2, "0");
    const div = document.createElement("div");
    div.textContent = `${hStr}:00 - ${durStr}`;
    timelineContainer.appendChild(div);
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

if (refreshBtn) {
  refreshBtn.addEventListener("click", () => loadMetrics());
}

function startAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(loadMetrics, 10000);
}

loadMetrics();
startAutoRefresh();
