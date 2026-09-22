/**
 * ScreenTime Multi-Variant Prototype Harness & Engine (design1)
 * Built strictly according to /prototype and Emil Kowalski design engineering principles.
 */

const PALETTE = [
  "#38bdf8", // Cyan
  "#10b981", // Emerald
  "#f43f5e", // Coral/Red
  "#a855f7", // Purple
  "#facc15", // Yellow
  "#3b82f6", // Vivid Blue
  "#2dd4bf", // Teal
  "#ec4899", // Fuchsia
  "#f97316"  // Orange
];

let globalStats = {
  total_seconds: 0,
  apps: [],
  hourly: []
};

let currentRange = "today";
let autoRefreshTimer = null;

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

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[m]);
}

function assignAppColors(apps) {
  const map = new Map();
  (apps || []).forEach((app, idx) => {
    map.set(app.app_name, PALETTE[idx % PALETTE.length]);
  });
  return map;
}

async function fetchMetrics() {
  try {
    const res = await fetch(`/api/stats?range=${encodeURIComponent(currentRange)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    globalStats = await res.json();
    if (typeof mountCurrent === "function") {
      mountCurrent();
    }
  } catch (err) {
    console.error("Failed to load metrics:", err);
  }
}

/* ==========================================================================
   VARIANT 1: "Chunky Neo" (Dribbble / Image 1 Inspo)
   ========================================================================== */
function renderVariant1() {
  const data = globalStats;
  const { total_seconds, apps, hourly } = data;
  const colors = assignAppColors(apps);
  const topApp = (apps && apps.length > 0) ? apps[0] : null;

  // Horizon Bar Segments
  const horizonSegments = (apps && apps.length > 0)
    ? apps.map(app => {
        const c = colors.get(app.app_name) || "#38bdf8";
        return `<div class="v1-horizon-seg" style="width: ${Math.max(1, app.percentage)}%; background-color: ${c}" title="${escapeHtml(app.app_name)}: ${app.percentage}%"></div>`;
      }).join("")
    : `<div class="v1-horizon-seg" style="width: 100%; background: var(--surface-raised)"></div>`;

  // Legend Pills
  const legendPills = (apps && apps.length > 0)
    ? apps.slice(0, 8).map(app => {
        const c = colors.get(app.app_name) || "#38bdf8";
        return `
          <div class="v1-legend-pill">
            <span class="v1-legend-dot" style="background-color: ${c}"></span>
            <span>${escapeHtml(app.app_name)}</span>
            <span class="v1-legend-pct">${app.percentage}%</span>
          </div>
        `;
      }).join("")
    : `<div style="color: var(--text-tertiary); font-size: 13px;">No usage logged</div>`;

  // 24-Hour Waveform
  const maxSec = Math.max(...(hourly || []).map(h => h.seconds), 60);
  const timelineCols = (hourly || []).map(h => {
    const pct = Math.min(100, Math.round((h.seconds / maxSec) * 100));
    const active = h.seconds > 0;
    const hStr = h.hour.toString().padStart(2, "0");
    const durStr = formatShortDuration(h.seconds);
    return `
      <div class="v1-timeline-col">
        <div class="v1-timeline-bar ${active ? 'active' : ''}" style="height: ${active ? Math.max(12, pct) : 6}%" title="${hStr}:00 - ${durStr}"></div>
      </div>
    `;
  }).join("");

  // Chunky App Cards Grid
  const appCards = (apps && apps.length > 0)
    ? apps.map(app => {
        const c = colors.get(app.app_name) || "#38bdf8";
        const initial = (app.app_name || "A").charAt(0).toUpperCase();
        return `
          <div class="v1-app-card">
            <div class="v1-app-header">
              <div class="v1-app-identity">
                <div class="v1-app-icon-badge" style="background-color: ${c}">
                  ${initial}
                </div>
                <div class="v1-app-titles">
                  <span class="v1-app-title-text">${escapeHtml(app.app_name)}</span>
                  <span class="v1-app-exe-meta">${escapeHtml(app.exe_name || "")}</span>
                </div>
              </div>
              <span class="v1-app-pct-badge">${app.percentage}%</span>
            </div>
            <div class="v1-app-middle">
              <span class="v1-app-duration">${formatDuration(app.total_seconds)}</span>
            </div>
            <div class="v1-chunky-track">
              <div class="v1-chunky-fill" style="width: ${Math.min(100, Math.max(2, app.percentage))}%; background-color: ${c}"></div>
            </div>
          </div>
        `;
      }).join("")
    : `<div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--text-tertiary);">No applications active in this time window.</div>`;

  return `
    <div class="v1-shell">
      <!-- 1. Top Hero Row (Image 1 Color-Blocked Inspo) -->
      <section class="v1-hero-grid">
        <!-- Yellow Active Card -->
        <div class="v1-yellow-card">
          <div class="v1-card-top-row">
            <span class="v1-card-label">Total Screen Time</span>
            <span class="v1-card-badge">${apps ? apps.length : 0} Active Apps</span>
          </div>
          <div class="v1-massive-timer">${formatDuration(total_seconds)}</div>
          <div class="v1-range-pills">
            <button class="v1-pill-btn ${currentRange === 'today' ? 'active' : ''}" data-range="today">Today</button>
            <button class="v1-pill-btn ${currentRange === 'yesterday' ? 'active' : ''}" data-range="yesterday">Yesterday</button>
            <button class="v1-pill-btn ${currentRange === '7days' ? 'active' : ''}" data-range="7days">7 Days</button>
          </div>
        </div>

        <!-- Blue Top App Card -->
        <div class="v1-blue-card">
          <div class="v1-card-top-row">
            <span class="v1-card-label" style="color: rgba(255,255,255,0.9)">Peak Application</span>
            <span class="v1-card-badge">${topApp ? topApp.percentage + '%' : '0%'}</span>
          </div>
          <div class="v1-top-app-details">
            <div class="v1-top-app-name">${topApp ? escapeHtml(topApp.app_name) : '—'}</div>
            <div class="v1-top-app-sub">${topApp ? formatDuration(topApp.total_seconds) + ' logged' : 'No activity logged'}</div>
          </div>
          <div class="v1-blue-gauge-track">
            <div class="v1-blue-gauge-fill" style="width: ${topApp ? Math.min(100, Math.max(3, topApp.percentage)) : 0}%"></div>
          </div>
        </div>
      </section>

      <!-- 2. Full-Width Chunky Horizon Bar -->
      <section class="v1-section-card">
        <div class="v1-section-header">
          <span class="v1-section-title">Application Distribution Stream</span>
        </div>
        <div class="v1-horizon-bar">${horizonSegments}</div>
        <div class="v1-legend-row">${legendPills}</div>
      </section>

      <!-- 3. Chunky 24-Hour Waveform Timeline -->
      <section class="v1-section-card">
        <div class="v1-section-header">
          <span class="v1-section-title">24-Hour Chronological Waveform</span>
        </div>
        <div class="v1-timeline-track">${timelineCols}</div>
        <div class="v1-timeline-axis">
          <span>00:00</span><span>04:00</span><span>08:00</span><span>12:00</span><span>16:00</span><span>20:00</span><span>23:00</span>
        </div>
      </section>

      <!-- 4. Tactile App Cards Grid -->
      <section class="v1-app-grid">
        ${appCards}
      </section>
    </div>
  `;
}

/* ==========================================================================
   VARIANT 2: "Solid Bento" (Integrated Progress Slabs)
   ========================================================================== */
function renderVariant2() {
  const data = globalStats;
  const { total_seconds, apps } = data;
  const colors = assignAppColors(apps);
  const topApp = (apps && apps.length > 0) ? apps[0] : null;

  const horizonChunks = (apps && apps.length > 0)
    ? apps.map(app => {
        const c = colors.get(app.app_name) || "#38bdf8";
        return `<div class="v2-horizon-chunk" style="width: ${Math.max(1, app.percentage)}%; background-color: ${c}"></div>`;
      }).join("")
    : `<div class="v2-horizon-chunk" style="width: 100%; background: var(--surface-raised)"></div>`;

  const legendTiles = (apps && apps.length > 0)
    ? apps.slice(0, 6).map(app => {
        const c = colors.get(app.app_name) || "#38bdf8";
        return `
          <div class="v2-legend-tile" style="border-left-color: ${c}">
            <span class="v2-legend-title">${escapeHtml(app.app_name)}</span>
            <span class="v2-legend-val">${app.percentage}%</span>
          </div>
        `;
      }).join("")
    : ``;

  const bentoAppCards = (apps && apps.length > 0)
    ? apps.map(app => {
        const c = colors.get(app.app_name) || "#38bdf8";
        return `
          <div class="v2-bento-app-card">
            <div class="v2-card-body">
              <div class="v2-card-app-top">
                <span class="v2-card-name">${escapeHtml(app.app_name)}</span>
                <span class="v2-card-pct-giant" style="color: ${c}">${app.percentage}%</span>
              </div>
              <div class="v2-card-meta-row">
                <span class="v2-card-exe">${escapeHtml(app.exe_name || "")}</span>
                <span class="v2-card-dur">${formatDuration(app.total_seconds)}</span>
              </div>
            </div>
            <div class="v2-gauge-slab-track">
              <div class="v2-gauge-slab-fill" style="width: ${Math.min(100, Math.max(2, app.percentage))}%; background-color: ${c}"></div>
            </div>
          </div>
        `;
      }).join("")
    : `<div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--text-tertiary);">No applications active.</div>`;

  return `
    <div class="v2-shell">
      <!-- Top Navigation Bar -->
      <header class="v2-top-bar">
        <div class="v2-brand-box">
          <span class="v2-brand-name">ScreenTime Bento</span>
        </div>
        <div class="v2-time-range-group">
          <button class="v2-range-btn ${currentRange === 'today' ? 'active' : ''}" data-range="today">Today</button>
          <button class="v2-range-btn ${currentRange === 'yesterday' ? 'active' : ''}" data-range="yesterday">Yesterday</button>
          <button class="v2-range-btn ${currentRange === '7days' ? 'active' : ''}" data-range="7days">Last 7 Days</button>
        </div>
      </header>

      <!-- Bento Hero Row -->
      <section class="v2-bento-hero-row">
        <div class="v2-hero-slab">
          <span class="v2-hero-watermark">24H</span>
          <div class="v2-slab-header">
            <span class="v2-slab-title">Active Duration</span>
            <span class="v2-slab-badge">Live WAL Storage</span>
          </div>
          <div class="v2-hero-digits">${formatDuration(total_seconds)}</div>
        </div>

        <div class="v2-hero-slab">
          <span class="v2-hero-watermark">${topApp ? topApp.percentage + '%' : '0%'}</span>
          <div class="v2-slab-header">
            <span class="v2-slab-title">Top Process</span>
            <span class="v2-slab-badge" style="color: var(--blue-primary);">${topApp ? topApp.percentage + '%' : '—'}</span>
          </div>
          <div class="v2-hero-digits" style="font-size: 2.2rem;">${topApp ? escapeHtml(topApp.app_name) : '—'}</div>
        </div>
      </section>

      <!-- Horizon Slab -->
      <section class="v2-horizon-slab">
        <div class="v2-slab-title">Proportional Time Distribution</div>
        <div class="v2-horizon-track">${horizonChunks}</div>
        <div class="v2-legend-matrix">${legendTiles}</div>
      </section>

      <!-- Bento Apps Grid -->
      <section class="v2-app-bento-grid">
        ${bentoAppCards}
      </section>
    </div>
  `;
}

/* ==========================================================================
   VARIANT 3: "Waveform Studio" (100vw Desktop Console)
   ========================================================================== */
function renderVariant3() {
  const data = globalStats;
  const { total_seconds, apps, hourly } = data;
  const colors = assignAppColors(apps);
  const topApp = (apps && apps.length > 0) ? apps[0] : null;

  const horizonSegs = (apps && apps.length > 0)
    ? apps.map(app => {
        const c = colors.get(app.app_name) || "#38bdf8";
        return `<div class="v3-horizon-seg" style="width: ${Math.max(1, app.percentage)}%; background-color: ${c}"></div>`;
      }).join("")
    : `<div class="v3-horizon-seg" style="width: 100%; background: var(--surface-raised)"></div>`;

  const maxSec = Math.max(...(hourly || []).map(h => h.seconds), 60);
  const timelineCols = (hourly || []).map(h => {
    const pct = Math.min(100, Math.round((h.seconds / maxSec) * 100));
    const active = h.seconds > 0;
    const hStr = h.hour.toString().padStart(2, "0");
    const durStr = formatShortDuration(h.seconds);
    return `
      <div class="v1-timeline-col">
        <div class="v1-timeline-bar ${active ? 'active' : ''}" style="height: ${active ? Math.max(10, pct) : 5}%; max-width: 14px; background: ${active ? 'var(--blue-primary)' : 'rgba(255,255,255,0.06)'}" title="${hStr}:00 - ${durStr}"></div>
      </div>
    `;
  }).join("");

  const appRows = (apps && apps.length > 0)
    ? apps.map(app => {
        const c = colors.get(app.app_name) || "#38bdf8";
        return `
          <div class="v3-app-row">
            <div class="v3-app-row-top">
              <div class="v3-app-name-box">
                <span class="v3-app-color-bar" style="background-color: ${c}"></span>
                <span class="v3-app-name">${escapeHtml(app.app_name)}</span>
                <span class="v3-app-exe">${escapeHtml(app.exe_name || "")}</span>
              </div>
              <div class="v3-app-stat-group">
                <span class="v3-app-time">${formatDuration(app.total_seconds)}</span>
                <span class="v3-app-pct" style="color: ${c}">${app.percentage}%</span>
              </div>
            </div>
            <div class="v3-app-row-track">
              <div class="v3-app-row-fill" style="width: ${Math.min(100, Math.max(1, app.percentage))}%; background-color: ${c}"></div>
            </div>
          </div>
        `;
      }).join("")
    : `<div style="padding: 40px; text-align: center; color: var(--text-tertiary);">No applications active.</div>`;

  return `
    <div class="v3-studio-shell">
      <aside class="v3-sidebar">
        <div style="display:flex; flex-direction:column; gap: 24px;">
          <span class="v3-brand-title">ScreenTime Studio</span>
          <div class="v3-range-stack">
            <button class="v3-range-btn ${currentRange === 'today' ? 'active' : ''}" data-range="today">Today</button>
            <button class="v3-range-btn ${currentRange === 'yesterday' ? 'active' : ''}" data-range="yesterday">Yesterday</button>
            <button class="v3-range-btn ${currentRange === '7days' ? 'active' : ''}" data-range="7days">Last 7 Days</button>
          </div>
        </div>

        <div class="v3-telemetry-box">
          <span style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: var(--text-secondary);">Duration</span>
          <div class="v3-telemetry-digits">${formatDuration(total_seconds)}</div>
          <div style="font-size: 12px; color: var(--green-primary); font-weight: 700;">Top: ${topApp ? escapeHtml(topApp.app_name) : '—'} (${topApp ? topApp.percentage : 0}%)</div>
        </div>
      </aside>

      <main class="v3-main-stage">
        <section class="v3-card">
          <span style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: var(--text-secondary);">Horizon Distribution</span>
          <div class="v3-horizon-bar">${horizonSegs}</div>
        </section>

        <section class="v3-card">
          <span style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: var(--text-secondary);">24-Hour Waveform</span>
          <div class="v1-timeline-track">${timelineCols}</div>
        </section>

        <section class="v3-app-table">
          ${appRows}
        </section>
      </main>
    </div>
  `;
}

/* ==========================================================================
   PROTOTYPE PICKER HARNESS WIRING (VERBATIM SPECIFICATION FROM PICKER.MD)
   ========================================================================== */
const variants = [renderVariant1, renderVariant2, renderVariant3];
const stage = document.getElementById('stage');
const picker = document.querySelector('.proto-picker');
const highlight = picker.querySelector('.proto-picker-highlight');
const items = [...picker.querySelectorAll('.proto-picker-item:not(.proto-picker-replay)')];
const replay = picker.querySelector('.proto-picker-replay');
let current = 0;

function moveHighlight() {
  const el = items[current];
  if (!el) return;
  highlight.style.width = el.offsetWidth + 'px';
  highlight.style.transform = `translateX(${el.offsetLeft}px)`;
}

function bindStageEvents() {
  // Bind range buttons inside whatever variant rendered
  document.querySelectorAll("[data-range]").forEach(btn => {
    btn.addEventListener("click", () => {
      currentRange = btn.getAttribute("data-range");
      fetchMetrics();
    });
  });
}

function mount(i) {
  stage.innerHTML = '';
  // Clear first, render next frame, so entrance animations re-run.
  requestAnimationFrame(() => {
    stage.innerHTML = variants[i]();
    bindStageEvents();
  });
}

function mountCurrent() {
  mount(current);
}

function setActive(i) {
  if (i < 0 || i >= variants.length) return;
  current = i;
  items.forEach((el, j) => {
    el.toggleAttribute('data-active', j === i);
    if (j === i) el.setAttribute('aria-current', 'true');
    else el.removeAttribute('aria-current');
  });
  moveHighlight();
  const url = new URL(location);
  url.searchParams.set('v', i + 1);
  history.replaceState(null, '', url);
  mount(i);
}

items.forEach((el, i) => el.addEventListener('click', () => setActive(i)));
replay?.addEventListener('click', () => mount(current));
window.addEventListener('resize', moveHighlight);

document.addEventListener('keydown', (e) => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const num = parseInt(e.key, 10);
  if (num >= 1 && num <= variants.length) setActive(num - 1);
  else if (e.key === 'ArrowRight') setActive((current + 1) % variants.length);
  else if (e.key === 'ArrowLeft') setActive((current - 1 + variants.length) % variants.length);
  else if (e.key === 'r' || e.key === 'R') mount(current);
});

// Auto refresh background data
function startAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(fetchMetrics, 10000);
}

fetchMetrics().then(() => {
  const initialIdx = (parseInt(new URLSearchParams(location.search).get('v'), 10) || 1) - 1;
  setActive(initialIdx);
  // Enable the slide only after first paint, so load doesn't animate.
  requestAnimationFrame(() => requestAnimationFrame(() => picker.setAttribute('data-ready', '')));
  startAutoRefresh();
});
