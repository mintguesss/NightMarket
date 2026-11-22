/* NightMarket - 核心（看盤、自選、右側、搜尋、底部、版面） */
// 圖表配色跟著主題走（深色／淺色）
const THEMES = {
  dark: { grid: '#1d212c', txt: '#7d8494', border: '#262b38', cross: '#555c6b', label: '#2a3040', guide: '#3a4050', ext: '#8a90a0', hist: '#c9ccd3' },
  light: { grid: '#eef0f4', txt: '#6b7280', border: '#e2e5eb', cross: '#9aa1ad', label: '#4b5563', guide: '#c9ced8', ext: '#9aa1ad', hist: '#4b5563' },
};
const curTheme = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
let CT = THEMES[curTheme()];
let GRID = CT.grid, TXT = CT.txt;
let UP = '#f0444f', DOWN = '#17b978';
const DEFAULT_WATCH = ['2330', '2317', '2454', '2308', '2382', '2303', '3711', '2881', '2412', '2603', '6488', '0050', '0056', '00878',
  'Y.CL=F', 'US.GOOGL', 'US.SPCX', 'US.SKHY', 'US.NOK', 'US.COHR', 'US.AAOI', 'US.LITE', 'US.SNDK', 'US.MU', 'US.WDC', 'US.STX', 'US.AMD', 'US.ARM',
  'US.INTC', 'US.NVDA', 'US.TSLA', 'Y.BTC-USD'];
const usCode = (c) => c.startsWith('US.') || c.startsWith('Y.');
const FOOT_NAMES = { t00: '加權', o00: '櫃買', 'FUT.TXF': '台指期', 'US.^DJI': '道瓊', 'US.^IXIC': '那斯達克', 'US.^GSPC': '標普500', 'US.^SOX': '費半', 'Y.^VIX': 'VIX', 'Y.ES=F': '標普期', 'Y.NQ=F': '那指期', 'FX.USDTWD': '美元/台幣' };
const FOOT_BY = { tw: ['t00', 'o00', 'FUT.TXF', 'FX.USDTWD'], us: ['US.^DJI', 'US.^IXIC', 'US.^GSPC', 'US.^SOX', 'Y.^VIX', 'Y.ES=F', 'Y.NQ=F', 'FX.USDTWD'] };
const MKT_INDEX = { tw: 't00', us: 'US.^GSPC' };
const DEFAULT_CODE = { tw: '2330', us: 'US.NVDA' };
const PERIODS = {
  tick: { interval: '1m', range: '1d', line: true, label: '分時' },
  '5d': { interval: '5m', range: '5d', line: true, label: '5日' },
  D: { interval: '1d', range: '2y', label: '日K' },
  W: { interval: '1wk', range: '10y', label: '週K' },
  M: { interval: '1mo', range: 'max', label: '月K' },
  1: { interval: '1m', range: '5d', label: '1分' },
  5: { interval: '5m', range: '1mo', label: '5分' },
  15: { interval: '15m', range: '1mo', label: '15分' },
  30: { interval: '30m', range: '3mo', label: '30分' },
  60: { interval: '60m', range: '6mo', label: '60分' },
  2: { interval: '2m', range: '5d', label: '2分', more: true },
  3: { interval: '1m', range: '5d', agg: 180, label: '3分', more: true },
  10: { interval: '5m', range: '1mo', agg: 600, label: '10分', more: true },
  90: { interval: '90m', range: '6mo', label: '90分', more: true },
  120: { interval: '60m', range: '1y', agg: 7200, label: '2小時', more: true },
  240: { interval: '60m', range: '2y', agg: 14400, label: '4小時', more: true },
  Q: { interval: '3mo', range: 'max', label: '季K', more: true },
  Y: { interval: '1mo', range: 'max', agg: 'Y', label: '年K', more: true },
};
const INTRADAY_LIVE = new Set(['tick', '1', '5d', '5', '2', '3']);
const EXT_OK = new Set(['tick', '5d', '1', '2', '3', '5', '10', '15', '30']);
// 美股分時的時段模式：auto＝跟著目前時段（盤前／盤中／盤後／夜盤），也可以手動選全天或單一時段
const SESS = { all: '全天', pre: '盤前', reg: '盤中', post: '盤後', night: '夜盤' };
const sessOn = () => state.period === 'tick' && isUS(state.code) && !state.code.includes('^');
function sessResolved() {
  if (state.sessMode !== 'auto') return state.sessMode;
  const ses = (state.quotes[state.code] || state.quotes['US.^GSPC'] || {}).session;
  return { PRE: 'pre', REGULAR: 'reg', POST: 'post', OVERNIGHT: 'night' }[ses] || 'reg';
}
const useExt = () => isUS(state.code) && EXT_OK.has(state.period) && (state.period === 'tick' ? sessOn() && sessResolved() !== 'reg' : state.mkt === 'us' && state.extHours);
const inRegular = (t) => !state.regular.length || state.regular.some(([a, b]) => t >= a && t < b);

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// 舊版（台美混在一起）的自選清單拆成兩份
if (!store.get('tw.watch.tw') && !store.get('tw.watch.us')) {
  const old = store.get('tw.watch', DEFAULT_WATCH);
  store.set('tw.watch.tw', old.filter((c) => !usCode(c)));
  store.set('tw.watch.us', old.filter(usCode).length ? old.filter(usCode) : DEFAULT_WATCH.filter(usCode));
}
const MKT0 = store.get('tw.mkt', 'tw');
const state = {
  mkt: MKT0,
  watch: store.get('tw.watch.' + MKT0, []),
  groups: store.get('tw.groups.' + MKT0, []),
  pinned: store.get('tw.pinned', []),
  stars: store.get('tw.stars', []),
  notes: store.get('tw.notes', {}),
  memos: store.get('tw.memos', {}),
  alerts: store.get('tw.alerts', {}),
  alertLog: store.get('tw.alertLog', []),
  settings: Object.assign({ colorMode: 'redUp', pctBox: false, showExt: true, spark: true, sortKey: null, sortDir: 0, refresh: 5 }, store.get('tw.settings', {})),
  layout: Object.assign({ lw: 440, rw: 320, noLeft: false, noRight: false }, store.get('tw.layout', {}), store.get('tw.lw440') ? {} : { lw: Math.max(440, store.get('tw.layout', {}).lw || 0) }),
  filter: 'all',
  view: 'chart',
  code: store.get('tw.code.' + MKT0, DEFAULT_CODE[MKT0]),
  period: store.get('tw.period', 'tick'),
  overlays: store.get('tw.overlays', ['MA']),
  subs: store.get('tw.subs', ['VOL', 'MACD']),
  sideTab: 'book',
  list: [], listMap: {}, names: store.get('tw.names', {}),
  quotes: {}, sparks: {},
  bars: [], prev: null, off: 8 * 3600, sessionEnd: null, lastVol: null,
  paper: null,
  ticket: { side: 'buy', type: 'limit', unit: 1000, price: '', qty: 1 },
  magnet: store.get('tw.magnet2', false), // 預設關閉磁吸，畫線完全自由
  autoKinds: store.get('tw.autoDraw', []),
  extHours: store.get('tw.extHours', true), regular: [], postEnd: null, sessMode: store.get('tw.sessMode', 'auto'), sessShown: null, tickWin: null,
};
const PER_MKT = new Set(['watch', 'groups']);
const save = (k) => store.set('tw.' + k + (PER_MKT.has(k) ? '.' + state.mkt : ''), state[k]);

/* ---------- 工具 ---------- */
const api = (p) => fetch(p).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
const post = (p, body) => fetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
const cls = (d) => (d > 0 ? 'up' : d < 0 ? 'down' : 'flat');
const fmtP = (v, d = 2) => (v == null || isNaN(v) ? '--' : Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const pxDp = (v) => (Math.abs(v) >= 10000 ? 0 : 2); // 韓圜、日圓這類大數字價格不顯示小數
const fmtInt = (v) => (v == null || isNaN(v) ? '--' : Math.round(v).toLocaleString('en-US'));
const sign = (v) => (v > 0 ? '+' : '');
const fmtVol = (v) => { if (v == null || isNaN(v)) return '--'; const a = Math.abs(v);
  if (LANG === 'en') return a >= 1e12 ? (v / 1e12).toFixed(2) + 'T' : a >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : a >= 1e4 ? (v / 1e3).toFixed(1) + 'K' : Math.round(v).toLocaleString();
  if (a >= 1e12) return (v / 1e12).toFixed(2) + '兆'; if (a >= 1e8) return (v / 1e8).toFixed(2) + '億'; if (a >= 1e4) return (v / 1e4).toFixed(2) + '萬'; return Math.round(v).toLocaleString(); };
const isUS = (c) => c.startsWith('US.');
const isGL = (c) => c.startsWith('G.'); // 其他股市個股：G.005930.KS（韓）、G.7203.T（日）、G.0700.HK（港）…
const REGION_ZH = { KS: '韓股', KQ: '韓股', T: '日股', HK: '港股', SS: '陸股', SZ: '陸股', L: '英股', DE: '德股', F: '德股', PA: '法股', AS: '荷股', SW: '瑞士', MI: '義股', MC: '西股', ST: '瑞典', CO: '丹麥', OL: '挪威', HE: '芬蘭', BR: '比股', TO: '加股', V: '加股', AX: '澳股', NZ: '紐股', SI: '星股', NS: '印股', BO: '印股', KL: '馬股', BK: '泰股', JK: '印尼', SA: '巴西', MX: '墨股' };
const regionOf = (c) => REGION_ZH[c.split('.').pop()] || '國際';
const isTW = (c) => !c.includes('.') && c !== 't00' && c !== 'o00';
const isEtf = (c) => /^00/.test(c) || ['US.QQQ', 'US.SPY', 'US.VOO', 'US.SOXX', 'US.SMH', 'US.DIA', 'US.IWM', 'US.TQQQ', 'US.SOXL'].includes(c);
const isOpt = (c) => c.startsWith('OPT.');
const showCode = (c) => (c.startsWith('US.') ? c.slice(3) : isGL(c) ? c.slice(2).replace(/\.[A-Z]{1,3}$/, '') : c.startsWith('Y.') ? c.slice(2).replace(/=F$|-USD$/, '') : isOpt(c) ? (c.startsWith('OPT.TW:') ? '台指選' : '美股選擇權') : c);
const multOf = (c) => (c.startsWith('OPT.TW:') ? 50 : c.startsWith('OPT.US:') ? 100 : 1);
const mktOf = (c) => (isUS(c) ? 'us' : state.listMap[c]?.mkt || state.quotes[c]?.mkt);
// 常見美股、期貨、加密貨幣的中文名稱（台灣慣用譯名）放在 names-zh.json，前後端共用；中文介面優先顯示
let ZH_NAME = {};
fetch('names-zh.json').then((r) => r.json()).then((m) => { ZH_NAME = m; renderWatch(); renderSide(); }).catch(() => {});
const nameOf = (c) => {
  if (c === 't00') return '加權指數';
  const q = state.quotes[c];
  if (!isTW(c) && LANG !== 'en' && ZH_NAME[c]) return ZH_NAME[c];
  if (!isTW(c)) return state.names[c] || q?.name || showCode(c);
  return state.listMap[c]?.name || q?.name || state.names[c] || c;
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const ccyOf = (c) => (isTW(c) || c.startsWith('OPT.TW:') ? 'TWD' : 'USD');
function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), ms); }
function twNow() { return new Date(Date.now() + (new Date().getTimezoneOffset() * 60 + 8 * 3600) * 1000); }
function twOpen() { const n = twNow(), d = n.getDay(), m = n.getHours() * 60 + n.getMinutes(); return d >= 1 && d <= 5 && m >= 9 * 60 && m <= 13 * 60 + 30; }
const usOpen = () => state.mkt === 'us' && !!state.quotes['US.^GSPC']?.isOpen;
const usActive = () => state.mkt === 'us' && ['REGULAR', 'PRE', 'POST'].includes(state.quotes['US.NVDA']?.session || state.quotes[state.code]?.session || state.quotes['US.^GSPC']?.session);
const isOpenFor = (c) => (isTW(c) || c === 't00' ? twOpen() : !!state.quotes[c]?.isOpen);
function chgOf(q) { if (!q || q.price == null || !q.prev) return { d: 0, pct: 0 }; const d = q.price - q.prev; return { d, pct: (d / q.prev) * 100 }; }
function tickSize(p, code) {
  if (!isTW(code)) return 0.01;
  if (code.startsWith('00')) return p < 50 ? 0.01 : 0.05;
  return p < 10 ? 0.01 : p < 50 ? 0.05 : p < 100 ? 0.1 : p < 500 ? 0.5 : p < 1000 ? 1 : 5;
}
function applyColors() {
  const red = '#f0444f', green = '#17b978';
  [UP, DOWN] = state.settings.colorMode === 'greenUp' ? [green, red] : [red, green];
  document.documentElement.style.setProperty('--up', UP); document.documentElement.style.setProperty('--down', DOWN);
}
applyColors();
// 主題：dark / light / auto（跟隨系統）。index.html 開頭已先套用一次，避免閃一下
function themeChartOpts() {
  return { layout: { textColor: CT.txt }, grid: { vertLines: { color: CT.grid }, horzLines: { color: CT.grid } }, rightPriceScale: { borderColor: CT.border },
    timeScale: { borderColor: CT.border }, crosshair: { vertLine: { color: CT.cross, labelBackgroundColor: CT.label }, horzLine: { color: CT.cross, labelBackgroundColor: CT.label } } };
}
function applyTheme() {
  const pref = state.settings.theme || 'dark';
  const t = pref === 'auto' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : pref;
  document.documentElement.dataset.theme = t;
  CT = THEMES[t]; GRID = CT.grid; TXT = CT.txt;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#ffffff' : '#151821');
  const o = themeChartOpts();
  [...(typeof allCharts !== 'undefined' ? allCharts : []), typeof stState !== 'undefined' ? stState.chart : null, ...(typeof mtState !== 'undefined' ? mtState.charts : []).map((m) => m?.chart)].forEach((c) => { try { c && c.applyOptions(o); } catch {} });
  $$('[data-theme-toggle]').forEach((b) => { b.innerHTML = (t === 'light' ? THEME_ICON.moon : THEME_ICON.sun) + (b.classList.contains('nav-btn') ? `<span>${t === 'light' ? '深色' : '淺色'}</span>` : ''); b.title = t === 'light' ? '切換成深色' : '切換成淺色'; });
  if (typeof rerender === 'function' && state.bars?.length) rerender(true);
  if (typeof renderWatch === 'function') renderWatch();
}
const THEME_ICON = {
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>',
};
function toggleTheme() { state.settings.theme = curTheme() === 'light' ? 'dark' : 'light'; save('settings'); applyTheme(); }
matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (state.settings.theme === 'auto') applyTheme(); });
document.addEventListener('click', (e) => { if (e.target.closest('[data-theme-toggle]')) toggleTheme(); });

/* ---------- 選單 / 對話框 ---------- */
function openMenu(x, y, items) {
  const m = $('#ctxMenu');
  const build = (list) => list.map((it, i) => {
    if (it === 'sep') return '<div class="ctx-sep"></div>';
    return `<div class="ctx-item ${it.danger ? 'danger' : ''} ${it.checked ? 'checked' : ''} ${it.disabled ? 'disabled' : ''}" data-i="${i}">
      <span class="ic">${it.checked ? '' : it.icon || ''}</span><span>${esc(it.label)}</span>${it.sub ? '<span class="arr">›</span><div class="ctx-sub">' + build(it.sub) + '</div>' : ''}</div>`;
  }).join('');
  m.innerHTML = build(items);
  // 綁定（包含子選單）
  const bind = (root, list) => {
    [...root.children].filter((el) => el.classList.contains('ctx-item')).forEach((el) => {
      const it = list[+el.dataset.i];
      if (it.sub) bind(el.querySelector('.ctx-sub'), it.sub);
      el.addEventListener('click', (e) => { e.stopPropagation(); if (it.sub || it.disabled) return; closeMenu(); it.act?.(); });
    });
  };
  bind(m, items);
  m.classList.add('open');
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
  m.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
}
function closeMenu() { $('#ctxMenu').classList.remove('open'); }
document.addEventListener('click', closeMenu);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenu(); closeModal(); } });

function openModal(title, body, buttons = [{ label: '關閉' }]) {
  const m = $('#modal');
  m.innerHTML = `<h3>${esc(title)}</h3><div class="mb">${body}</div><div class="mf">${buttons.map((b, i) => `<button class="btn ${b.cls || (i === buttons.length - 1 ? '' : 'sec')}" data-b="${i}">${esc(b.label)}</button>`).join('')}</div>`;
  m.querySelectorAll('[data-b]').forEach((el) => el.addEventListener('click', async () => {
    const b = buttons[+el.dataset.b];
    if (b.act) { const keep = await b.act(m); if (keep === false) return; }
    closeModal();
  }));
  $('#modalBg').classList.add('open');
  setTimeout(() => m.querySelector('input,textarea')?.focus(), 30);
  return m;
}
function closeModal() { $('#modalBg').classList.remove('open'); }
$('#modalBg').addEventListener('mousedown', (e) => { if (e.target.id === 'modalBg') closeModal(); });
function confirmBox(title, msg, okLabel, onOk) { openModal(title, `<div>${msg}</div>`, [{ label: '取消' }, { label: okLabel, cls: 'danger', act: onOk }]); }
function promptBox(title, label, val, onOk) {
  openModal(title, `<div class="fld"><label>${esc(label)}</label><input id="pbIn" value="${esc(val || '')}"></div>`,
    [{ label: '取消' }, { label: '確定', act: (m) => onOk(m.querySelector('#pbIn').value.trim()) }]);
  setTimeout(() => $('#pbIn')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#modal [data-b="1"]').click(); }), 40);
}

/* ---------- 圖表 ---------- */
const chartOpts = (showTime) => ({
  layout: { background: { color: 'transparent' }, textColor: TXT, fontSize: 11, fontFamily: 'Segoe UI, Arial' },
  grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
  rightPriceScale: { borderColor: CT.border, minimumWidth: 72, scaleMargins: { top: 0.1, bottom: 0.06 } }, // 上下留白縮小，價格軸貼近K棒高低點
  timeScale: { borderColor: CT.border, visible: showTime, timeVisible: true, secondsVisible: false, rightOffset: 4 },
  crosshair: { mode: 0, vertLine: { color: CT.cross, labelBackgroundColor: CT.label }, horzLine: { color: CT.cross, labelBackgroundColor: CT.label } },
  localization: { locale: LANG === 'en' ? 'en-US' : 'zh-TW', dateFormat: 'yyyy/MM/dd' },
  handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false }, // 手機上下滑動捲頁面
  autoSize: true,
});
const mainChart = LightweightCharts.createChart($('#chartMain'), chartOpts(false));
const subCharts = [LightweightCharts.createChart($('#chartSub1'), chartOpts(false)), LightweightCharts.createChart($('#chartSub2'), chartOpts(true))];
const allCharts = [mainChart, ...subCharts];
const mainSeries = [], subSeries = [[], []], subPrimary = [null, null], subInfo = [[], []];
let primary = null, syncing = false, overlayInfo = [];
allCharts.forEach((c) => c.timeScale().subscribeVisibleLogicalRangeChange((r) => {
  if (syncing || !r) return; syncing = true; allCharts.forEach((o) => o !== c && o.timeScale().setVisibleLogicalRange(r)); syncing = false;
}));

const draw = new Drawings($('#paneMain'), mainChart, {
  series: () => primary, bars: () => state.bars, off: () => state.off, magnet: () => state.magnet,
  step: () => { const P = PERIODS[state.period]; return P.agg || STEP_OF[P.interval] || { '1d': 86400, '1wk': 604800, '1mo': 2629800 }[P.interval] || 0; },
  save: (items) => store.set('tw.draw.' + state.code, items),
});

function clearSeries(chart, list) { if (SOFT) return; list.forEach((s) => chart.removeSeries(s)); list.length = 0; }
// 軟更新模式：不刪掉重建圖層，而是依建立順序拿回原本的 series 換資料。畫面不閃、縮放和位置不動
let SOFT = null;
function mkSeries(chart, list, type, opts) {
  if (SOFT) {
    const k = SOFT.get(list) || 0, s = list[k]; SOFT.set(list, k + 1);
    if (!s || s._type !== type) throw new Error('soft-mismatch');
    return s;
  }
  const s = chart['add' + type + 'Series'](opts); s._type = type; list.push(s); return s;
}
const priceLine = (s, o) => { if (!SOFT && s) s.createPriceLine(o); };
const toTime = (t) => t + state.off;
const lineData = (bars, vals) => bars.map((b, i) => (vals[i] == null || isNaN(vals[i]) ? { time: toTime(b.t) } : { time: toTime(b.t), value: vals[i] }));
function addLine(chart, list, l, bars) {
  const s = mkSeries(chart, list, 'Line', { color: l.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
    lineStyle: l.dash ? 2 : 0, ...(l.dots ? { lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: 1.5 } : {}) });
  s.setData(lineData(bars, l.vals)); return s; // 先登記再塞資料：塞資料出錯時，下次重畫仍會把它清掉
}
// K 線資料健檢：去掉壞值、依時間排序、同一時間只留最後一筆，最後一根對齊週期（Yahoo 最後一根常帶著秒數）
function sanitizeBars(bars, step) {
  const ok = (x) => typeof x === 'number' && isFinite(x);
  const m = new Map();
  for (const b of bars || []) {
    if (!b || !ok(b.t) || !ok(b.o) || !ok(b.h) || !ok(b.l) || !ok(b.c) || b.c <= 0) continue;
    m.set(b.t, { t: b.t, o: b.o, c: b.c, h: Math.max(b.h, b.o, b.c), l: Math.min(b.l, b.o, b.c), v: ok(b.v) && b.v > 0 ? b.v : 0 });
  }
  const out = [...m.values()].sort((a, b) => a.t - b.t);
  if (step && out.length > 1) {
    const last = out[out.length - 1], prev = out[out.length - 2], gap = last.t - prev.t;
    if (gap % step) { const t = prev.t + Math.floor(gap / step) * step; if (t > prev.t) last.t = t; else { prev.h = Math.max(prev.h, last.h); prev.l = Math.min(prev.l, last.l); prev.c = last.c; prev.v += last.v; out.pop(); } }
  }
  return out;
}
const STEP_OF = { '1m': 60, '2m': 120, '5m': 300, '15m': 900, '30m': 1800, '60m': 3600, '90m': 5400 };

function renderMain() {
  clearSeries(mainChart, mainSeries); overlayInfo = [];
  state.fillTimes = null;
  const bars = state.bars, P = PERIODS[state.period];
  if (!bars.length) { primary = null; draw.redraw(); return; }
  const closes = bars.map((b) => b.c), big = pxDp(closes[closes.length - 1]) === 0, pf = big ? { type: 'price', precision: 0, minMove: 1 } : { type: 'price', precision: 2, minMove: 0.01 };
  if (P.line) {
    const last = closes[closes.length - 1], base = state.prev ?? closes[0], col = last >= base ? UP : DOWN;
    primary = mkSeries(mainChart, mainSeries, 'Area', { lineColor: col, topColor: col + '44', bottomColor: col + '05', lineWidth: 1.5, priceFormat: pf, priceLineVisible: false });
    if (SOFT) primary.applyOptions({ lineColor: col, topColor: col + '44', bottomColor: col + '05' });
    const data = bars.map((b) => (inRegular(b.t) ? { time: toTime(b.t), value: b.c } : { time: toTime(b.t), value: b.c, lineColor: CT.ext, topColor: CT.ext + '22', bottomColor: CT.ext + '03' }));
    if (state.period === 'tick') {
      const end = state.sessionEnd && state.sessionEnd > bars[0].t && state.sessionEnd - bars[0].t < 86400 ? state.sessionEnd
        : Math.floor((bars[0].t + state.off) / 86400) * 86400 - state.off + 13.5 * 3600;
      for (let t = bars[bars.length - 1].t + 60; t <= end; t += 60) data.push({ time: toTime(t) });
    }
    state.fillTimes = state.period === 'tick' ? data.map((x) => x.time) : null;
    primary.setData(data);
    if (base) priceLine(primary, { price: base, color: '#7d8494', lineStyle: 2, lineWidth: 1, axisLabelVisible: true, title: '昨收' });
    let pv = 0, vv = 0;
    const avg = bars.map((b, i) => {
      if (i > 0 && Math.floor((b.t + state.off) / 86400) !== Math.floor((bars[i - 1].t + state.off) / 86400)) { pv = 0; vv = 0; }
      pv += ((b.h + b.l + b.c) / 3) * b.v; vv += b.v; return vv ? pv / vv : b.c;
    });
    const l = { name: '均價', color: '#f5a524', vals: avg };
    // 均價線不參與價格軸自動縮放：價格軸只依畫面上這段走勢的高低點調整，不會被遠處的均價線壓扁
    addLine(mainChart, mainSeries, l, bars).applyOptions({ autoscaleInfoProvider: () => null }); overlayInfo.push(l);
  } else {
    primary = mkSeries(mainChart, mainSeries, 'Candlestick', { upColor: UP, downColor: DOWN, borderUpColor: UP, borderDownColor: DOWN, wickUpColor: UP, wickDownColor: DOWN, priceFormat: pf });
    primary.setData(bars.map((b) => {
      const o = { time: toTime(b.t), open: b.o, high: b.h, low: b.l, close: b.c };
      if (!inRegular(b.t)) { const c = (b.c >= b.o ? UP : DOWN) + '66'; Object.assign(o, { color: c, borderColor: c, wickColor: c }); } // 盤前盤後K棒半透明
      return o;
    }));
    state.overlays.forEach((k) => {
      const def = IND.MAIN[k]; if (!def) return;
      // 均線等疊加線不參與價格軸自動縮放：價格軸只看畫面上K棒的高低點，不會被遠處的長天期均線撐大
      def.calc(bars, IND.get('main', k)).lines.forEach((l) => { addLine(mainChart, mainSeries, l, bars).applyOptions({ autoscaleInfoProvider: () => null }); overlayInfo.push(l); });
    });
    // 價格提醒線
    const al = state.alerts[state.code];
    if (al?.above) priceLine(primary, { price: al.above, color: '#f5a524', lineStyle: 1, title: '提醒↑', axisLabelVisible: true });
    if (al?.below) priceLine(primary, { price: al.below, color: '#f5a524', lineStyle: 1, title: '提醒↓', axisLabelVisible: true });
  }
  updateLegend(bars.length - 1); draw.redraw(); setTimeout(() => draw.redraw(), 80);
}

function renderSubs() {
  $('#paneSub1').hidden = state.subs.length < 1; $('#paneSub2').hidden = state.subs.length < 2;
  // 最下面那張顯示時間軸
  mainChart.applyOptions({ timeScale: { visible: state.subs.length === 0 } });
  subCharts[0].applyOptions({ timeScale: { visible: state.subs.length === 1 } });
  subCharts[1].applyOptions({ timeScale: { visible: true } });
  [0, 1].forEach((i) => renderSub(i));
}
function renderSub(i) {
  const chart = subCharts[i]; clearSeries(chart, subSeries[i]); subInfo[i] = []; subPrimary[i] = null;
  const key = state.subs[i], bars = state.bars; if (!key || !bars.length) { $('#legendSub' + (i + 1)).innerHTML = ''; return; }
  const r = IND.SUB[key].calc(bars, IND.get('sub', key), { volDiv: isTW(state.code) ? 1000 : 1 });
  if (state.fillTimes && PERIODS[state.period].line) { const ws = mkSeries(chart, subSeries[i], 'Line', { visible: false, priceLineVisible: false, lastValueVisible: false }); ws.setData(state.fillTimes.map((t) => ({ time: t }))); } // 副圖也補空白時段到收盤
  if (r.hist) {
    const s = mkSeries(chart, subSeries[i], 'Histogram', { priceLineVisible: false, lastValueVisible: false, priceFormat: r.volume ? { type: 'volume' } : { type: 'price', precision: 2, minMove: 0.01 } });
    s.setData(bars.map((b, j) => (r.hist[j].v == null || isNaN(r.hist[j].v) ? { time: toTime(b.t) } : { time: toTime(b.t), value: r.hist[j].v, color: (r.hist[j].up ? UP : DOWN) + 'cc' })));
    subPrimary[i] = s; subInfo[i].push({ name: r.label || key, color: CT.hist, vals: r.hist.map((h) => h.v), vol: r.volume });
  }
  r.lines.forEach((l) => { const s = addLine(chart, subSeries[i], l, bars); if (!subPrimary[i]) subPrimary[i] = s; subInfo[i].push({ ...l, vol: r.volume }); });
  if (r.volume && !r.hist) subSeries[i].forEach((s) => s.applyOptions({ priceFormat: { type: 'volume' } }));
  (r.guides || []).forEach((g) => priceLine(subPrimary[i], { price: g, color: CT.guide, lineStyle: 2, axisLabelVisible: false }));
  updateSubLegend(i, bars.length - 1);
}

function updateLegend(i) {
  const b = state.bars[i]; if (!b) { $('#legendMain').innerHTML = ''; return; }
  const P = PERIODS[state.period];
  const ref = i > 0 ? state.bars[i - 1].c : (state.prev ?? b.o), base = P.line ? (state.prev ?? state.bars[0].c) : ref;
  const d = b.c - base, pct = base ? (d / base) * 100 : 0;
  let h = P.line ? `<span><span class="lbl">價</span> <span class="num ${cls(d)}">${fmtP(b.c)}</span></span>`
    : [['開', 'o'], ['高', 'h'], ['低', 'l'], ['收', 'c']].map(([n, k]) => `<span><span class="lbl">${n}</span> <span class="num ${cls(b[k] - ref)}">${fmtP(b[k])}</span></span>`).join('');
  h += `<span class="num ${cls(d)}">${sign(d)}${fmtP(d)} (${sign(pct)}${pct.toFixed(2)}%)</span>`;
  overlayInfo.forEach((o) => { if (o.vals[i] != null) h += `<span style="color:${o.color}" class="num">${o.name}: ${fmtP(o.vals[i])}</span>`; });
  $('#legendMain').innerHTML = h;
}
function updateSubLegend(p, i) {
  const key = state.subs[p]; if (!key) return;
  let h = `<span class="lbl">${IND.SUB[key].name}</span>`;
  subInfo[p].forEach((o) => { const v = o.vals[i]; if (v != null && !isNaN(v)) h += `<span style="color:${o.color}" class="num">${o.name}: ${o.vol ? fmtVol(v) : fmtP(v)}</span>`; });
  h += `<span class="x" data-gear="${key}" title="參數">⚙</span><span class="x" data-rm="${key}" title="關閉">✕</span>`;
  $('#legendSub' + (p + 1)).innerHTML = h;
}
['#legendSub1', '#legendSub2'].forEach((s) => $(s).addEventListener('click', (e) => {
  const rm = e.target.closest('[data-rm]'), g = e.target.closest('[data-gear]');
  if (rm) toggleSub(rm.dataset.rm); if (g) editParams('sub', g.dataset.gear);
}));

const idxByTime = new Map();
function reindex() { idxByTime.clear(); state.bars.forEach((b, i) => idxByTime.set(toTime(b.t), i)); }
function crossTo(i, time, from) {
  updateLegend(i); [0, 1].forEach((p) => updateSubLegend(p, i));
  if (from !== mainChart && primary) { try { mainChart.setCrosshairPosition(state.bars[i].c, time, primary); } catch {} }
  subCharts.forEach((c, p) => { if (c !== from && subPrimary[p]) { try { c.setCrosshairPosition(subInfo[p][0]?.vals[i] ?? 0, time, subPrimary[p]); } catch {} } });
}
allCharts.forEach((c) => c.subscribeCrosshairMove((p) => {
  if (!p.time) { if (p.point === undefined || !p.point) { const n = state.bars.length - 1; updateLegend(n); [0, 1].forEach((k) => updateSubLegend(k, n)); allCharts.forEach((o) => o !== c && o.clearCrosshairPosition()); } return; }
  const i = idxByTime.get(p.time); if (i != null) crossTo(i, p.time, c);
}));

let renderFails = 0;
// 只更新資料（即時報價、每分鐘補K線用）：圖層結構一樣就沿用原本的 series，不重建、不動縮放；結構變了才整張重畫
const renderSig = () => [state.code, state.period, state.overlays.join(), state.subs.join(), JSON.stringify(state.alerts[state.code] || {}), !!state.fillTimes, state.sessShown].join('|');
let lastSig = null;
function softRender() {
  if (!primary || lastSig !== renderSig() || !mainSeries.length) return rerender(true);
  SOFT = new Map();
  try {
    reindex(); renderMain();
    [0, 1].forEach((i) => { if (state.subs[i]) renderSub(i); });
    SOFT = null; lastSig = renderSig();
  } catch (e) { SOFT = null; if (e.message !== 'soft-mismatch') console.warn('soft', e); rerender(true); }
}
function rerender(keep) {
  const range = keep ? mainChart.timeScale().getVisibleLogicalRange() : null;
  try {
    // 正式版圖表函式庫不檢查資料：時間亂序或有壞值時不會報錯，而是整張圖畫不出來，所以每次重畫前先檢查
    const b = state.bars;
    for (let i = 0; i < b.length; i++) {
      if (!(b[i].c > 0) || !isFinite(b[i].o) || !isFinite(b[i].h) || !isFinite(b[i].l) || (i && b[i].t <= b[i - 1].t)) { state.bars = sanitizeBars(b); break; }
    }
    reindex(); renderMain(); renderSubs(); lastSig = renderSig();
    if (state.period === 'tick') mainChart.timeScale().fitContent(); // 分時固定顯示整個交易日
    else if (range) mainChart.timeScale().setVisibleLogicalRange(range);
    renderFails = 0;
  } catch (e) {
    console.error('render', e);
    // 畫圖失敗：清掉所有圖層，避免殘留舊的線；再失敗就顯示錯誤與重新載入按鈕
    clearAllSeries();
    if (++renderFails === 1) { state.bars = sanitizeBars(state.bars); return rerender(false); }
    $('#legendMain').innerHTML = `<span class="lbl">圖表繪製失敗：${esc(e.message)}</span> <button class="btn-ghost" id="chartReload">重新載入圖表</button>`;
    $('#chartReload').onclick = () => resetChart();
  }
}
function clearAllSeries() {
  [[mainChart, mainSeries], [subCharts[0], subSeries[0]], [subCharts[1], subSeries[1]]].forEach(([c, l]) => { l.forEach((s) => { try { c.removeSeries(s); } catch {} }); l.length = 0; });
  primary = null; subPrimary[0] = subPrimary[1] = null;
}
// 完整重置：清圖層、恢復價格軸自動縮放、重新抓資料（右鍵選單和錯誤訊息都會用到）
function resetChart() {
  renderFails = 0; clearAllSeries(); state.bars = [];
  allCharts.forEach((c) => { c.priceScale('right').applyOptions({ autoScale: true }); c.timeScale().resetTimeScale(); });
  loadKline();
}
function aggregate(bars, agg, off) {
  const out = []; let cur = null, key = null, dayFirst = null, day = null;
  for (const b of bars) {
    let k;
    if (agg === 'Y') k = new Date((b.t + off) * 1000).getUTCFullYear();
    else { const dd = Math.floor((b.t + off) / 86400); if (dd !== day) { day = dd; dayFirst = b.t; } k = dd * 1e6 + Math.floor((b.t - dayFirst) / agg); }
    if (k !== key) { cur = { ...b }; out.push(cur); key = k; } else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v; }
  }
  return out;
}

let klineSeq = 0;
async function loadKline(keepRange = false) {
  const P = PERIODS[state.period], seq = ++klineSeq, code = state.code;
  if (!keepRange) $('#loading').classList.add('show');
  try {
    const d = await api(`/api/kline?code=${encodeURIComponent(code)}&interval=${P.interval}&range=${P.range}${useExt() ? '&ext=1' : ''}`);
    if (seq !== klineSeq) return;
    state.off = d.gmtoffset ?? 8 * 3600; state.sessionEnd = d.ext && d.postEnd ? d.postEnd : d.sessionEnd;
    state.regular = d.ext ? d.regular || [] : []; state.postEnd = d.postEnd;
    let bars = d.bars;
    if (state.period === 'tick' && bars.length) { const lastDay = Math.floor((bars[bars.length - 1].t + state.off) / 86400); bars = bars.filter((b) => Math.floor((b.t + state.off) / 86400) === lastDay); }
    state.tickWin = null; state.sessShown = null;
    if (sessOn() && bars.length) {
      const m = sessResolved(), H = 3600, now = Date.now() / 1000;
      const reg = (d.regular || []).at(-1) || [d.sessionStart, d.sessionEnd];
      // 夜盤：現在正在夜盤就看這一晚（當地 20:00 起 8 小時，週日晚上也算），否則看最近一個交易日開盤前那一晚
      const nightNow = state.quotes[code]?.session === 'OVERNIGHT';
      const lh = ((((now + state.off) / H) % 24) + 24) % 24, n0 = now - ((lh - 20 + 24) % 24) * H;
      const W = { all: [reg[0] - 5.5 * H, reg[1] + 4 * H], pre: [reg[0] - 5.5 * H, reg[0]], reg: [reg[0], reg[1]], post: [reg[1], reg[1] + 4 * H],
        night: nightNow ? [n0, n0 + 8 * H] : [reg[0] - 13.5 * H, reg[0] - 5.5 * H] }[m];
      bars = bars.filter((b) => b.t >= W[0] && b.t < W[1]);
      state.tickWin = W; state.sessShown = m; state.sessionEnd = W[1];
      if (m !== 'all') state.regular = []; // 單一時段不用把盤前盤後畫暗
      state.nightErr = null;
      if (m === 'night') { // Yahoo 沒有夜盤，改向 Alpaca（Blue Ocean ATS）要
        const n = await api(`/api/overnight?code=${encodeURIComponent(code)}&start=${Math.floor(W[0])}&end=${Math.floor(W[1])}`).catch((e) => ({ bars: [], error: e.message }));
        if (seq !== klineSeq) return;
        bars = n.bars || []; state.nightErr = n.error || null;
      }
    }
    if (P.agg) bars = aggregate(bars, P.agg, state.off);
    if (!state.quotes[code]) { try { Object.assign(state.quotes, await api('/api/quote?codes=' + encodeURIComponent(code))); } catch {} }
    if (seq !== klineSeq) return;
    const q = state.quotes[code];
    if (state.period === 'D' && isTW(code) && q?.date && q.price != null && q.open != null && bars.length) { // Yahoo 台股日K常晚一天：用即時報價補當天
      const qt = Date.UTC(+q.date.slice(0, 4), +q.date.slice(4, 6) - 1, +q.date.slice(6)) / 1000 + 3600;
      const last = bars[bars.length - 1], lastDay = Math.floor((last.t + state.off) / 86400), qDay = Math.floor((qt + state.off) / 86400);
      if (qDay > lastDay) bars = [...bars, { t: qt, o: q.open, h: q.high, l: q.low, c: q.price, v: (q.volume || 0) * 1000 }];
      else if (qDay === lastDay) Object.assign(last, { h: Math.max(last.h, q.high ?? last.h), l: Math.min(last.l, q.low ?? last.l), c: q.price });
    }
    state.bars = sanitizeBars(bars, P.agg || STEP_OF[P.interval]); state.lastVol = q?.volume ?? null; bars = state.bars;
    if (!keepRange) allCharts.forEach((c) => c.priceScale('right').applyOptions({ autoScale: true })); // 換股或換週期時恢復自動縮放，避免價格軸被拖動後K棒跑出畫面
    state.prev = P.line ? (state.period === 'tick' ? q?.prev ?? d.prev : d.prev) : null;
    if (keepRange) softRender(); else rerender(false);
    updateAuto();
    if (!keepRange) {
      if (P.line) mainChart.timeScale().fitContent();
      else { const n = bars.length; mainChart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 120), to: n + 4 }); }
    }
    if (!bars.length) $('#legendMain').innerHTML = `<span class="lbl">${state.sessShown === 'night' ? (state.nightErr === 'nokey' ? '夜盤需要 Alpaca 免費金鑰：到「設定 → 夜盤資料」填入' : state.nightErr ? '夜盤資料載入失敗：' + esc(state.nightErr) : '夜盤時段目前還沒有成交') : state.sessShown ? SESS[state.sessShown] + '時段目前還沒有資料' : '此週期沒有資料'}</span>`;
    syncSessBtn();
  } catch (e) {
    if (seq === klineSeq) $('#legendMain').innerHTML = `<span class="lbl">K線載入失敗：${esc(e.message)}</span>`;
  } finally { if (seq === klineSeq) $('#loading').classList.remove('show'); }
}
function liveUpdate() {
  let q = state.quotes[state.code]; const P = PERIODS[state.period];
  if (sessOn() && state.sessMode === 'auto' && state.sessShown && sessResolved() !== state.sessShown) { loadKline(); return; }
  if (sessOn() && state.tickWin && q && ((state.sessShown === 'night' && !q.ext?.night) || (q.ext?.ts || q.ts) >= state.tickWin[1])) return;
  if (q && sessOn() && state.sessShown === 'night' && q.ext?.night) q = { ...q, ts: q.ext.ts, price: q.ext.price, volume: null, isOpen: true };
  if (q && useExt() && (q.session === 'PRE' || q.session === 'POST') && q.ext?.ts) q = { ...q, ts: q.ext.ts, price: q.ext.price, volume: null, isOpen: true };
  if (!q?.ts || q.price == null || !state.bars.length || !q.isOpen) return;
  const step = INTRADAY_LIVE.has(state.period) ? P.agg || ({ '1m': 60, '2m': 120, '5m': 300 }[P.interval]) : 0;
  if (!step && P.interval !== '1d' && P.interval !== '1wk' && P.interval !== '1mo') return;
  const last = state.bars[state.bars.length - 1], volMul = isTW(state.code) ? 1000 : 1;
  const dv = state.lastVol != null && q.volume != null ? Math.max(0, (q.volume - state.lastVol) * volMul) : 0;
  state.lastVol = q.volume;
  if (!(q.price > 0) || q.ts < last.t) return;
  const day = (t) => Math.floor((t + state.off) / 86400);
  if (step && q.ts >= last.t + step) state.bars.push({ t: last.t + Math.floor((q.ts - last.t) / step) * step, o: q.price, h: q.price, l: q.price, c: q.price, v: dv });
  else if (!step && P.interval === '1d' && day(q.ts) > day(last.t)) state.bars.push({ t: q.ts, o: q.open ?? q.price, h: q.high ?? q.price, l: q.low ?? q.price, c: q.price, v: dv }); // 日K：新的一天開新的一根
  else { last.c = q.price; last.h = Math.max(last.h, q.price); last.l = Math.min(last.l, q.price); last.v += dv; }
  softRender(); updateLegend(state.bars.length - 1);
}

/* ---------- 指標列 / 畫線列 ---------- */
function renderIndBars() {
  $('#overlaySel').innerHTML = Object.entries(IND.MAIN).map(([k, d]) => `<button data-o="${k}" class="${state.overlays.includes(k) ? 'active' : ''}">${d.name}</button>`).join('') + '<button class="gear" data-og title="主圖指標參數">⚙</button>';
  $('#indTabs').innerHTML = '<span class="lab">副圖</span>' + Object.entries(IND.SUB).map(([k, d]) => {
    const i = state.subs.indexOf(k); return `<button data-i="${k}" class="${i >= 0 ? 'active' : ''}">${d.name}${i >= 0 ? `<sup>${i + 1}</sup>` : ''}</button>`;
  }).join('') + '<span class="lab" style="margin-left:auto">最多 2 個副圖，點兩下關閉</span>';
}
function toggleSub(k) {
  const i = state.subs.indexOf(k);
  if (i >= 0) state.subs.splice(i, 1); else { state.subs.push(k); if (state.subs.length > 2) state.subs.shift(); }
  save('subs'); renderIndBars(); rerender(true);
}
$('#indTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) toggleSub(b.dataset.i); });
$('#overlaySel').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.og !== undefined) {
    openMenu(b.getBoundingClientRect().left - 120, b.getBoundingClientRect().bottom + 4, Object.entries(IND.MAIN).map(([k, d]) => ({ label: d.name + ' 參數…', act: () => editParams('main', k) })));
    e.stopPropagation(); return;
  }
  const k = b.dataset.o, i = state.overlays.indexOf(k);
  if (i >= 0) state.overlays.splice(i, 1); else state.overlays.push(k);
  save('overlays'); renderIndBars(); rerender(true);
});
function editParams(kind, key) {
  const def = (kind === 'main' ? IND.MAIN : IND.SUB)[key], cur = IND.get(kind, key);
  openModal(`${def.name} 參數`, def.params.map((p) => `<div class="fld"><label>${esc(p.label)}</label><input data-k="${p.k}" value="${esc(cur[p.k])}"></div>`).join('') + '<div class="hint">數字型參數直接輸入；多個週期用逗號分隔。</div>',
    [{ label: '還原預設', cls: 'sec', act: () => { IND.reset(key); rerender(true); } }, { label: '取消' },
     { label: '套用', act: (m) => { const o = {}; m.querySelectorAll('[data-k]').forEach((el) => { const v = el.value.trim(); o[el.dataset.k] = /^-?[\d.]+$/.test(v) ? +v : v; }); IND.set(key, o); rerender(true); } }]);
}
function renderDrawBar() {
  $('#drawBar').innerHTML = DRAW_TOOLS.map((t) => `<button data-tool="${t.id}" class="${draw.tool === t.id ? 'active' : ''}" title="${t.name}"><svg viewBox="0 0 24 24">${t.icon}</svg></button>`).join('') +
    `<button data-dact="auto" class="${state.autoKinds.length ? 'active' : ''}" title="自動畫線（可複選）"><svg viewBox="0 0 24 24"><path d="M4 20L14 10M15 3v3M15 12v3M18.5 6.5l-2 2M11.5 6.5l2 2M21 9h-3M12 9H9"/></svg></button>
     <div class="dsep"></div>
     <button data-dact="color" title="線條顏色"><span class="swatch" style="background:${draw.color}"></span></button>
     <button data-dact="magnet" class="${state.magnet ? 'active' : ''}" title="磁吸（貼齊開高低收）"><svg viewBox="0 0 24 24"><path d="M6 3v8a6 6 0 0012 0V3M6 7h4M14 7h4"/></svg></button>
     <button data-dact="hide" class="${draw.hidden ? 'active' : ''}" title="隱藏/顯示畫線"><svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>${draw.hidden ? '<path d="M3 3l18 18"/>' : ''}</svg></button>
     <button data-dact="del" title="刪除選取的線（Delete）"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg></button>
     <button data-dact="clear" title="清除這檔所有畫線"><svg viewBox="0 0 24 24"><path d="M3 3l18 18M21 3L3 21"/></svg></button>`;
}
draw.onTool = () => renderDrawBar();
draw.onConvert = () => toast('已轉成手畫線，可以拖曳調整');
// 自動畫線：勾選要哪些（可複選），勾了就畫，全部取消就關掉
function updateAuto() { draw.setAuto(state.autoKinds.length ? autoDraw(state.bars, state.off, state.autoKinds) : []); }
function autoPop(btn) {
  let p = $('#autoPop');
  if (p) { p.remove(); return; }
  p = document.createElement('div'); p.id = 'autoPop'; p.className = 'ctx-menu open auto-pop';
  const paint = () => {
    p.innerHTML = '<div class="auto-h">自動畫線</div>' + AUTO_KINDS.map((k) => `<label class="ctx-item"><input type="checkbox" data-k="${k.id}" ${state.autoKinds.includes(k.id) ? 'checked' : ''}><i style="color:${k.color}"></i>${k.name}</label>`).join('') +
      `<div class="ctx-sep"></div><div class="ctx-item" data-all>${state.autoKinds.length === AUTO_KINDS.length ? '全部取消' : '全部勾選'}</div>
      <div class="ctx-item ${draw.auto?.length ? '' : 'disabled'}" data-conv>全部轉成手畫線（${draw.auto?.length || 0} 條）</div>
      <div class="auto-hint">虛線＝自動計算，換股或換週期會重算<br>雙擊某條虛線，可以單獨轉成手畫線再自己調整</div>`;
  };
  paint(); document.body.appendChild(p);
  const r = ($('#drawBar [data-dact="auto"]') || btn).getBoundingClientRect(); p.style.left = r.right + 6 + 'px'; p.style.top = Math.min(r.top, innerHeight - p.offsetHeight - 8) + 'px';
  const apply = () => { store.set('tw.autoDraw', state.autoKinds); updateAuto(); renderDrawBar(); paint(); };
  p.addEventListener('change', (e) => { const k = e.target.dataset.k; if (!k) return; state.autoKinds = e.target.checked ? [...state.autoKinds, k] : state.autoKinds.filter((x) => x !== k); apply(); });
  p.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target.closest('[data-conv]')) { const n = draw.auto?.length || 0; if (n) { draw.toManual([...draw.auto]); toast(`已轉成 ${n} 條手畫線，可以拖曳調整`); paint(); } return; }
    if (e.target.closest('[data-all]')) { state.autoKinds = state.autoKinds.length === AUTO_KINDS.length ? [] : AUTO_KINDS.map((k) => k.id); apply(); } });
  setTimeout(() => document.addEventListener('click', function off(e) { if (!p.contains(e.target)) { p.remove(); document.removeEventListener('click', off); } }), 0);
}
$('#drawBar').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.tool) { draw.setTool(draw.tool === b.dataset.tool && b.dataset.tool !== 'cursor' ? 'cursor' : b.dataset.tool); return; }
  const a = b.dataset.dact;
  if (a === 'color') {
    const i = (DRAW_COLORS.indexOf(draw.color) + 1) % DRAW_COLORS.length; draw.color = DRAW_COLORS[i];
    if (draw.sel >= 0) { draw.items[draw.sel].color = draw.color; draw.commit(); }
  }
  if (a === 'magnet') { state.magnet = !state.magnet; store.set('tw.magnet2', state.magnet); }
  if (a === 'auto') { autoPop(b); return; }
  if (a === 'hide') { draw.hidden = !draw.hidden; draw.redraw(); }
  if (a === 'del') { if (draw.sel >= 0) draw.removeSelected(); else toast('先點選一條線'); }
  if (a === 'clear') { if (draw.items.length) confirmBox('清除畫線', `確定刪除 ${esc(nameOf(state.code))} 的 ${draw.items.length} 個畫線？`, '刪除', () => draw.clear()); }
  renderDrawBar();
});

/* ---------- 自選清單 ---------- */
function drawSpark(cv, sp, W = 58, H = 26, code = null) {
  const ctx = cv.getContext('2d'), dpr = devicePixelRatio || 1;
  cv.width = W * dpr; cv.height = H * dpr; ctx.scale(dpr, dpr); ctx.clearRect(0, 0, W, H);
  if (!sp?.c || sp.c.length < 2) return;
  let c = sp.c, ts = sp.t && sp.t.length === c.length ? sp.t : null;
  // 用即時報價補上最新一點，走勢尾巴才不會停在兩分鐘前
  const q = code && state.quotes[code];
  if (ts && q?.price > 0 && q.ts > ts[ts.length - 1] && q.ts <= (sp.end || Infinity) + 60 && q.isOpen !== false) { c = [...c, q.price]; ts = [...ts, q.ts]; }
  // 動態縱軸：依這檔自己的高低點縮放（不硬塞昨收），走勢平的也看得出起伏；
  // 但最小範圍取股價的 0.6%，避免幾檔跳動被放大成大起大落。昨收在範圍附近才一起納入。
  const base = sp.prev ?? c[0], dlo = Math.min(...c), dhi = Math.max(...c), mid = (dlo + dhi) / 2;
  const minRg = Math.abs(mid) * 0.006 || 1;
  let lo = dlo, hi = dhi;
  if (hi - lo < minRg) { lo = mid - minRg / 2; hi = mid + minRg / 2; }
  const near = (hi - lo) * 0.5;
  if (base >= lo - near && base <= hi + near) { lo = Math.min(lo, base); hi = Math.max(hi, base); }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const rg = hi - lo || 1;
  // 有時間軸時依「交易時段進度」放 x，開盤沒多久的線只會畫在左邊，不會被拉滿整格
  const span = ts && sp.start && sp.end > sp.start ? sp.end - sp.start : 0;
  const x = span ? (i) => Math.max(0, Math.min(1, (ts[i] - sp.start) / span)) * W : (i) => (i / (c.length - 1)) * W;
  const y = (v) => H - 2 - ((v - lo) / rg) * (H - 4), col = c[c.length - 1] >= base ? UP : DOWN;
  if (base >= lo && base <= hi) { ctx.setLineDash([2, 2]); ctx.strokeStyle = CT.guide; ctx.beginPath(); ctx.moveTo(0, y(base)); ctx.lineTo(W, y(base)); ctx.stroke(); ctx.setLineDash([]); }
  ctx.beginPath(); c.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)))); ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.lineTo(x(c.length - 1), H); ctx.lineTo(x(0), H); ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, col + '55'); g.addColorStop(1, col + '00'); ctx.fillStyle = g; ctx.fill();
}
function groupCodes(f) {
  if (f === 'all') return state.watch;
  if (f === 'tse') return state.watch.filter((c) => mktOf(c) === 'tse' && !isEtf(c));
  if (f === 'otc') return state.watch.filter((c) => mktOf(c) === 'otc' && !isEtf(c));
  if (f === 'stock') return state.watch.filter((c) => !isEtf(c));
  if (f === 'etf') return state.watch.filter(isEtf);
  const g = state.groups.find((x) => x.id === f); return g ? g.codes.filter((c) => state.watch.includes(c)) : [];
}
function sortedCodes() {
  let codes = [...groupCodes(state.filter)];
  const { sortKey: k, sortDir: dir } = state.settings;
  if (k && dir) {
    const val = (c) => { const q = state.quotes[c], ch = chgOf(q); return k === 'price' ? q?.price ?? -1e18 : k === 'pct' ? (q ? ch.pct : -1e18) : k === 'chg' ? (q ? ch.d : -1e18) : nameOf(c); };
    codes.sort((a, b) => { const x = val(a), y = val(b); return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir; });
  }
  const pin = codes.filter((c) => state.pinned.includes(c));
  return [...state.pinned.filter((c) => pin.includes(c)), ...codes.filter((c) => !state.pinned.includes(c))];
}
function renderWatchTabs() {
  const base = state.mkt === 'tw' ? [['all', '全部'], ['tse', '上市'], ['otc', '上櫃'], ['etf', 'ETF']] : [['all', '全部'], ['stock', '個股'], ['etf', 'ETF']];
  const tabs = [...base, ...state.groups.map((g) => [g.id, g.name])];
  if (!tabs.some(([id]) => id === state.filter)) state.filter = 'all';
  $('#watchTabs').innerHTML = tabs.map(([id, n]) => `<button class="chip ${id === state.filter ? 'active' : ''}" data-f="${esc(id)}">${esc(n)}</button>`).join('') + '<button class="chip add" data-addgroup title="新增分組">＋</button>';
}
function renderWatch() {
  const codes = sortedCodes(), S = state.settings;
  $('#watchCount').textContent = `${state.watch.length} 檔`;
  $$('#watchCols [data-sort]').forEach((el) => { const on = S.sortKey === el.dataset.sort && S.sortDir; el.classList.toggle('sorted', !!on); el.textContent = el.textContent.replace(/[↑↓]/g, '') + (on ? (S.sortDir > 0 ? '↑' : '↓') : ''); });
  const el = $('#watchList');
  if (!codes.length) { el.innerHTML = '<div class="empty">這個分組沒有股票<br>用上方搜尋框加入，或右鍵股票加入分組</div>'; return; }
  el.innerHTML = codes.map((c) => {
    const q = state.quotes[c], { d, pct } = chgOf(q), k = cls(d), al = state.alerts[c];
    const x = S.showExt && q?.ext && q.price ? q.ext : null, xd = x ? x.price - q.price : 0, xk = cls(xd);
    const pctTxt = q ? (S.pctBox ? `<span class="pctbox ${k}">${sign(pct)}${pct.toFixed(2)}%</span>` : sign(pct) + pct.toFixed(2) + '%') : '--';
    return `<div class="wrow ${c === state.code ? 'active' : ''} ${state.stars.includes(c) ? 'star' : ''} ${state.pinned.includes(c) ? 'pinned' : ''}" data-code="${esc(c)}">
      <div class="wname"><b>${esc(nameOf(c))}</b><small>${esc(showCode(c))}${isGL(c) ? `<span class="wreg">${regionOf(c)}</span>` : ''}${al && (al.above || al.below || al.pctUp || al.pctDown) ? '<span class="walert">🔔</span>' : ''}</small>${state.notes[c] ? `<span class="wnote">${esc(state.notes[c])}</span>` : ''}</div>
      ${S.spark ? '<canvas></canvas>' : '<span></span>'}
      <span class="num wp ${k}">${fmtP(q?.price, pxDp(q?.price))}${x ? `<small class="wx ${xk}"><i>${esc(x.label)}</i>${fmtP(x.price, pxDp(x.price))}</small>` : ''}</span>
      <span class="num wc ${k}">${pctTxt}${x ? `<small class="wx ${xk}">${sign(xd)}${((xd / q.price) * 100).toFixed(2)}%</small>` : ''}</span>
      <span class="num wd ${k}">${q ? sign(d) + fmtP(d, pxDp(q.price)) : '--'}${x ? `<small class="wx ${xk}">${sign(xd)}${fmtP(xd, pxDp(q.price))}</small>` : ''}</span></div>`;
  }).join('');
  // 小走勢依畫布實際大小繪製（手機版放大）
  if (S.spark) el.querySelectorAll('.wrow').forEach((r) => { const cv = r.querySelector('canvas'); drawSpark(cv, state.sparks[r.dataset.code], cv.clientWidth || 58, cv.clientHeight || 26, r.dataset.code); });
}
$('#watchList').addEventListener('click', (e) => { const r = e.target.closest('.wrow'); if (r) selectCode(r.dataset.code); });
['#paneMain', '#paneSub1', '#paneSub2'].forEach((s) => $(s).addEventListener('contextmenu', (e) => {
  if (draw.tool !== 'cursor') return; e.preventDefault();
  openMenu(e.clientX, e.clientY, [
    { label: '回到最新 K 棒', act: () => { const n = state.bars.length; mainChart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 120), to: n + 4 }); allCharts.forEach((c) => c.priceScale('right').applyOptions({ autoScale: true })); } },
    { label: '重設圖表（重新載入）', act: () => resetChart() },
  ]);
}));
$('#watchList').addEventListener('contextmenu', (e) => { const r = e.target.closest('.wrow'); if (!r) return; e.preventDefault(); stockMenu(r.dataset.code, e.clientX, e.clientY, true); });
$('#watchCols').addEventListener('click', (e) => {
  const s = e.target.closest('[data-sort]'); if (!s) return; const S = state.settings;
  if (S.sortKey !== s.dataset.sort) { S.sortKey = s.dataset.sort; S.sortDir = -1; } else S.sortDir = S.sortDir === -1 ? 1 : S.sortDir === 1 ? 0 : -1;
  save('settings'); renderWatch();
});
$('#watchTabs').addEventListener('click', (e) => {
  const b = e.target.closest('.chip'); if (!b) return;
  if (b.dataset.addgroup !== undefined) { newGroup(); return; }
  state.filter = b.dataset.f; renderWatchTabs(); renderWatch();
});
$('#watchTabs').addEventListener('contextmenu', (e) => {
  const b = e.target.closest('.chip'); if (!b) return; const g = state.groups.find((x) => x.id === b.dataset.f); if (!g) return; e.preventDefault();
  openMenu(e.clientX, e.clientY, [
    { label: '重新命名', icon: '✎', act: () => promptBox('重新命名分組', '名稱', g.name, (v) => { if (v) { g.name = v; save('groups'); renderWatchTabs(); } }) },
    { label: '刪除分組', icon: '🗑', danger: true, act: () => confirmBox('刪除分組', `確定刪除分組「${esc(g.name)}」？（股票仍會留在自選）`, '刪除', () => { state.groups = state.groups.filter((x) => x !== g); save('groups'); renderWatchTabs(); renderWatch(); }) },
  ]);
});
$('#watchMenuBtn').addEventListener('click', (e) => { e.stopPropagation(); const r = e.target.getBoundingClientRect(); openMenu(r.left, r.bottom + 4, listMenuItems()); });
function newGroup(addCode) {
  promptBox('新增自選分組', '分組名稱', '', (v) => {
    if (!v) return; const g = { id: 'g' + Date.now(), name: v, codes: addCode ? [addCode] : [] };
    state.groups.push(g); save('groups'); renderWatchTabs(); toast(`已建立分組「${v}」`);
  });
}
function rememberName(code, name) { if (name && !isTW(code)) { state.names[code] = name; save('names'); } }
function addWatch(code) { if (!state.watch.includes(code)) { state.watch.push(code); save('watch'); } renderWatch(); renderSide(); refreshQuotes(); refreshSparks(); toast(`已加入自選：${nameOf(code)}`); }
function removeWatch(code, ask = true) {
  const doIt = () => {
    state.watch = state.watch.filter((c) => c !== code); state.pinned = state.pinned.filter((c) => c !== code); state.stars = state.stars.filter((c) => c !== code);
    state.groups.forEach((g) => (g.codes = g.codes.filter((c) => c !== code)));
    ['watch', 'pinned', 'stars', 'groups'].forEach(save); renderWatch(); renderSide(); toast(`已刪除自選：${nameOf(code)}`);
  };
  ask ? confirmBox('刪除自選', `確定把 <b>${esc(nameOf(code))}（${esc(showCode(code))}）</b> 從自選股刪除？<br><span class="muted small">會一併從所有分組移除，筆記與提醒會保留。</span>`, '刪除', doIt) : doIt();
}
function moveWatch(code, where) {
  state.watch = state.watch.filter((c) => c !== code);
  where === 'top' ? state.watch.unshift(code) : state.watch.push(code);
  if (state.settings.sortDir) { state.settings.sortDir = 0; save('settings'); }
  save('watch'); renderWatch();
}
function toggleArr(key, code) { const a = state[key]; const i = a.indexOf(code); i >= 0 ? a.splice(i, 1) : a.push(code); save(key); renderWatch(); }
function stockMenu(code, x, y, inWatch) {
  const inList = state.watch.includes(code);
  const items = [
    { label: '設定提醒', icon: '⏰', act: () => editAlert(code) },
    { label: '交易（模擬）', icon: '⇄', disabled: code === 't00', act: () => { selectCode(code); switchSideTab('trade'); } },
    { label: '編輯備註', icon: '▤', act: () => promptBox('編輯備註', '備註（顯示在清單）', state.notes[code], (v) => { v ? (state.notes[code] = v) : delete state.notes[code]; save('notes'); renderWatch(); renderSide(); }) },
    { label: '個股筆記', icon: '✎', act: () => editMemo(code) },
    'sep',
  ];
  if (inList) items.push(
    { label: '移到最前', icon: '⇈', act: () => moveWatch(code, 'top') },
    { label: '移到最後', icon: '⇊', act: () => moveWatch(code, 'bottom') },
    { label: state.pinned.includes(code) ? '取消置頂' : '置頂', icon: '⤒', act: () => toggleArr('pinned', code) },
    { label: '自選管理', icon: '☰', act: manageWatch },
    { label: '編輯自選分組', icon: '♡', sub: [...state.groups.map((g) => ({ label: g.name, checked: g.codes.includes(code), act: () => { const i = g.codes.indexOf(code); i >= 0 ? g.codes.splice(i, 1) : g.codes.push(code); save('groups'); renderWatch(); toast(i >= 0 ? `已從「${g.name}」移除` : `已加入「${g.name}」`); } })), ...(state.groups.length ? ['sep'] : []), { label: '新增分組…', icon: '＋', act: () => newGroup(code) }] },
    { label: '刪除自選', icon: '🗑', danger: true, act: () => removeWatch(code) },
    { label: state.stars.includes(code) ? '取消特別關注' : '添加特別關注', icon: '☆', act: () => toggleArr('stars', code) },
  ); else items.push({ label: '加入自選', icon: '♡', act: () => addWatch(code) });
  if (inWatch) items.push('sep', ...listMenuItems(true));
  openMenu(x, y, items);
}
function listMenuItems(compact) {
  const S = state.settings, tog = (k) => () => { S[k] = !S[k]; save('settings'); renderWatch(); };
  const sortSet = (k, d) => () => { S.sortKey = k; S.sortDir = d; save('settings'); renderWatch(); };
  const items = [
    { label: '清除失效股票', icon: '⌫', act: clearInvalid },
    { label: '導出列表數據', icon: '⤓', act: exportCsv },
    'sep',
    { label: '顯示設定', icon: '⚙', sub: [{ label: '漲跌幅色塊', checked: S.pctBox, act: tog('pctBox') }, { label: '盤前盤後價', checked: S.showExt, act: tog('showExt') }, { label: '迷你走勢圖', checked: S.spark, act: tog('spark') }] },
    { label: '排序', icon: '⇅', sub: [{ label: '自訂順序', checked: !S.sortDir, act: sortSet(null, 0) }, { label: '漲跌幅 高→低', checked: S.sortKey === 'pct' && S.sortDir === -1, act: sortSet('pct', -1) }, { label: '漲跌幅 低→高', checked: S.sortKey === 'pct' && S.sortDir === 1, act: sortSet('pct', 1) }, { label: '成交價 高→低', checked: S.sortKey === 'price' && S.sortDir === -1, act: sortSet('price', -1) }, { label: '名稱', checked: S.sortKey === 'name' && S.sortDir === 1, act: sortSet('name', 1) }] },
  ];
  if (!compact) items.unshift({ label: '自選管理', icon: '☰', act: manageWatch }, { label: '新增分組…', icon: '＋', act: () => newGroup() }, 'sep');
  return items;
}
function clearInvalid() {
  const bad = state.watch.filter((c) => !state.quotes[c] || state.quotes[c].price == null);
  if (!bad.length) { toast('沒有失效的股票'); return; }
  confirmBox('清除失效股票', `以下 ${bad.length} 檔抓不到報價，確定刪除？<br>${bad.map((c) => esc(showCode(c))).join('、')}`, '刪除', () => { bad.forEach((c) => removeWatch(c, false)); });
}
function exportCsv() {
  const rows = [['代號', '名稱', '市場', '成交價', '漲跌', '漲跌幅%', '昨收', '最高', '最低', '成交量', '備註']];
  sortedCodes().forEach((c) => { const q = state.quotes[c] || {}, ch = chgOf(q); rows.push([showCode(c), nameOf(c), isUS(c) ? '美股' : mktOf(c) === 'otc' ? '上櫃' : '上市', q.price ?? '', q.price != null ? ch.d.toFixed(2) : '', q.price != null ? ch.pct.toFixed(2) : '', q.prev ?? '', q.high ?? '', q.low ?? '', q.volume ?? '', state.notes[c] || '']); });
  const csv = '﻿' + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `自選股_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  toast('已匯出 CSV');
}
function manageWatch() {
  const render = (m) => {
    m.querySelector('#mgList').innerHTML = state.watch.map((c, i) => `<div class="fld" style="margin-bottom:4px"><span style="flex:1">${esc(nameOf(c))} <span class="muted small">${esc(showCode(c))}</span></span>
      <button class="icon-btn" data-up="${i}" title="上移">↑</button><button class="icon-btn" data-dn="${i}" title="下移">↓</button><button class="icon-btn" data-rm="${i}" title="刪除" style="color:var(--up)">✕</button></div>`).join('');
  };
  const m = openModal('自選管理', '<div class="hint" style="margin:0 0 10px">調整順序或刪除（刪除會立即生效）</div><div id="mgList" style="max-height:50vh;overflow:auto"></div>', [{ label: '完成' }]);
  render(m);
  m.querySelector('#mgList').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; const w = state.watch;
    if (b.dataset.up) { const i = +b.dataset.up; if (i > 0) [w[i - 1], w[i]] = [w[i], w[i - 1]]; }
    if (b.dataset.dn) { const i = +b.dataset.dn; if (i < w.length - 1) [w[i + 1], w[i]] = [w[i], w[i + 1]]; }
    if (b.dataset.rm) { removeWatch(w[+b.dataset.rm], false); }
    state.settings.sortDir = 0; save('settings'); save('watch'); render(m); renderWatch();
  });
}
function editMemo(code) {
  openModal(`個股筆記：${nameOf(code)}`, `<textarea id="memoIn" placeholder="寫下你的觀察、買賣理由、目標價…">${esc(state.memos[code] || '')}</textarea><div class="hint">筆記只存在這台電腦。</div>`,
    [{ label: '取消' }, { label: '儲存', act: (m) => { const v = m.querySelector('#memoIn').value; v.trim() ? (state.memos[code] = v) : delete state.memos[code]; save('memos'); toast('筆記已儲存'); } }]);
}

/* ---------- 提醒 ---------- */
function editAlert(code) {
  const a = state.alerts[code] || {}, q = state.quotes[code];
  openModal(`設定提醒：${nameOf(code)}`, `<div class="hint" style="margin:0 0 12px">現價 ${fmtP(q?.price)}。條件達成時會跳出通知並發出提示音，觸發後該條件自動關閉。</div>
    <div class="fld"><label>價格漲到 ≥</label><input id="alA" type="number" step="any" value="${a.above ?? ''}"></div>
    <div class="fld"><label>價格跌到 ≤</label><input id="alB" type="number" step="any" value="${a.below ?? ''}"></div>
    <div class="fld"><label>當日漲幅 ≥ (%)</label><input id="alU" type="number" step="any" value="${a.pctUp ?? ''}"></div>
    <div class="fld"><label>當日跌幅 ≥ (%)</label><input id="alD" type="number" step="any" value="${a.pctDown ?? ''}"></div>`,
    [{ label: '清除提醒', cls: 'sec', act: () => { delete state.alerts[code]; save('alerts'); renderWatch(); rerender(true); } }, { label: '取消' },
     { label: '儲存', act: (m) => {
       const n = (id) => { const v = m.querySelector(id).value; return v === '' ? null : +v; };
       state.alerts[code] = { above: n('#alA'), below: n('#alB'), pctUp: n('#alU'), pctDown: n('#alD') };
       save('alerts'); renderWatch(); rerender(true); toast('提醒已設定');
       if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
     } }]);
}
function beep() { try { const c = new AudioContext(), o = c.createOscillator(), g = c.createGain(); o.frequency.value = 880; o.connect(g); g.connect(c.destination); g.gain.setValueAtTime(0.15, c.currentTime); o.start(); o.stop(c.currentTime + 0.25); } catch {} }
function checkAlerts() {
  let changed = false;
  for (const [code, a] of Object.entries(state.alerts)) {
    const q = state.quotes[code]; if (!q?.price) continue;
    const { pct } = chgOf(q), hits = [];
    if (a.above != null && q.price >= a.above) { hits.push(`漲到 ${fmtP(q.price)}（≥ ${a.above}）`); a.above = null; }
    if (a.below != null && q.price <= a.below) { hits.push(`跌到 ${fmtP(q.price)}（≤ ${a.below}）`); a.below = null; }
    if (a.pctUp != null && pct >= a.pctUp) { hits.push(`漲幅 ${pct.toFixed(2)}%`); a.pctUp = null; }
    if (a.pctDown != null && -pct >= a.pctDown) { hits.push(`跌幅 ${pct.toFixed(2)}%`); a.pctDown = null; }
    if (hits.length) {
      changed = true; const msg = `${nameOf(code)} ${hits.join('、')}`;
      state.alertLog.unshift({ time: Date.now(), code, msg }); state.alertLog = state.alertLog.slice(0, 100);
      toast('🔔 ' + msg, 6000); beep();
      if ('Notification' in window && Notification.permission === 'granted') new Notification('股價提醒', { body: msg });
      post('/api/notify/send', { title: '股價提醒', text: msg }).catch(() => {});
    }
  }
  if (changed) { save('alerts'); save('alertLog'); renderWatch(); }
}
function alertsPanel() {
  const list = Object.entries(state.alerts).filter(([, a]) => a.above != null || a.below != null || a.pctUp != null || a.pctDown != null);
  const desc = (a) => [a.above != null && `≥ ${a.above}`, a.below != null && `≤ ${a.below}`, a.pctUp != null && `漲幅 ≥ ${a.pctUp}%`, a.pctDown != null && `跌幅 ≥ ${a.pctDown}%`].filter(Boolean).join('、');
  openModal('價格提醒', `<div class="sec-title" style="padding:0 0 6px"><b>啟用中</b></div>
    ${list.length ? list.map(([c, a]) => `<div class="fld"><span style="flex:1">${esc(nameOf(c))} <span class="muted small">${esc(showCode(c))}</span><br><span class="small">${desc(a)}</span></span><span class="num">${fmtP(state.quotes[c]?.price)}</span></div>`).join('') : '<div class="empty" style="padding:8px">沒有啟用中的提醒。右鍵自選股 →「設定提醒」。</div>'}
    <div class="sec-title" style="padding:12px 0 6px"><b>最近觸發</b></div>
    ${state.alertLog.length ? state.alertLog.slice(0, 20).map((l) => `<div class="small" style="padding:3px 0"><span class="muted">${new Date(l.time).toLocaleString('zh-TW', { hour12: false })}</span>　${esc(l.msg)}</div>`).join('') : '<div class="empty" style="padding:8px">還沒有觸發紀錄</div>'}`,
    [{ label: '清空紀錄', cls: 'sec', act: () => { state.alertLog = []; save('alertLog'); } }, { label: '關閉' }]);
}

/* ---------- 右側 ---------- */
function renderSide() {
  const c = state.code, q = state.quotes[c], { d, pct } = chgOf(q), k = cls(d), isIdx = c === 't00', tw = isTW(c);
  $('#sideName').textContent = nameOf(c);
  $('#sideCode').innerHTML = isIdx ? 'TWSE 指數' : tw ? `${c}　${mktOf(c) === 'otc' ? '上櫃' : '上市'}${isEtf(c) ? '・ETF' : ''}` : `${esc(showCode(c))}　${esc(q?.exchange || '')}　${esc(q?.currency || '')}`;
  $('#favBtn').style.visibility = isIdx ? 'hidden' : 'visible';
  $('#favBtn').classList.toggle('on', state.watch.includes(c));
  $('#sidePrice').innerHTML = q ? `<span class="big num ${k}">${fmtP(q.price, pxDp(q.price))}</span><span class="chg num ${k}">${d > 0 ? "▲" : d < 0 ? "▼" : ""}${fmtP(Math.abs(d), pxDp(q.price))}　${sign(pct)}${pct.toFixed(2)}%</span>` : '<span class="big num">--</span>';
  const ds = q?.date ? `${q.date.slice(4, 6)}/${q.date.slice(6)}` : '';
  const SESL = { REGULAR: '交易中', PRE: '盤前交易中', POST: '盤後交易中', OVERNIGHT: q?.ext?.night ? '夜盤交易中' : '夜盤時段（到設定填 Alpaca 金鑰可看夜盤）', CLOSED: '已收盤' };
  let st = q ? `${!tw && !isIdx && q.session ? SESL[q.session] : isOpenFor(c) ? '交易中' : '已收盤'}　${ds} ${q.time || ''}（${tw || isIdx ? '台北' : '交易所時間'}）${q.source === 'yahoo' && tw ? '　·Yahoo' : ''}` : '';
  if (q?.ext) { const ed = q.ext.price - q.price; st += `<div class="${cls(ed)}">${q.ext.label} ${fmtP(q.ext.price)}　${sign(ed)}${fmtP(ed)} (${sign(ed)}${((ed / q.price) * 100).toFixed(2)}%)　${q.ext.time || ''}</div>`; }
  $('#sideStatus').innerHTML = st;
  $('#sideNote').hidden = !state.notes[c] && !state.memos[c];
  $('#sideNote').innerHTML = (state.notes[c] ? `📝 ${esc(state.notes[c])}` : '') + (state.memos[c] ? `${state.notes[c] ? '<br>' : ''}<span class="muted">筆記：${esc(state.memos[c].slice(0, 60))}${state.memos[c].length > 60 ? '…' : ''}</span>` : '');
  const amp = q && q.prev && q.high != null ? ((q.high - q.low) / q.prev) * 100 : null;
  const pc = (v) => (v == null || !q?.prev ? '' : cls(v - q.prev));
  const base = [['最高', fmtP(q?.high), pc(q?.high)], ['最低', fmtP(q?.low), pc(q?.low)], ['開盤', fmtP(q?.open), pc(q?.open)], ['昨收', fmtP(q?.prev), '']];
  const ampC = ['振幅', amp != null ? amp.toFixed(2) + '%' : '--', ''];
  const cells = isIdx ? [...base, ampC]
    : !tw ? [...base, ['成交量', fmtVol(q?.volume), ''], ampC, ['52週高', fmtP(q?.w52h), ''], ['52週低', fmtP(q?.w52l), '']]
    : [...base, ['漲停', fmtP(q?.limitUp), 'up'], ['跌停', fmtP(q?.limitDown), 'down'], ['成交量', q?.volume != null ? fmtVol(q.volume) + '張' : '--', ''], ampC];
  $('#qgrid').innerHTML = cells.map(([a, b, c2]) => `<span class="k">${a}</span><span class="v num ${c2}">${b}</span>`).join('');
  $('#sideTabs [data-t="inst"]').hidden = !tw;
  $('#sideTabs [data-t="book"]').hidden = state.mkt !== 'tw';
  if ((state.sideTab === 'inst' && !tw) || (state.sideTab === 'book' && state.mkt !== 'tw')) switchSideTab(state.mkt === 'tw' ? 'book' : 'trade');
  if (state.sideTab === 'book') renderBook();
  if (state.sideTab === 'trade') { if (!state.ticket.price && q?.price) renderTicket(); else renderTicketInfo(); }
  $('#topQuote').innerHTML = q ? `<b>${isIdx ? '' : esc(showCode(c)) + ' '}${esc(nameOf(c))}</b><span class="num ${k}">${fmtP(q.price)}</span><span class="num ${k}">${sign(d)}${fmtP(d)}</span><span class="num ${k}">${sign(pct)}${pct.toFixed(2)}%</span>` : `<b>${esc(nameOf(c))}</b>`;
}
$('#sideNote').addEventListener('click', () => editMemo(state.code));
$('#alertBtn').addEventListener('click', () => editAlert(state.code));
$('#favBtn').addEventListener('click', () => (state.watch.includes(state.code) ? removeWatch(state.code) : addWatch(state.code)));

function renderBook() {
  const el = $('#tabBook'), q = state.quotes[state.code];
  if (state.code === 't00') { el.innerHTML = '<div class="empty">指數沒有五檔報價</div>'; return; }
  if (!isTW(state.code)) { el.innerHTML = '<div class="empty">免費資料源沒有美股五檔<br>（需付費 Level 2 行情）</div>'; return; }
  if (!q || (!q.asks?.length && !q.bids?.length)) { el.innerHTML = `<div class="empty">目前沒有五檔資料<br>${q?.source === 'yahoo' ? '（證交所 MIS 暫時連不上，改用 Yahoo 延遲報價，沒有五檔）' : '（盤後或尚未開盤）'}</div>`; return; }
  const mx = Math.max(1, ...[...q.asks, ...q.bids].map((x) => x.v || 0));
  const row = (lv, x, color) => `<div class="book-row" data-px="${x.p}"><span class="lv">${lv}</span><span class="p num ${cls(x.p - q.prev)}">${fmtP(x.p)}</span><span class="v num"><i class="bar" style="width:${((x.v || 0) / mx) * 100}%;background:${color}"></i>${(x.v || 0).toLocaleString()}</span></div>`;
  const asks = q.asks.slice(0, 5).map((x, i) => ({ ...x, i })).reverse();
  const sa = q.asks.reduce((s, x) => s + (x.v || 0), 0), sb = q.bids.reduce((s, x) => s + (x.v || 0), 0), tot = sa + sb || 1;
  el.innerHTML = asks.map((x) => row('賣' + (x.i + 1), x, DOWN)).join('') + '<div class="book-sep"></div>' + q.bids.slice(0, 5).map((x, i) => row('買' + (i + 1), x, UP)).join('') +
    `<div class="ratio"><div class="ratio-txt"><span class="up">委買 ${sb.toLocaleString()} (${((sb / tot) * 100).toFixed(0)}%)</span><span class="down">委賣 ${sa.toLocaleString()} (${((sa / tot) * 100).toFixed(0)}%)</span></div><div class="ratio-bar"><div class="b" style="width:${(sb / tot) * 100}%"></div><div class="s" style="width:${(sa / tot) * 100}%"></div></div></div><div class="tnote">點五檔價格可以帶入模擬下單</div>`;
}
$('#tabBook').addEventListener('click', (e) => { const r = e.target.closest('[data-px]'); if (!r) return; state.ticket.price = r.dataset.px; state.ticket.type = 'limit'; state.ticket.code = state.code; switchSideTab('trade'); });

let instSeq = 0;
async function loadInst() {
  const el = $('#tabInst'), code = state.code, seq = ++instSeq;
  el.innerHTML = '<div class="empty">載入三大法人資料中…<br>（第一次需要幾秒）</div>';
  try {
    const d = await api(`/api/inst?code=${code}&days=10`); if (seq !== instSeq) return;
    if (!d.supported) { el.innerHTML = '<div class="empty">目前只支援上市股票的三大法人資料</div>'; return; }
    if (!d.rows.length) { el.innerHTML = '<div class="empty">查無三大法人資料</div>'; return; }
    const r0 = d.rows[0], fv = (v) => `<span class="num ${cls(v)}">${sign(v)}${v.toLocaleString()}</span>`;
    const rows = [...d.rows].reverse(), mx = Math.max(1, ...rows.map((r) => Math.abs(r.total)));
    el.innerHTML = `<div class="inst-title">${r0.date.slice(4, 6)}/${r0.date.slice(6)} 買賣超（張）</div>
      <div class="inst-cards">${[['外資', r0.foreign], ['投信', r0.trust], ['自營商', r0.dealer], ['合計', r0.total]].map(([k, v]) => `<div class="inst-card"><div class="k">${k}</div><div class="v">${fv(v)}</div></div>`).join('')}</div>
      <div class="inst-title">近 ${rows.length} 日合計買賣超</div>
      <div class="inst-bars">${rows.map((r) => `<div class="col" title="${r.date}：${r.total.toLocaleString()} 張"><i style="height:${(Math.abs(r.total) / mx) * 50}%;${r.total >= 0 ? 'bottom:50%' : 'top:50%'};background:${r.total >= 0 ? UP : DOWN}"></i></div>`).join('')}</div>
      <table class="inst-table"><tr><th>日期</th><th>外資</th><th>投信</th><th>自營</th><th>合計</th></tr>${d.rows.map((r) => `<tr><td class="num">${r.date.slice(4, 6)}/${r.date.slice(6)}</td><td>${fv(r.foreign)}</td><td>${fv(r.trust)}</td><td>${fv(r.dealer)}</td><td>${fv(r.total)}</td></tr>`).join('')}</table>`;
  } catch (e) { if (seq === instSeq) el.innerHTML = `<div class="empty">載入失敗：${esc(e.message)}</div>`; }
}
let sideNewsSeq = 0;
async function loadSideNews() {
  const el = $('#tabNews'), code = state.code, seq = ++sideNewsSeq;
  if (code === 't00') { el.innerHTML = '<div class="empty">請到「觀察」看市場快訊</div>'; return; }
  el.innerHTML = '<div class="empty">載入新聞…</div>';
  try {
    const list = await api('/api/news?code=' + encodeURIComponent(code) + TR); if (seq !== sideNewsSeq) return;
    el.innerHTML = '<button class="btn-ghost" style="width:100%;margin-bottom:8px" data-goinfo>完整資訊頁（公司資料、營收、EPS、股利）›</button>' + (list.length ? list.map(newsItem).join('') : '<div class="empty">沒有相關新聞</div>');
  } catch (e) { el.innerHTML = `<div class="empty">載入失敗：${esc(e.message)}</div>`; }
}
function newsItem(n) {
  const ago = n.time ? (Date.now() / 1000 - n.time) : null;
  const t = ago == null ? '' : ago < 3600 ? `${Math.max(1, Math.round(ago / 60))} 分鐘前` : ago < 86400 ? `${Math.round(ago / 3600)} 小時前` : ago < 172800 ? '昨天 ' + new Date(n.time * 1000).toTimeString().slice(0, 5) : new Date(n.time * 1000).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
  // 英文新聞：中文介面時標題用翻譯、原文縮小放下面；翻譯失敗就附「翻譯」連結
  const en = LANG !== 'en' && n.title && !/[㐀-鿿]/.test(n.title);
  const title = en && n.title_zh ? `<div class="t" title="${esc(n.title)}">${esc(n.title_zh)}</div>` : `<div class="t">${esc(n.title)}</div>`; // 中文為主，英文原文放在滑鼠提示
  const trLink = en && !n.title_zh ? `<span class="tr-link" data-tr="${esc(n.title)}">翻譯</span>` : '';
  return `<a class="news-item" href="${esc(n.link)}" target="_blank" rel="noopener">${title}${n.summary ? `<div class="sm">${esc(n.summary)}</div>` : ''}<div class="m">${esc(n.publisher || '')}${n.cat ? '・' + esc(n.cat) : ''}　${t}${trLink}</div></a>`;
}
const TR = LANG !== 'en' ? '&tr=1' : '';
document.addEventListener('click', (e) => { // 「翻譯」連結：開 Google 翻譯，不開新聞本身
  const el = e.target.closest('[data-tr]'); if (!el) return;
  e.preventDefault(); e.stopPropagation();
  window.open('https://translate.google.com/?sl=en&tl=zh-TW&op=translate&text=' + encodeURIComponent(el.dataset.tr), '_blank', 'noopener');
}, true);
function switchSideTab(t) {
  state.sideTab = t;
  $$('#sideTabs button').forEach((x) => x.classList.toggle('active', x.dataset.t === t));
  ['Book', 'Inst', 'Trade'].forEach((n) => ($('#tab' + n).hidden = t !== n.toLowerCase()));
  if (t === 'inst') loadInst(); if (t === 'book') renderBook(); if (t === 'trade') renderTicket();
}
$('#sideTabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) switchSideTab(b.dataset.t); });

/* ---------- 模擬下單 ---------- */
function feesOf(code, side, amount, qty = 1) {
  if (code.startsWith('OPT.TW:')) return { fee: 25 * qty, tax: Math.round(amount * 0.001) };
  if (code.startsWith('OPT.US:')) return { fee: +(0.65 * qty).toFixed(2), tax: 0 };
  if (!isTW(code)) return { fee: 0, tax: 0 }; return { fee: Math.max(20, Math.round(amount * 0.001425)), tax: side === 'sell' ? Math.round(amount * (code.startsWith('0') ? 0.001 : 0.003)) : 0 }; }
function renderTicket() {
  const el = $('#tabTrade'), c = state.code, t = state.ticket;
  if (c === 't00' || c.startsWith('FX.') || c.startsWith('Y.') || isGL(c)) { el.innerHTML = `<div class="empty">${isGL(c) ? '其他股市暫不支援模擬交易' : '這個商品不能模擬交易'}，請選擇台股或美股個股</div>`; return; }
  const q = state.quotes[c];
  if (!t.price || t.code !== c) { t.price = q?.price ?? ''; t.code = c; t.unit = isTW(c) ? 1000 : 1; t.qty = 1; }
  if (!isTW(c)) t.unit = 1;
  el.innerHTML = `<div class="ticket">
    <div class="bs"><button class="buy ${t.side === 'buy' ? 'active' : ''}" data-side="buy">買進</button><button class="sell ${t.side === 'sell' ? 'active' : ''}" data-side="sell">賣出</button></div>
    <div class="row"><label>類型</label><div class="seg"><button data-ty="limit" class="${t.type === 'limit' ? 'active' : ''}">限價</button><button data-ty="market" class="${t.type === 'market' ? 'active' : ''}">市價</button></div></div>
    <div class="row"><label>價格</label><div class="numin"><button data-step="-1">−</button><input id="tkPrice" value="${t.type === 'market' ? '' : t.price}" placeholder="${t.type === 'market' ? '市價成交' : ''}" ${t.type === 'market' ? 'disabled' : ''} inputmode="decimal"><button data-step="1">+</button></div></div>
    <div class="row"><label>數量</label><div class="numin"><button data-qstep="-1">−</button><input id="tkQty" value="${t.qty}" inputmode="numeric"><button data-qstep="1">+</button></div>
      ${isTW(c) ? `<div class="seg unit"><button data-u="1000" class="${t.unit === 1000 ? 'active' : ''}">張</button><button data-u="1" class="${t.unit === 1 ? 'active' : ''}">股</button></div>` : '<span class="muted small">股</span>'}</div>
    <div class="tinfo" id="tkInfo"></div>
    <button class="submit ${t.side}" id="tkSubmit">${t.side === 'buy' ? '模擬買進' : '模擬賣出'} ${esc(showCode(c))}</button>
    <div class="tmsg" id="tkMsg"></div>
    <div class="tnote">這是模擬交易，不會送出任何真實委託。限價單在交易時段每 5 秒撮合一次；非交易時段只能下限價單，開盤後自動撮合。</div></div>`;
  renderTicketInfo();
}
function renderTicketInfo() {
  const el = $('#tkInfo'); if (!el) return;
  const c = state.code, t = state.ticket, q = state.quotes[c], ccy = ccyOf(c);
  const px = t.type === 'market' ? q?.price : parseFloat(t.price), shares = (parseInt(t.qty) || 0) * t.unit, amount = (px || 0) * shares;
  const { fee, tax } = feesOf(c, t.side, amount), acc = state.paper, pos = acc?.positions?.[c];
  const total = t.side === 'buy' ? amount + fee : amount - fee - tax;
  el.innerHTML = `<span>股數</span><span class="num">${fmtInt(shares)} 股</span><span>預估金額</span><span class="num">${fmtP(amount)} ${ccy}</span>
    <span>手續費${t.side === 'sell' && tax ? '＋稅' : ''}</span><span class="num">${fmtP(fee + tax)}</span>
    <span>${t.side === 'buy' ? '預估付出' : '預估收入'}</span><span class="num ${t.side === 'buy' ? 'up' : 'down'}">${fmtP(total)} ${ccy}</span>
    <span>可用現金</span><span class="num">${acc ? fmtP(acc.cash[ccy]) : '--'} ${ccy}</span><span>庫存</span><span class="num">${pos ? fmtInt(pos.qty) + ' 股' : '0'}</span>`;
}
$('#tabTrade').addEventListener('click', async (e) => {
  const t = state.ticket, c = state.code, q = state.quotes[c], b = e.target.closest('button'); if (!b) return;
  if (b.dataset.side) { t.side = b.dataset.side; renderTicket(); }
  else if (b.dataset.ty) { t.type = b.dataset.ty; if (t.type === 'limit' && !t.price) t.price = q?.price ?? ''; renderTicket(); }
  else if (b.dataset.u) { t.unit = +b.dataset.u; renderTicket(); }
  else if (b.dataset.step && t.type === 'limit') { const p = parseFloat(t.price) || q?.price || 0, s = tickSize(p, c); t.price = Math.max(s, +(p + s * +b.dataset.step).toFixed(2)); renderTicket(); }
  else if (b.dataset.qstep) { t.qty = Math.max(1, (parseInt(t.qty) || 0) + +b.dataset.qstep); renderTicket(); }
  else if (b.id === 'tkSubmit') {
    b.disabled = true;
    const r = await post('/api/paper/order', { code: c, side: t.side, type: t.type, qty: (parseInt(t.qty) || 0) * t.unit, price: t.type === 'limit' ? parseFloat(t.price) : null }).catch((err) => ({ ok: false, msg: err.message }));
    b.disabled = false;
    $('#tkMsg').innerHTML = `<span class="${r.ok ? (t.side === 'buy' ? 'up' : 'down') : 'down'}">${r.ok ? '✓ ' : '✕ '}${esc(r.msg)}</span>`;
    toast((r.ok ? '' : '失敗：') + r.msg); await loadPaper();
  }
});
$('#tabTrade').addEventListener('input', (e) => { if (e.target.id === 'tkPrice') state.ticket.price = e.target.value; if (e.target.id === 'tkQty') state.ticket.qty = e.target.value; renderTicketInfo(); });
async function loadPaper() {
  try { state.paper = await api('/api/paper'); } catch { return; }
  const missing = Object.keys(state.paper.positions).filter((c) => !state.quotes[c]);
  if (missing.length) { try { Object.assign(state.quotes, await api('/api/quote?codes=' + missing.map(encodeURIComponent).join(','))); } catch {} }
  if (state.view === 'paper') PAGES.paper.render(); renderTicketInfo();
}

/* ---------- 頁面切換 ---------- */
const PAGES = {}; // pages.js 註冊：{ load(), render?(), tick?() }
function setView(v) {
  state.view = v;
  $$('#nav [data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
  ['Chart', 'Market', 'Rank', 'Options', 'News', 'Calendar', 'Paper', 'Heatmap', 'Screener', 'Strategy', 'Multi'].forEach((n) => ($('#view' + n).hidden = n.toLowerCase() !== v));
  $('#app').classList.toggle('full-view', ['calendar', 'heatmap', 'screener', 'strategy', 'multi'].includes(v)); // 這些頁面全寬
  setTimeout(() => draw.resize(), 60);
  if (v === 'chart') { draw.resize(); } else PAGES[v]?.load();
  if (v !== 'multi') PAGES.multi?.leave?.();
}
$('#nav').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.view) setView(b.dataset.view);
  if (b.dataset.act === 'alerts') alertsPanel();
  if (b.dataset.act === 'index') { selectCode(MKT_INDEX[state.mkt]); setView('chart'); }
  if (b.dataset.act === 'settings') settingsPanel();
  if (b.dataset.act === 'fullscreen') toggleFullscreen(document.documentElement);
  if (b.dataset.act === 'lang') setLang(LANG === 'en' ? 'zh' : 'en');
});
function settingsPanel() {
  const S = state.settings;
  openModal('設定', `<div class="fld"><label>外觀</label><select id="stTheme">${[['dark', '深色'], ['light', '淺色'], ['auto', '跟隨系統']].map(([v, n]) => `<option value="${v}" ${(S.theme || 'dark') === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    <div class="fld"><label>漲跌顏色</label><select id="stColor"><option value="redUp" ${S.colorMode === 'redUp' ? 'selected' : ''}>紅漲綠跌（台灣習慣）</option><option value="greenUp" ${S.colorMode === 'greenUp' ? 'selected' : ''}>綠漲紅跌（歐美習慣）</option></select></div>
    <div class="fld"><label>盤中更新頻率</label><select id="stRef">${[5, 10, 30].map((s) => `<option value="${s}" ${S.refresh === s ? 'selected' : ''}>每 ${s} 秒</option>`).join('')}</select></div>
    <div class="fld"><label>語言 Language</label><select id="stLang"><option value="zh" ${LANG === 'zh' ? 'selected' : ''}>繁體中文</option><option value="en" ${LANG === 'en' ? 'selected' : ''}>English</option></select></div>
    <div class="fld"><label>夜盤資料</label><button class="btn sec" id="stAlpaca">設定 Alpaca 金鑰</button></div>
    <div class="fld"><label>推播通知</label><button class="btn sec" id="stNotify">設定 Telegram／Discord／ntfy</button></div>
    <div class="fld"><label>版面</label><button class="btn sec" id="stLayout">重設左右欄寬度</button></div>
    <div class="fld"><label>資料</label><button class="btn sec" id="stExport">匯出設定與自選</button><button class="btn sec" id="stImport">匯入</button></div>
    <div class="hint">台股報價：證交所 MIS（若被限流自動改用 Yahoo）。美股：Yahoo Finance，夜盤：Alpaca（Blue Ocean ATS）。期權：期交所、Yahoo。新聞：Yahoo 股市、鉅亨網。日曆：Nasdaq、證交所。</div>`,
    [{ label: '取消' }, { label: '儲存', act: (m) => { const lang = m.querySelector('#stLang').value; if (lang !== LANG) { setLang(lang); return; } S.colorMode = m.querySelector('#stColor').value; S.theme = m.querySelector('#stTheme').value; S.refresh = +m.querySelector('#stRef').value; save('settings'); applyColors(); applyTheme(); rerender(true); renderWatch(); renderSide(); toast('設定已儲存'); } }]);
  $('#stNotify').onclick = () => { closeModal(); notifyPanel(); };
  $('#stAlpaca').onclick = () => { closeModal(); alpacaPanel(); };
  $('#stLayout').onclick = () => { state.layout = { lw: 440, rw: 320, noLeft: false, noRight: false }; applyLayout(); toast('已重設版面'); };
  $('#stExport').onclick = () => {
    const data = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('tw.')) data[k] = localStorage.getItem(k); }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })); a.download = '看盤設定備份.json'; a.click();
  };
  $('#stImport').onclick = () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
    inp.onchange = async () => { try { const d = JSON.parse(await inp.files[0].text()); Object.entries(d).forEach(([k, v]) => k.startsWith('tw.') && localStorage.setItem(k, v)); toast('已匯入，重新載入中…'); setTimeout(() => location.reload(), 800); } catch { toast('檔案格式不正確'); } };
    inp.click();
  };
}

/* ---------- 版面：收合與拖曳寬度 ---------- */
function applyLayout() {
  const L = state.layout, app = $('#app');
  app.style.setProperty('--lw', L.lw + 'px'); app.style.setProperty('--rw', L.rw + 'px');
  app.classList.toggle('no-left', L.noLeft); app.classList.toggle('no-right', L.noRight);
  $('[data-resize="left"] .rz-btn').textContent = L.noLeft ? '›' : '‹';
  $('[data-resize="right"] .rz-btn').textContent = L.noRight ? '‹' : '›';
  store.set('tw.layout', L); store.set('tw.lw440', 1);
  setTimeout(() => draw.resize(), 50);
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-collapse]'); if (!b) return; e.stopPropagation();
  const k = b.dataset.collapse === 'left' ? 'noLeft' : 'noRight'; state.layout[k] = !state.layout[k]; applyLayout();
});
$$('.resizer').forEach((rz) => {
  rz.addEventListener('mousedown', (e) => {
    if (e.target.closest('.rz-btn')) return;
    const side = rz.dataset.resize, L = state.layout, startX = e.clientX, start = side === 'left' ? L.lw : L.rw;
    if ((side === 'left' && L.noLeft) || (side === 'right' && L.noRight)) return;
    rz.classList.add('drag'); document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
    const mv = (ev) => { const dx = ev.clientX - startX, w = Math.max(300, Math.min(720, side === 'left' ? start + dx : start - dx)); side === 'left' ? (L.lw = w) : (L.rw = w); $('#app').style.setProperty(side === 'left' ? '--lw' : '--rw', w + 'px'); };
    const upf = () => { rz.classList.remove('drag'); document.body.style.cursor = ''; document.body.style.userSelect = ''; window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', upf); applyLayout(); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', upf);
  });
  rz.addEventListener('dblclick', () => { const k = rz.dataset.resize === 'left' ? 'noLeft' : 'noRight'; state.layout[k] = !state.layout[k]; applyLayout(); });
});

/* ---------- 底部 ---------- */
function renderFoot() {
  const want = FOOT_BY[state.mkt].join(',');
  if ($('#footIdx').dataset.k !== want) { $('#footIdx').dataset.k = want; $('#footIdx').innerHTML = FOOT_BY[state.mkt].map((c) => `<span class="foot-idx" data-code="${c}"></span>`).join(''); }
  $$('.foot-idx').forEach((el) => {
    const code = el.dataset.code, q = state.quotes[code], { d, pct } = chgOf(q), k = cls(d), fx = code.startsWith('FX.');
    el.innerHTML = q ? `<b>${FOOT_NAMES[code]}</b><span class="num ${k}">${fmtP(q.price, fx ? 3 : code === 'FUT.TXF' ? 0 : 2)} ${fx ? '' : (d >= 0 ? '▲' : '▼') + fmtP(Math.abs(d), code === 'FUT.TXF' ? 0 : 2) + ' '}${sign(pct)}${pct.toFixed(2)}%</span>` : `<b>${FOOT_NAMES[code]}</b>--`;
  });
  const us = state.mkt === 'us', ses = us ? (Object.values(state.quotes).find((q) => isUS(q.code || '') && !q.code.includes('^'))?.session || 'CLOSED') : (twOpen() ? 'REGULAR' : 'CLOSED');
  const SES = { REGULAR: '交易中', PRE: '盤前交易', POST: '盤後交易', OVERNIGHT: '夜盤時段', CLOSED: '收盤' };
  $$('[data-mkt-toggle]').forEach((el) => el.classList.toggle('live', ses === 'REGULAR')); // 交易中時滑塊上亮呼吸燈
  $('#mktStat').innerHTML = `<i class="${ses === 'REGULAR' ? 'open' : ses === 'PRE' || ses === 'POST' ? 'ext' : ''}"></i>${us ? '美股' : '台股'}${SES[ses]}`;
  $('#srcNote').textContent = Object.values(state.quotes).some((q) => q.source === 'yahoo' && isTW(q.code || '')) ? '⚠ 證交所 MIS 暫時連不上，台股報價改用 Yahoo（約延遲 20 分鐘）' : '';
}
$('#foot').addEventListener('click', (e) => {
  const el = e.target.closest('.foot-idx'); if (!el) return; const c = el.dataset.code;
  if (c === 'FUT.TXF') { setView('options'); return; } if (c.startsWith('FX.') || c === 'o00') return;
  selectCode(c); setView('chart');
});
setInterval(() => {
  const n = twNow(); let s = `台北 ${n.getMonth() + 1}/${n.getDate()} ${n.toTimeString().slice(0, 8)}`;
  if (state.mkt === 'us') { try { s = `紐約 ${new Date().toLocaleString('zh-TW', { timeZone: 'America/New_York', hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}　` + s; } catch {} }
  $('#clock').textContent = s;
}, 1000);

/* ---------- 搜尋 ---------- */
let hl = 0, results = [], usTimer = null, searchSeq = 0, searchMsg = '';
function searchTW(qs) {
  qs = qs.trim().toLowerCase(); if (!qs) return [];
  const a = [], b = [];
  for (const s of state.list) { if (s.code.toLowerCase().startsWith(qs)) a.push(s); else if (s.name.toLowerCase().includes(qs)) b.push(s); if (a.length > 20) break; }
  a.sort((x, y) => x.code.length - y.code.length || x.code.localeCompare(y.code));
  return [...a, ...b].slice(0, 15);
}
// 本機中文名稱表（美股＋其他股市），打中文立刻有結果，不用等 Yahoo
function searchZh(qs) {
  qs = qs.trim().toLowerCase(); if (!qs) return [];
  const out = [];
  for (const [c, n] of Object.entries(ZH_NAME)) {
    if (!(isUS(c) || isGL(c))) continue;
    const nl = n.toLowerCase(), cl = showCode(c).toLowerCase();
    if (nl.includes(qs) || cl.startsWith(qs)) out.push({ code: c, name: n, mkt: isUS(c) ? 'us' : 'gl', ex: isUS(c) ? '美股' : regionOf(c), r: (nl.startsWith(qs) || cl === qs ? 0 : 1) });
  }
  return out.sort((x, y) => x.r - y.r || x.name.length - y.name.length).slice(0, 12);
}
function mergeResults(...lists) { const seen = new Set(), out = []; lists.flat().forEach((s) => { if (s && !seen.has(s.code)) { seen.add(s.code); out.push(s); } }); return out.slice(0, 24); }
const mktLabel = (s) => (s.mkt === 'us' ? s.ex || '美股' : s.mkt === 'gl' ? s.ex || '國際' : s.mkt === 'otc' ? '上櫃' : '上市');
function renderDrop() {
  const dr = $('#searchDrop'), v = $('#searchInput').value.trim();
  if (!v) { dr.classList.remove('open'); return; }
  dr.innerHTML = results.length ? results.map((s, i) => `<div class="sitem ${i === hl ? 'hl' : ''}" data-code="${esc(s.code)}" data-name="${esc(s.name)}"><span class="c">${esc(showCode(s.code))}</span><span class="n">${esc(s.name)}</span><span class="m ${s.mkt === 'gl' ? 'gl' : ''}">${esc(mktLabel(s))}</span><button class="add" data-add="${esc(s.code)}" title="加入自選">${state.watch.includes(s.code) ? '♥' : '+'}</button></div>`).join('')
    + (searchMsg ? `<div class="empty small">${searchMsg}</div>` : '') : `<div class="empty">${searchMsg || '找不到符合的股票'}</div>`;
  dr.classList.add('open');
}
// 一個搜尋框查全部市場：台股清單、中文名稱表先出，再補上 Yahoo（美股與日韓港歐等）的結果
$('#searchInput').addEventListener('input', (e) => {
  const v = e.target.value.trim(), seq = ++searchSeq; clearTimeout(usTimer);
  const tw = searchTW(v), zh = searchZh(v), local = state.mkt === 'tw' ? mergeResults(tw, zh) : mergeResults(zh, tw);
  results = local; hl = 0;
  const remote = v && /[a-z0-9]/i.test(v);
  searchMsg = remote ? '搜尋其他市場中…' : ''; renderDrop();
  if (!remote) return;
  usTimer = setTimeout(async () => {
    let r = [], err = false;
    try { r = await api('/api/search?q=' + encodeURIComponent(v)); } catch { err = true; }
    if (seq !== searchSeq) return;
    results = state.mkt === 'tw' ? mergeResults(tw, zh, r) : mergeResults(zh, r, tw);
    searchMsg = err ? (results.length ? '其他市場暫時查不到，請稍後再試' : '搜尋失敗，請稍後再試') : '';
    renderDrop();
  }, 220);
});
$('#searchInput').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { hl = Math.min(hl + 1, results.length - 1); renderDrop(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { hl = Math.max(hl - 1, 0); renderDrop(); e.preventDefault(); }
  else if (e.key === 'Enter') {
    const v = e.target.value.trim(); let s = results[hl];
    if (!s && /^[a-z0-9\-]{1,10}\.[a-z]{1,3}$/i.test(v)) s = { code: 'G.' + v.toUpperCase() }; else if (!s && /^\d{4,6}[A-Z]?$/i.test(v)) s = { code: v.toUpperCase() }; else if (!s && /^[a-z.\-]{1,6}$/i.test(v)) s = { code: 'US.' + v.toUpperCase() };
    if (s) { rememberName(s.code, s.name); selectCode(s.code); setView('chart'); closeDrop(); }
  } else if (e.key === 'Escape') closeDrop();
});
$('#searchDrop').addEventListener('mousedown', (e) => {
  e.preventDefault(); const it = e.target.closest('.sitem'); if (!it) return; rememberName(it.dataset.code, it.dataset.name);
  if (e.target.closest('[data-add]')) { state.watch.includes(it.dataset.code) ? removeWatch(it.dataset.code) : addWatch(it.dataset.code); renderDrop(); return; }
  selectCode(it.dataset.code); setView('chart'); closeDrop();
});
$('#searchInput').addEventListener('blur', () => setTimeout(closeDrop, 120));
function closeDrop() { $('#searchDrop').classList.remove('open'); $('#searchInput').value = ''; results = []; }
document.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || $('#modalBg').classList.contains('open')) return;
  if (/^[0-9a-zA-Z]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) $('#searchInput').focus();
});

/* ---------- 工具列 ---------- */
// 各時段的台北時間（美國日光節約時自動提早一小時），例如冬令盤中 22:30–05:00
function sessRange(k) {
  const now = new Date(), y = now.getUTCFullYear();
  const nth = (m, n) => { const d = new Date(Date.UTC(y, m, 1)); return 1 + ((7 - d.getUTCDay()) % 7) + (n - 1) * 7; }; // 第 n 個星期日
  const dst = now >= new Date(Date.UTC(y, 2, nth(2, 2), 7)) && now < new Date(Date.UTC(y, 10, nth(10, 1), 6));
  const et = dst ? -4 : -5, tw = (h) => { const x = (((h - et + 8) % 24) + 24) % 24, hh = Math.floor(x), mm = Math.round((x - hh) * 60); return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; };
  const R = { pre: [4, 9.5], reg: [9.5, 16], post: [16, 20], night: [20, 28] }[k];
  return `${tw(R[0])}–${tw(R[1])}`;
}
function syncSessBtn() {
  let sb = $('#sessBtn');
  if (!sb) {
    sb = document.createElement('button'); sb.id = 'sessBtn'; sb.className = 'sess-btn'; $('#periods').prepend(sb);
    sb.addEventListener('click', (e) => {
      e.stopPropagation(); const r = sb.getBoundingClientRect(), cur = state.sessMode;
      const pick = (v) => { state.sessMode = v; store.set('tw.sessMode', v); loadKline(); syncSessBtn(); };
      openMenu(r.left, r.bottom + 4, [
        { label: `${cur === 'auto' ? '✓ ' : '　'}自動（跟著目前時段）`, act: () => pick('auto') },
        ...Object.entries(SESS).map(([k, n]) => ({ label: `${cur === k ? '✓ ' : '　'}${n}${k === 'all' ? '' : '　' + sessRange(k)}`, act: () => pick(k) })),
      ]);
    });
  }
  sb.hidden = !sessOn();
  const m = sessResolved();
  sb.innerHTML = `${SESS[m]} ▾`;
  sb.title = '分時時段：預設跟著目前是盤前、盤中、盤後或夜盤自動切換';
  sb.classList.toggle('active', state.sessMode !== 'auto');
}
function syncToolbar() {
  const P = PERIODS[state.period];
  syncSessBtn();
  let eb = $('#extBtn');
  if (!eb) { eb = document.createElement('button'); eb.id = 'extBtn'; eb.className = 'ext-btn'; eb.title = '美股盤前（04:00–09:30）與盤後（16:00–20:00，美東時間）'; eb.textContent = '盤前盤後'; $('#periods').appendChild(eb);
    eb.addEventListener('click', (e) => { e.stopPropagation(); state.extHours = !state.extHours; store.set('tw.extHours', state.extHours); syncToolbar(); loadKline(); }); }
  eb.hidden = state.mkt !== 'us' || sessOn(); eb.classList.toggle('active', state.extHours); eb.disabled = !EXT_OK.has(state.period);
  $$('#periods > button[data-p]').forEach((b) => b.classList.toggle('active', b.dataset.p === state.period));
  $$('#moreMenu button').forEach((b) => b.classList.toggle('active', b.dataset.p === state.period));
  $('#moreBtn').classList.toggle('active', !!P.more); $('#moreBtn').textContent = (P.more ? P.label : '更多') + ' ▾';
}
function setPeriod(p) { state.period = p; store.set('tw.period', p); syncToolbar(); loadKline(); }
$('#periods').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'moreBtn') { $('#moreMenu').classList.toggle('open'); e.stopPropagation(); return; }
  if (b.dataset.p) { $('#moreMenu').classList.remove('open'); setPeriod(b.dataset.p); }
});
document.addEventListener('click', (e) => { if (!e.target.closest('#morePeriods')) $('#moreMenu').classList.remove('open'); });

/* ---------- 資料更新 ---------- */
let quoteBusy = false, quotePending = false;
async function refreshFutures() {
  try {
    const list = await api('/api/futures'); const near = list.find((r) => /^TXF[A-L]\d-F$/.test(r.id));
    if (near) state.quotes['FUT.TXF'] = { code: 'FUT.TXF', name: near.name, price: near.last, prev: near.ref, high: near.high, low: near.low };
    state.futures = list;
  } catch {}
}
async function refreshQuotes() {
  if (quoteBusy) { quotePending = true; return; } // 進行中就排一次補抓（例如切換市場時）
  quoteBusy = true;
  const pos = state.paper ? Object.keys(state.paper.positions) : [], pend = state.paper ? state.paper.orders.filter((o) => o.status === 'pending').map((o) => o.code) : [];
  const mine = (c) => ccyOf(c) === (state.mkt === 'tw' ? 'TWD' : 'USD');
  const codes = [...new Set([...state.watch, state.code, ...pos.filter(mine), ...pend.filter(mine), ...Object.keys(state.alerts).filter(mine), ...FOOT_BY[state.mkt].filter((c) => c !== 'FUT.TXF')])];
  try {
    const [q] = await Promise.all([api('/api/quote?codes=' + codes.map(encodeURIComponent).join(',')), state.mkt === 'tw' ? refreshFutures() : null]);
    Object.assign(state.quotes, q);
    renderWatch(); renderSide(); renderFoot(); checkAlerts();
    if (state.view === 'chart') liveUpdate(); else PAGES[state.view]?.tick?.();
  } catch (e) { console.warn('quote', e); }
  quoteBusy = false;
  if (quotePending) { quotePending = false; refreshQuotes(); }
}
async function refreshSparks() { try { Object.assign(state.sparks, await api('/api/spark?codes=' + state.watch.map(encodeURIComponent).join(','))); renderWatch(); } catch (e) { console.warn('spark', e); } }
function selectCode(code) {
  state.code = code; store.set('tw.code.' + state.mkt, code); state.ticket.code = null;
  draw.setTool('cursor'); draw.setItems(store.get('tw.draw.' + code, []));
  renderWatch(); renderSide(); loadKline(); refreshQuotes();
  if (state.sideTab === 'inst' && isTW(code)) loadInst(); if (state.sideTab === 'trade') renderTicket();
}
// 市場切換：單一按鈕，外框有一道緩慢繞行的細光，切換時代號亂碼解碼＋掃描線
function renderMktSwitch() {
  const m = state.mkt;
  $$('[data-mkt-toggle]').forEach((el) => {
    const live = el.classList.contains('live');
    el.className = `mkt-btn ${m}${el.id === 'mktSwitchM' ? ' m-mkt' : ''}${live ? ' live' : ''}`;
    el.innerHTML = `<span class="mx"><span class="mx-ring"></span><span class="mx-core"><span class="mx-code">${m === 'tw' ? 'TW' : 'US'}</span></span><span class="mx-scan"></span><i class="mx-live"></i></span>${el.id === 'mktSwitch' ? `<span class="mx-sub">${m === 'tw' ? '台股' : '美股'}</span>` : ''}`;
    el.title = `目前是${m === 'tw' ? '台股' : '美股'}，點一下切換到${m === 'tw' ? '美股' : '台股'}`;
    el.setAttribute('aria-label', el.title);
  });
  document.body.dataset.mkt = m;
  $('#searchInput').placeholder = m === 'tw' ? '搜尋全球股票：2330、台積電、三星' : '搜尋全球股票：AAPL、輝達、豐田';
}
function switchMarket(m) {
  if (m === state.mkt) return;
  state.mkt = m; store.set('tw.mkt', m);
  state.watch = store.get('tw.watch.' + m, []); state.groups = store.get('tw.groups.' + m, []); state.filter = 'all';
  state.code = store.get('tw.code.' + m, DEFAULT_CODE[m]); state.ticket.code = null; state.bars = [];
  draw.setTool('cursor'); draw.setItems(store.get('tw.draw.' + state.code, []));
  renderMktSwitch(); renderWatchTabs(); renderWatch(); renderSide(); renderFoot();
  if (state.sideTab === 'book' && m !== 'tw') switchSideTab('trade'); else if (state.sideTab === 'trade') renderTicket();
  loadKline(); refreshQuotes(); refreshSparks();
  setView(state.view);
  toast(`已切換到${m === 'tw' ? '台股' : '美股'}`);
}
function mktScramble() {
  const CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&$', want = state.mkt === 'tw' ? 'TW' : 'US';
  $$('[data-mkt-toggle]').forEach((el) => {
    el.classList.remove('switching'); void el.offsetWidth; el.classList.add('switching');
    clearTimeout(el._sw); el._sw = setTimeout(() => el.classList.remove('switching'), 700);
    const code = el.querySelector('.mx-code'); if (!code) return;
    let n = 0; clearInterval(el._sc);
    el._sc = setInterval(() => {
      n++; code.textContent = [...want].map((c, i) => (n > 6 + i * 3 ? c : CH[Math.floor(Math.random() * CH.length)])).join('');
      if (n > 6 + want.length * 3) clearInterval(el._sc);
    }, 38);
  });
}
$$('[data-mkt-toggle]').forEach((el) => el.addEventListener('click', () => { switchMarket(state.mkt === 'tw' ? 'us' : 'tw'); mktScramble(); }));

function appInit() {
  applyTheme(); renderMktSwitch();
  applyLayout(); syncToolbar(); renderIndBars(); renderDrawBar(); renderWatchTabs();
  draw.setItems(store.get('tw.draw.' + state.code, []));
  renderWatch(); renderSide(); renderFoot();
  refreshQuotes(); loadKline(); refreshSparks(); loadPaper();
  api('/api/list').then((l) => { state.list = l; l.forEach((s) => (state.listMap[s.code] = s)); renderWatch(); renderSide(); refreshQuotes(); }).catch(() => {});
  // 網址參數：#view=heatmap&mkt=us&code=2330（方便分享與截圖）
  const hp = new URLSearchParams(location.hash.slice(1));
  if (hp.get('mkt') && hp.get('mkt') !== state.mkt) switchMarket(hp.get('mkt'));
  // #watch=US.GOOGL,US.NVDA,Y.BTC-USD：用網址一次換掉目前市場的自選清單（會先詢問）
  if (hp.get('watch')) {
    const list = [...new Set(hp.get('watch').split(',').map((c) => c.trim()).filter(Boolean))];
    if (list.length && confirm(`要把${state.mkt === 'tw' ? '台股' : '美股'}自選清單換成這 ${list.length} 檔嗎？
${list.map(showCode).join('、')}`)) {
      state.watch = list; save('watch'); renderWatch(); renderSide(); refreshQuotes(); refreshSparks();
    }
    history.replaceState(null, '', location.pathname + location.search + '#' + [...hp].filter(([k]) => k !== 'watch').map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&'));
  }
  if (hp.get('code')) selectCode(hp.get('code'));
  if (hp.get('period') && PERIODS[hp.get('period')]) setPeriod(hp.get('period'));
  if (hp.get('view')) setTimeout(() => setView(hp.get('view')), 300);
  let sec = 0;
  setInterval(() => {
    sec += 1; const open = (state.mkt === 'tw' ? twOpen() : usActive()), every = state.settings.refresh || 5;
    if ((open && sec % every === 0) || sec % 60 === 0) refreshQuotes();
    // 美股：正在看的這一檔另外每 2 秒更新（台股證交所 MIS 本身約 5 秒更新一次，不用更快）
    else if (open && state.mkt === 'us' && sec % 2 === 0) refreshCurrent();
    if (sec % 5) return;
    if (open && sec % 60 === 0 && state.view === 'chart' && INTRADAY_LIVE.has(state.period)) loadKline(true);
    if (sec % (open ? 120 : 600) === 0) refreshSparks();
    if (sec % 30 === 0) loadPaper();
  }, 1000);
}
let curBusy = false;
async function refreshCurrent() {
  if (curBusy || quoteBusy || document.hidden) return; curBusy = true;
  try {
    const code = state.code, q = await api('/api/quote?codes=' + encodeURIComponent(code));
    if (code === state.code && q[code]) {
      Object.assign(state.quotes, q); renderSide();
      const row = document.querySelector(`#watchList .wrow[data-code="${CSS.escape(code)}"]`); if (row) renderWatch();
      if (state.view === 'chart') liveUpdate();
    }
  } catch {}
  curBusy = false;
}
// 我們自己的程式出錯時提示一下，方便回報（別的擴充功能的錯誤不管）
let lastErrToast = 0;
window.addEventListener('error', (e) => {
  if (!e.filename || !e.filename.startsWith(location.origin) || Date.now() - lastErrToast < 15000) return;
  lastErrToast = Date.now(); toast(`畫面發生錯誤：${e.message}（圖表異常可按右鍵 →「重設圖表」）`);
});

/* ---------- 全螢幕 ---------- */
// 整個 App 或只有圖表全螢幕；不支援全螢幕 API 的瀏覽器（例如 iPhone Safari）改用隱藏周邊面板的方式
function toggleFullscreen(el) {
  const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
  const B = document.body.classList;
  if (fsEl || B.contains('pseudo-fs')) {
    B.toggle('pseudo-fs', false); B.toggle('chart-fs', false);
    if (fsEl) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
    return;
  }
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (el !== document.documentElement) B.toggle('chart-fs', true);
  const pseudo = () => { B.toggle('pseudo-fs', true); document.body.scrollLeft = 0; document.documentElement.scrollLeft = 0; setTimeout(() => window.dispatchEvent(new Event('resize')), 60); };
  if (req) { const r = req.call(el); if (r && r.catch) r.catch(pseudo); } else pseudo();
}
['fullscreenchange', 'webkitfullscreenchange'].forEach((ev) => document.addEventListener(ev, () => {
  const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
  if (!on) document.body.classList.toggle('chart-fs', false);
  const chartOn = on && document.body.classList.contains('chart-fs');
  $('#chartFsBtn').textContent = chartOn ? '⤡ 離開全螢幕' : '⛶ 全螢幕';
  $$('[data-act="fullscreen"] span').forEach((x) => (x.textContent = on && !chartOn ? '離開' : '全螢幕'));
  setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
}));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('pseudo-fs')) toggleFullscreen(); });
$('#chartFsBtn').addEventListener('click', () => toggleFullscreen($('#viewChart')));
