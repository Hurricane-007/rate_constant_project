/**
 * Chemical Reaction Engineering: Reactors in Series Analyzer
 * Standalone Client-Side Application Engine
 * Includes Levenspiel constant k*tau and k*CA0*tau contour lines matching textbook figures
 */

// Application State
const state = {
  order: 1, // 1 for first-order, 2 for second-order, 'compare' for overlay
  x: 0.10,  // CA/CA0 (0 < x < 1)
  y: 2.0,   // tau_N / tau_P (>= 1)
  n: 3,     // Number of equal CSTRs
  liveUpdate: true,
  showContours: true, // Toggle constant k*tau or k*CA0*tau lines
  theme: localStorage.getItem('cre_theme') || 'light'
};

// Colors for plot series
const SERIES_COLORS = [
  '#dc2626', // N=1 (red)
  '#ea580c', // N=2 (orange)
  '#d97706', // N=3 (amber)
  '#16a34a', // N=4 (green)
  '#0284c7', // N=6 (sky)
  '#2563eb', // N=10 (blue)
  '#7c3aed', // N=50 (purple)
  '#db2777'  // pink
];

// --- MATHEMATICAL FUNCTIONS ---

/** First-Order Kinetics: returns { k_tau_n, k_tau_p, ratio, stageConcs } */
function calcFirstOrder(x, n) {
  if (x <= 0 || x >= 1 || n < 1) return null;
  const k_tau_n = n * (Math.pow(x, -1.0 / n) - 1.0);
  const k_tau_p = -Math.log(x);
  const ratio = k_tau_n / k_tau_p;

  const stageConcs = [1.0];
  for (let i = 1; i <= n; i++) {
    stageConcs.push(Math.pow(x, i / n));
  }

  return { k_tau_n, k_tau_p, ratio, stageConcs };
}

/** Dimensionless outlet concentration after N CSTRs for second-order kinetics */
function outletAfterNCstrsSecondOrder(beta, n) {
  let c = 1.0;
  for (let i = 0; i < n; i++) {
    c = (2.0 * c) / (1.0 + Math.sqrt(1.0 + 4.0 * beta * c));
  }
  return c;
}

/** Solve for beta = k * CA0 * tau_stage by bisection */
function solveBetaSecondOrder(x, n) {
  if (x <= 0 || x >= 1 || n < 1) return null;
  let lo = 0.0;
  let hi = 1.0;
  while (outletAfterNCstrsSecondOrder(hi, n) > x) {
    hi *= 2.0;
    if (hi > 1e16) return null;
  }
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2.0;
    if (outletAfterNCstrsSecondOrder(mid, n) > x) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2.0;
}

/** Second-Order Kinetics: returns { beta, k_tau_n, k_tau_p, ratio, stageConcs } */
function calcSecondOrder(x, n) {
  if (x <= 0 || x >= 1 || n < 1) return null;
  const beta = solveBetaSecondOrder(x, n);
  if (beta === null) return null;
  const k_tau_n = n * beta;
  const k_tau_p = (1.0 / x) - 1.0;
  const ratio = k_tau_n / k_tau_p;

  const stageConcs = [1.0];
  let curr = 1.0;
  for (let i = 1; i <= n; i++) {
    curr = (2.0 * curr) / (1.0 + Math.sqrt(1.0 + 4.0 * beta * curr));
    stageConcs.push(curr);
  }

  return { beta, k_tau_n, k_tau_p, ratio, stageConcs };
}

function getRatio(order, x, n) {
  if (order === 1) {
    const res = calcFirstOrder(x, n);
    return res ? res.ratio : null;
  } else {
    const res = calcSecondOrder(x, n);
    return res ? res.ratio : null;
  }
}

// --- DOM ELEMENTS ---
const el = {
  themeToggle: document.getElementById('themeToggle'),
  tabFirst: document.getElementById('tabFirst'),
  tabSecond: document.getElementById('tabSecond'),
  tabCompare: document.getElementById('tabCompare'),
  
  // Inputs
  xSlider: document.getElementById('xSlider'),
  xNumber: document.getElementById('xNumber'),
  yNumber: document.getElementById('yNumber'),
  nSlider: document.getElementById('nSlider'),
  nNumber: document.getElementById('nNumber'),
  liveUpdateCheck: document.getElementById('liveUpdateCheck'),
  contourToggleCheck: document.getElementById('contourToggleCheck'),
  calcBtn: document.getElementById('calcBtn'),
  resetBtn: document.getElementById('resetBtn'),
  exportPlotBtn: document.getElementById('exportPlotBtn'),
  
  // Results
  metricConversion: document.getElementById('metricConversion'),
  conversionBar: document.getElementById('conversionBar'),
  metricReactant: document.getElementById('metricReactant'),
  metricEnteredY: document.getElementById('metricEnteredY'),
  metricPredictedY: document.getElementById('metricPredictedY'),
  metricDeviation: document.getElementById('metricDeviation'),
  metricTauN: document.getElementById('metricTauN'),
  metricTauP: document.getElementById('metricTauP'),
  labelTauN: document.getElementById('labelTauN'),
  labelTauP: document.getElementById('labelTauP'),
  statusCard: document.getElementById('statusCard'),
  statusTitle: document.getElementById('statusTitle'),
  statusDesc: document.getElementById('statusDesc'),
  reactorChain: document.getElementById('reactorChain'),
  
  // Canvas
  canvas: document.getElementById('reactorCanvas'),
  tooltip: document.getElementById('graphTooltip'),
  legendList: document.getElementById('legendList'),
  theoryFirst: document.getElementById('theoryFirst'),
  theorySecond: document.getElementById('theorySecond')
};

// --- INITIALIZATION ---
function init() {
  applyTheme(state.theme);
  setupEventListeners();
  render();
}

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('cre_theme', theme);
  el.themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
  drawGraph();
}

function setupEventListeners() {
  el.themeToggle.addEventListener('click', () => {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  });

  el.tabFirst.addEventListener('click', () => switchOrder(1));
  el.tabSecond.addEventListener('click', () => switchOrder(2));
  el.tabCompare.addEventListener('click', () => switchOrder('compare'));

  el.xSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    state.x = val;
    el.xNumber.value = val.toFixed(3);
    if (state.liveUpdate) render();
  });

  el.xNumber.addEventListener('change', (e) => {
    let val = parseFloat(e.target.value);
    if (isNaN(val) || val <= 0.001) val = 0.001;
    if (val >= 0.999) val = 0.999;
    state.x = val;
    el.xNumber.value = val.toFixed(3);
    el.xSlider.value = val;
    if (state.liveUpdate) render();
  });

  el.yNumber.addEventListener('change', (e) => {
    let val = parseFloat(e.target.value);
    if (isNaN(val) || val < 1.0) val = 1.0;
    state.y = val;
    el.yNumber.value = val.toFixed(3);
    if (state.liveUpdate) render();
  });

  el.nSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    state.n = val;
    el.nNumber.value = val;
    if (state.liveUpdate) render();
  });

  el.nNumber.addEventListener('change', (e) => {
    let val = parseInt(e.target.value, 10);
    if (isNaN(val) || val < 1) val = 1;
    if (val > 100) val = 100;
    state.n = val;
    el.nNumber.value = val;
    el.nSlider.value = val <= 50 ? val : 50;
    if (state.liveUpdate) render();
  });

  el.liveUpdateCheck.addEventListener('change', (e) => {
    state.liveUpdate = e.target.checked;
  });

  if (el.contourToggleCheck) {
    el.contourToggleCheck.addEventListener('change', (e) => {
      state.showContours = e.target.checked;
      drawGraph();
    });
  }

  el.calcBtn.addEventListener('click', render);
  el.resetBtn.addEventListener('click', resetDefaults);
  el.exportPlotBtn.addEventListener('click', exportPlotImage);

  document.querySelectorAll('.preset-chip').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const presetX = parseFloat(e.currentTarget.dataset.x);
      const presetY = parseFloat(e.currentTarget.dataset.y);
      const presetN = parseInt(e.currentTarget.dataset.n, 10);
      state.x = presetX;
      state.y = presetY;
      state.n = presetN;
      syncInputs();
      render();
    });
  });

  window.addEventListener('resize', debounce(drawGraph, 100));
  setupCanvasEvents();
}

function switchOrder(newOrder) {
  state.order = newOrder;
  el.tabFirst.classList.toggle('active', newOrder === 1);
  el.tabSecond.classList.toggle('active', newOrder === 2);
  el.tabCompare.classList.toggle('active', newOrder === 'compare');

  if (newOrder === 1) {
    el.theoryFirst.style.display = 'block';
    el.theorySecond.style.display = 'none';
    el.labelTauN.textContent = 'k·τN';
    el.labelTauP.textContent = 'k·τP';
  } else if (newOrder === 2) {
    el.theoryFirst.style.display = 'none';
    el.theorySecond.style.display = 'block';
    el.labelTauN.textContent = 'k·CA0·τN';
    el.labelTauP.textContent = 'k·CA0·τP';
  } else {
    el.theoryFirst.style.display = 'block';
    el.theorySecond.style.display = 'block';
    el.labelTauN.textContent = 'Space-time τN (1st/2nd)';
    el.labelTauP.textContent = 'Space-time τP (1st/2nd)';
  }

  render();
}

function resetDefaults() {
  state.x = 0.10;
  state.y = 2.0;
  state.n = 3;
  syncInputs();
  render();
}

function syncInputs() {
  el.xSlider.value = state.x;
  el.xNumber.value = state.x.toFixed(3);
  el.yNumber.value = state.y.toFixed(3);
  el.nSlider.value = state.n <= 50 ? state.n : 50;
  el.nNumber.value = state.n;
}

// --- CALCULATION & RENDERING ---
function render() {
  const x = state.x;
  const y = state.y;
  const n = state.n;

  const conversion = 1.0 - x;
  el.metricConversion.textContent = `${(conversion * 100).toFixed(2)}%`;
  el.conversionBar.style.width = `${Math.min(100, Math.max(0, conversion * 100))}%`;
  el.metricReactant.textContent = x.toFixed(4);
  el.metricEnteredY.textContent = y.toFixed(3);

  let predicted = null;
  let res1 = calcFirstOrder(x, n);
  let res2 = calcSecondOrder(x, n);

  if (state.order === 1) {
    predicted = res1.ratio;
    el.metricTauN.textContent = res1.k_tau_n.toFixed(4);
    el.metricTauP.textContent = res1.k_tau_p.toFixed(4);
    renderReactorCascade(res1.stageConcs);
  } else if (state.order === 2) {
    predicted = res2.ratio;
    el.metricTauN.textContent = res2.k_tau_n.toFixed(4);
    el.metricTauP.textContent = res2.k_tau_p.toFixed(4);
    renderReactorCascade(res2.stageConcs);
  } else {
    predicted = res1.ratio;
    el.metricTauN.textContent = `1st: ${res1.k_tau_n.toFixed(3)} | 2nd: ${res2.k_tau_n.toFixed(3)}`;
    el.metricTauP.textContent = `1st: ${res1.k_tau_p.toFixed(3)} | 2nd: ${res2.k_tau_p.toFixed(3)}`;
    renderReactorCascade(res2.stageConcs);
  }

  el.metricPredictedY.textContent = predicted.toFixed(4);

  const errorPct = Math.abs(y - predicted) / predicted * 100.0;
  el.metricDeviation.textContent = `${errorPct.toFixed(2)}%`;

  if (errorPct <= 5.0) {
    el.statusCard.className = 'status-card consistent';
    el.statusTitle.textContent = `Model Consistency: High (Δ = ${errorPct.toFixed(2)}%)`;
    el.statusDesc.textContent = `The entered coordinates (x = ${x.toFixed(3)}, y = ${y.toFixed(3)}) align within 5% of the theoretical ${state.order === 2 ? 'second-order' : 'first-order'} kinetic model for N = ${n} CSTRs in series.`;
  } else {
    el.statusCard.className = 'status-card discrepancy';
    el.statusTitle.textContent = `Model Deviation: ${errorPct.toFixed(2)}% Discrepancy`;
    el.statusDesc.textContent = `The entered ratio y = ${y.toFixed(3)} deviates from the theoretical predicted ratio (${predicted.toFixed(3)}) for N = ${n}. True fractional conversion remains XA = ${(conversion * 100).toFixed(2)}% based on x.`;
  }

  drawGraph();
}

function renderReactorCascade(stageConcs) {
  if (!el.reactorChain) return;
  el.reactorChain.innerHTML = '';

  const inletBox = document.createElement('div');
  inletBox.className = 'tank-box';
  inletBox.style.borderColor = 'var(--accent)';
  inletBox.innerHTML = `<div class="tank-label" style="color:var(--accent);">Feed In</div><div class="tank-conc">CA0 = 1.00</div>`;
  el.reactorChain.appendChild(inletBox);

  const displayCount = Math.min(state.n, 6);
  for (let i = 1; i <= displayCount; i++) {
    const arrow = document.createElement('div');
    arrow.className = 'tank-arrow';
    arrow.textContent = '➔';
    el.reactorChain.appendChild(arrow);

    const cVal = stageConcs[i] !== undefined ? stageConcs[i] : (stageConcs[stageConcs.length - 1]);
    const tank = document.createElement('div');
    tank.className = 'tank-box';
    tank.innerHTML = `
      <div class="tank-label">CSTR #${i}</div>
      <div class="tank-conc">${cVal.toFixed(3)}</div>
    `;
    el.reactorChain.appendChild(tank);
  }

  if (state.n > 6) {
    const ellipsis = document.createElement('div');
    ellipsis.className = 'tank-arrow';
    ellipsis.textContent = `... (+${state.n - 6} more) ➔`;
    el.reactorChain.appendChild(ellipsis);

    const finalTank = document.createElement('div');
    finalTank.className = 'tank-box';
    finalTank.style.borderColor = 'var(--success)';
    const finalVal = stageConcs[stageConcs.length - 1];
    finalTank.innerHTML = `
      <div class="tank-label" style="color:var(--success);">CSTR #${state.n}</div>
      <div class="tank-conc">${finalVal.toFixed(3)}</div>
    `;
    el.reactorChain.appendChild(finalTank);
  }
}

// --- LOG-LOG GRAPH RENDERING ENGINE ---
let graphBounds = null;

function drawGraph() {
  const canvas = el.canvas;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#cbd5e1' : '#334155';
  const gridColor = isDark ? 'rgba(71, 85, 105, 0.35)' : 'rgba(203, 213, 225, 0.65)';
  const axisColor = isDark ? '#94a3b8' : '#334155';
  const contourColor = isDark ? 'rgba(148, 163, 184, 0.75)' : 'rgba(71, 85, 105, 0.85)';

  // Margins tailored to accommodate labels exactly like Levenspiel figures
  const m = { top: 35, right: 35, bottom: 60, left: 75 };
  const pw = w - m.left - m.right;
  const ph = h - m.top - m.bottom;

  // Domain & Range in log space
  const xMin = 0.01;
  const xMax = 1.0;
  let yMin = 1.0;
  let yMax = (state.order === 1) ? 30 : 100;

  const logXMin = Math.log10(xMin);
  const logXMax = Math.log10(xMax);
  const logYMin = Math.log10(yMin);
  const logYMax = Math.log10(yMax);

  // Mapping functions
  const toCanvasX = (xVal) => m.left + ((Math.log10(xVal) - logXMin) / (logXMax - logXMin)) * pw;
  const toCanvasY = (yVal) => m.top + ph - ((Math.log10(yVal) - logYMin) / (logYMax - logYMin)) * ph;
  const fromCanvasX = (cx) => Math.pow(10, logXMin + ((cx - m.left) / pw) * (logXMax - logXMin));
  const fromCanvasY = (cy) => Math.pow(10, logYMin + ((m.top + ph - cy) / ph) * (logYMax - logYMin));

  graphBounds = { m, pw, ph, w, h, xMin, xMax, yMin, yMax, toCanvasX, toCanvasY, fromCanvasX, fromCanvasY };

  // Clear
  ctx.clearRect(0, 0, w, h);

  // Top Title banner inside graph matching textbook figures
  ctx.fillStyle = textColor;
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'right';
  const figTitle = (state.order === 1) ? 'First-order reaction' : (state.order === 2 ? 'Second-order reaction' : 'First & Second Order Comparison');
  ctx.fillText(figTitle, m.left + pw - 10, m.top + 20);

  // Draw Grid Lines (Logarithmic)
  // X grid: 0.01 to 1.0
  const xDecades = [-2, -1, 0];
  xDecades.forEach(exp => {
    const base = Math.pow(10, exp);
    for (let sub = 1; sub <= 10; sub++) {
      const val = base * sub;
      if (val > 1.0001) break;
      const cx = toCanvasX(val);
      const isMajor = (sub === 1 || sub === 10);

      ctx.beginPath();
      ctx.setLineDash(isMajor ? [] : [2, 3]);
      ctx.strokeStyle = isMajor ? gridColor : (isDark ? 'rgba(71,85,105,0.2)' : 'rgba(226,232,240,0.7)');
      ctx.moveTo(cx, m.top);
      ctx.lineTo(cx, m.top + ph);
      ctx.stroke();

      if (isMajor || sub === 2 || sub === 5) {
        ctx.setLineDash([]);
        ctx.fillStyle = textColor;
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(val < 0.1 ? val.toFixed(2) : (val === 1 ? '1.0' : val.toFixed(1)), cx, m.top + ph + 18);
      }
    }
  });

  // Y grid: 1 to yMax
  const yDecades = [0, 1, 2];
  yDecades.forEach(exp => {
    const base = Math.pow(10, exp);
    for (let sub = 1; sub <= 10; sub++) {
      const val = base * sub;
      if (val < yMin || val > yMax * 1.01) continue;
      const cy = toCanvasY(val);
      const isMajor = (sub === 1 || sub === 10);

      ctx.beginPath();
      ctx.setLineDash(isMajor ? [] : [2, 3]);
      ctx.strokeStyle = isMajor ? gridColor : (isDark ? 'rgba(71,85,105,0.2)' : 'rgba(226,232,240,0.7)');
      ctx.moveTo(m.left, cy);
      ctx.lineTo(m.left + pw, cy);
      ctx.stroke();

      if (isMajor || (exp === 0 && (sub === 2 || sub === 5)) || (exp === 1 && (sub === 2 || sub === 5))) {
        ctx.setLineDash([]);
        ctx.fillStyle = textColor;
        ctx.font = '11px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(val.toString(), m.left - 8, cy + 4);
      }
    }
  });

  // Highlight border box for axes
  ctx.setLineDash([]);
  ctx.strokeStyle = axisColor;
  ctx.lineWidth = 1.6;
  ctx.strokeRect(m.left, m.top, pw, ph);

  // Axis Labels formatted to match Levenspiel figures
  ctx.fillStyle = textColor;
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('1 − XA = CA / CA₀', m.left + pw / 2, m.top + ph + 46);

  ctx.save();
  ctx.translate(22, m.top + ph / 2);
  ctx.rotate(-Math.PI / 2);
  if (state.order === 1) {
    ctx.fillText('τN / τP = (CA0·V / FA0)_N / (CA0·V / FA0)_plug', 0, 0);
  } else {
    ctx.fillText('(τ·CA0)_N / (τ·CA0)_P = (CA0²·V / FA0)_N / (CA0²·V / FA0)_plug', 0, 0);
  }
  ctx.restore();

  // --- DRAW CONSTANT k*tau OR k*CA0*tau CONTOURS (LEVENSPIEL CONSTANTS) ---
  if (state.showContours) {
    drawLevenspielContours(ctx, toCanvasX, toCanvasY, m, pw, ph, contourColor, isDark);
  }

  // --- DRAW SOLID N CURVES ---
  const ns = (state.order === 1) ? [1, 2, 3, 4, 6, 10] : [1, 2, 3, 4, 6, 10];
  const xSamples = 160;
  const logStep = (logXMax - logXMin) / (xSamples - 1);

  renderLegend(ns);

  // Draw curves and their labels along the curve
  ns.forEach((nVal, idx) => {
    const isSelected = (nVal === state.n);
    const color = isSelected ? '#2563eb' : (isDark ? '#e2e8f0' : '#0f172a');
    const width = isSelected ? 3.0 : 2.0;

    if (state.order === 'compare') {
      drawNCurve(1, nVal, '#3b82f6', [3, 2], 1.5, nVal === 1 || nVal === 2);
      drawNCurve(2, nVal, '#ef4444', [], 2.0, true);
    } else {
      drawNCurve(state.order, nVal, color, [], width, true);
    }
  });

  // Reference PFR Limit (N -> infinity, y = 1.0)
  const pfrY = toCanvasY(1.0);
  ctx.beginPath();
  ctx.setLineDash([]);
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = isDark ? '#94a3b8' : '#334155';
  ctx.moveTo(m.left, pfrY);
  ctx.lineTo(m.left + pw, pfrY);
  ctx.stroke();

  // Label N -> inf (plug flow)
  ctx.font = 'bold 11px sans-serif';
  ctx.fillStyle = textColor;
  ctx.textAlign = 'left';
  ctx.fillText('N = ∞ (plug flow)', m.left + 25, pfrY - 8);

  // If user selected custom N (e.g. N=5, 7, etc.), draw dynamic highlighted curve
  if (!ns.includes(state.n)) {
    const customColor = '#ec4899';
    drawNCurve(state.order === 'compare' ? 1 : state.order, state.n, customColor, [4, 2], 3.0, true);
  }

  function drawNCurve(ord, nVal, color, dash, width, labelCurve) {
    ctx.beginPath();
    ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;

    let points = [];
    for (let i = 0; i < xSamples; i++) {
      const curX = Math.pow(10, logXMin + i * logStep);
      if (curX >= 0.999) continue;
      const curY = getRatio(ord, curX, nVal);
      if (curY === null || isNaN(curY) || curY > yMax * 1.5) continue;

      const cx = toCanvasX(curX);
      const cy = toCanvasY(curY);
      points.push({ x: curX, y: curY, cx, cy });

      if (points.length === 1) {
        ctx.moveTo(cx, cy);
      } else {
        ctx.lineTo(cx, cy);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Curve label (e.g. "N = 1", "N = 2", "N = 3") placed directly on the curve
    if (labelCurve && points.length > 20) {
      // Pick position along curve
      let labelIdx = Math.floor(points.length * 0.25);
      if (nVal === 1) labelIdx = Math.floor(points.length * 0.18);
      else if (nVal === 2) labelIdx = Math.floor(points.length * 0.22);
      else if (nVal === 3) labelIdx = Math.floor(points.length * 0.25);
      else if (nVal === 4) labelIdx = Math.floor(points.length * 0.28);
      else if (nVal === 6) labelIdx = Math.floor(points.length * 0.32);
      else if (nVal === 10) labelIdx = Math.floor(points.length * 0.36);

      const pt = points[labelIdx];
      const nextPt = points[Math.min(points.length - 1, labelIdx + 3)];
      const angle = Math.atan2(nextPt.cy - pt.cy, nextPt.cx - pt.cx);

      ctx.save();
      ctx.translate(pt.cx, pt.cy);
      ctx.rotate(angle);
      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      // Draw background pill for legibility
      ctx.fillStyle = isDark ? '#111827' : '#ffffff';
      ctx.fillRect(-16, -15, 32, 13);
      ctx.fillStyle = color;
      ctx.fillText(`N = ${nVal}`, 0, -5);
      ctx.restore();
    }
  }

  // Draw Theoretical Point on the curve for user's (x, n)
  const theoreticalY = getRatio(state.order === 'compare' ? 1 : state.order, state.x, state.n);
  if (theoreticalY !== null && theoreticalY >= yMin && theoreticalY <= yMax) {
    const tcx = toCanvasX(state.x);
    const tcy = toCanvasY(theoreticalY);

    const userCy = toCanvasY(state.y);
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = isDark ? '#fbbf24' : '#d97706';
    ctx.lineWidth = 1.5;
    ctx.moveTo(tcx, tcy);
    ctx.lineTo(tcx, userCy);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#10b981';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    drawDiamond(ctx, tcx, tcy, 6);
  }

  // Draw User Point (x, y)
  if (state.x >= xMin && state.x <= xMax && state.y >= yMin && state.y <= yMax) {
    const ucx = toCanvasX(state.x);
    const ucy = toCanvasY(state.y);

    ctx.beginPath();
    ctx.arc(ucx, ucy, 12, 0, 2 * Math.PI);
    ctx.fillStyle = isDark ? 'rgba(59, 130, 246, 0.35)' : 'rgba(37, 99, 235, 0.2)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(ucx, ucy, 6, 0, 2 * Math.PI);
    ctx.fillStyle = '#2563eb';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.fill();
    ctx.stroke();

    ctx.font = '11px sans-serif';
    const tag = `Point (x=${state.x.toFixed(2)}, y=${state.y.toFixed(2)})`;
    const tagWidth = ctx.measureText(tag).width + 12;
    const tagX = Math.min(w - tagWidth - 10, ucx + 10);
    const tagY = Math.max(m.top + 20, ucy - 12);

    ctx.fillStyle = isDark ? 'rgba(17, 24, 39, 0.95)' : 'rgba(255, 255, 255, 0.95)';
    ctx.strokeStyle = isDark ? '#374151' : '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(tagX, tagY - 14, tagWidth, 20, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isDark ? '#f3f4f6' : '#1e293b';
    ctx.textAlign = 'left';
    ctx.fillText(tag, tagX + 6, tagY);
  }
}

/** Draw Levenspiel constant k*tau and k*CA0*tau contours */
function drawLevenspielContours(ctx, toCanvasX, toCanvasY, m, pw, ph, contourColor, isDark) {
  ctx.save();
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = contourColor;

  if (state.order === 1) {
    // First-order: constant k*tau in [1, 2, 5, 10, 20, 50]
    // y = k*tau / (-ln(x))
    const kTauValues = [
      { val: 50, label: 'kτ = 50' },
      { val: 20, label: '20' },
      { val: 10, label: '10' },
      { val: 5,  label: '5' },
      { val: 2,  label: '2' },
      { val: 1,  label: 'kτ = 1' }
    ];

    kTauValues.forEach(item => {
      const c = item.val;
      ctx.beginPath();
      let first = true;
      let labelPoint = null;

      for (let xSample = 0.01; xSample <= 0.99; xSample += 0.005) {
        const yVal = c / (-Math.log(xSample));
        if (yVal < 1.0 || yVal > 30.0) continue;

        const cx = toCanvasX(xSample);
        const cy = toCanvasY(yVal);

        if (first) {
          ctx.moveTo(cx, cy);
          first = false;
        } else {
          ctx.lineTo(cx, cy);
        }

        // Locate point for label near N=1 line (where x ~ 1/(c+1))
        const xN1 = 1.0 / (c + 1.0);
        if (!labelPoint && Math.abs(xSample - xN1) < 0.01) {
          labelPoint = { cx, cy, x: xSample, y: yVal };
        }
      }
      ctx.stroke();

      // Draw label rotated along the line
      if (labelPoint) {
        drawAngledLabel(ctx, item.label, labelPoint.cx, labelPoint.cy, -0.45, isDark);
      }
    });

  } else if (state.order === 2) {
    // Second-order: constant k*CA0*tau in [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]
    // y = (k*CA0*tau * x) / (1 - x)
    const kCA0TauValues = [
      { val: 1000, label: 'kCA0τ = 1000' },
      { val: 500,  label: '500' },
      { val: 200,  label: '200' },
      { val: 100,  label: '100' },
      { val: 50,   label: '50' },
      { val: 20,   label: '20' },
      { val: 10,   label: '10' },
      { val: 5,    label: '5' },
      { val: 2,    label: '2' },
      { val: 1,    label: '1' }
    ];

    kCA0TauValues.forEach(item => {
      const c = item.val;
      ctx.beginPath();
      let first = true;
      let labelPoint = null;

      for (let xSample = 0.01; xSample <= 0.99; xSample += 0.005) {
        const yVal = (c * xSample) / (1.0 - xSample);
        if (yVal < 1.0 || yVal > 100.0) continue;

        const cx = toCanvasX(xSample);
        const cy = toCanvasY(yVal);

        if (first) {
          ctx.moveTo(cx, cy);
          first = false;
        } else {
          ctx.lineTo(cx, cy);
        }

        // Intersection with N=1 line (1 - x = c * x^2 => c*x^2 + x - 1 = 0)
        const xN1 = (-1.0 + Math.sqrt(1.0 + 4.0 * c)) / (2.0 * c);
        if (!labelPoint && Math.abs(xSample - xN1) < 0.01) {
          labelPoint = { cx, cy, x: xSample, y: yVal };
        }
      }
      ctx.stroke();

      if (labelPoint) {
        drawAngledLabel(ctx, item.label, labelPoint.cx, labelPoint.cy, -0.65, isDark);
      }
    });
  }

  ctx.restore();
}

/** Draw angled label with contrast background */
function drawAngledLabel(ctx, text, cx, cy, angle, isDark) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  const width = ctx.measureText(text).width + 6;

  ctx.fillStyle = isDark ? '#111827' : '#ffffff';
  ctx.fillRect(-width / 2, -12, width, 14);

  ctx.fillStyle = isDark ? '#cbd5e1' : '#334155';
  ctx.fillText(text, 0, -2);
  ctx.restore();
}

function drawDiamond(ctx, cx, cy, size) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - size);
  ctx.lineTo(cx + size, cy);
  ctx.lineTo(cx, cy + size);
  ctx.lineTo(cx - size, cy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function renderLegend(ns) {
  if (!el.legendList) return;
  el.legendList.innerHTML = '';

  const cstrChip = document.createElement('div');
  cstrChip.className = 'legend-chip';
  cstrChip.innerHTML = `
    <span class="legend-dot" style="background-color: #0f172a; width: 14px; height: 3px;"></span>
    <span>Solid curves: N CSTRs</span>
  `;
  el.legendList.appendChild(cstrChip);

  const contourChip = document.createElement('div');
  contourChip.className = 'legend-chip';
  const labelConst = state.order === 2 ? 'k·CA0·τ constants' : 'k·τ constants';
  contourChip.innerHTML = `
    <span class="legend-dot" style="background-color: #64748b; border: 1px dashed #64748b; width: 14px; height: 3px;"></span>
    <span>Dashed lines: ${labelConst}</span>
  `;
  el.legendList.appendChild(contourChip);

  const pfrChip = document.createElement('div');
  pfrChip.className = 'legend-chip';
  pfrChip.innerHTML = `
    <span class="legend-dot" style="background-color: #475569; width: 14px; height: 2px;"></span>
    <span>N = ∞ (Plug Flow)</span>
  `;
  el.legendList.appendChild(pfrChip);
}

// --- CANVAS MOUSE / TOUCH EVENTS ---
function setupCanvasEvents() {
  const canvas = el.canvas;
  const tooltip = el.tooltip;

  canvas.addEventListener('mousemove', (e) => {
    if (!graphBounds) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    const { m, pw, ph, fromCanvasX, fromCanvasY } = graphBounds;

    if (cx >= m.left && cx <= m.left + pw && cy >= m.top && cy <= m.top + ph) {
      const curX = fromCanvasX(cx);
      const curY = fromCanvasY(cy);
      const curConv = (1.0 - curX) * 100.0;

      tooltip.style.display = 'block';
      tooltip.style.left = `${Math.min(rect.width - 160, cx + 15)}px`;
      tooltip.style.top = `${Math.max(10, cy - 35)}px`;
      tooltip.innerHTML = `x: ${curX.toFixed(3)} | XA: ${curConv.toFixed(1)}%<br>y: ${curY.toFixed(2)}`;
    } else {
      tooltip.style.display = 'none';
    }
  });

  canvas.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none';
  });

  canvas.addEventListener('click', (e) => {
    if (!graphBounds) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    const { m, pw, ph, fromCanvasX, fromCanvasY } = graphBounds;
    if (cx >= m.left && cx <= m.left + pw && cy >= m.top && cy <= m.top + ph) {
      const newX = Math.max(0.01, Math.min(0.99, fromCanvasX(cx)));
      const newY = Math.max(1.0, fromCanvasY(cy));

      state.x = newX;
      state.y = newY;
      syncInputs();
      render();
    }
  });
}

function exportPlotImage() {
  const link = document.createElement('a');
  link.download = `reactor_series_order_${state.order}_N${state.n}.png`;
  link.href = el.canvas.toDataURL('image/png');
  link.click();
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

document.addEventListener('DOMContentLoaded', init);
