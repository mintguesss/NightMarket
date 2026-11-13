/* 畫線工具：在主圖上覆蓋一層 canvas，座標以 (時間, 價格) 儲存，縮放/捲動時自動跟著圖表 */
const DRAW_TOOLS = [
  { id: 'cursor', name: '游標', pts: 0, icon: '<path d="M5 3l14 8-6 2-2 6z"/>' },
  { id: 'trend', name: '趨勢線', pts: 2, icon: '<path d="M4 20L20 4"/><circle cx="4" cy="20" r="2"/><circle cx="20" cy="4" r="2"/>' },
  { id: 'ray', name: '射線', pts: 2, icon: '<path d="M4 20L22 2"/><circle cx="4" cy="20" r="2"/>' },
  { id: 'ext', name: '延長線', pts: 2, icon: '<path d="M2 22L22 2"/><circle cx="9" cy="15" r="2"/><circle cx="15" cy="9" r="2"/>' },
  { id: 'hline', name: '水平線', pts: 1, icon: '<path d="M2 12h20"/>' },
  { id: 'hray', name: '水平射線', pts: 1, icon: '<path d="M6 12h16"/><circle cx="6" cy="12" r="2"/>' },
  { id: 'vline', name: '垂直線', pts: 1, icon: '<path d="M12 2v20"/>' },
  { id: 'channel', name: '平行通道', pts: 3, icon: '<path d="M3 16L17 4M7 20L21 8"/>' },
  { id: 'rect', name: '矩形', pts: 2, icon: '<rect x="4" y="6" width="16" height="12"/>' },
  { id: 'fib', name: '黃金分割', pts: 2, icon: '<path d="M3 5h18M3 10h18M3 14h18M3 19h18"/>' },
  { id: 'measure', name: '測量', pts: 2, icon: '<path d="M4 20V4M4 20h16M8 16l8-8"/>' },
  { id: 'text', name: '文字', pts: 1, icon: '<path d="M5 5h14M12 5v14"/>' },
];
const FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618];
const DRAW_COLORS = ['#f5a524', '#3d8bfd', '#f0444f', '#17b978', '#d65bd6', '#e8eaf0'];

class Drawings {
  constructor(pane, chart, api) {
    this.pane = pane; this.chart = chart; this.api = api; // api: { series(), bars(), off(), save(items), magnet() }
    this.items = []; this.tool = 'cursor'; this.temp = null; this.sel = -1; this.drag = null; this.hidden = false; this.color = DRAW_COLORS[0];
    const cv = (this.cv = document.createElement('canvas'));
    cv.className = 'draw-layer'; pane.appendChild(cv);
    this.ctx = cv.getContext('2d');
    new ResizeObserver(() => this.resize()).observe(pane);
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => this.redraw());
    chart.subscribeCrosshairMove(() => this.redraw());
    const cap = { capture: true };
    ['mousedown', 'pointerdown'].forEach((t) => pane.addEventListener(t, (e) => this.down(e), cap));
    window.addEventListener('mousemove', (e) => this.move(e));
    window.addEventListener('mouseup', (e) => this.up(e));
    pane.addEventListener('dblclick', (e) => this.dbl(e), cap);
    document.addEventListener('keydown', (e) => {
      if (this.sel < 0 || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { this.removeSelected(); e.preventDefault(); }
      if (e.key === 'Escape') { this.sel = -1; this.redraw(); }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.temp) { this.temp = null; this.setTool('cursor'); } });
    this.resize();
  }
  resize() {
    const r = this.pane.getBoundingClientRect(), d = devicePixelRatio || 1;
    this.w = r.width; this.h = r.height; this.cv.width = r.width * d; this.cv.height = r.height * d;
    this.ctx.setTransform(d, 0, 0, d, 0, 0); this.redraw();
  }
  setItems(items) { this.items = items || []; this.sel = -1; this.temp = null; this.redraw(); }
  setTool(t) {
    this.tool = t; this.temp = null;
    const active = t !== 'cursor';
    this.cv.style.pointerEvents = active ? 'auto' : 'none';
    this.cv.style.cursor = active ? 'crosshair' : 'default';
    this.chart.applyOptions({ handleScroll: active ? false : { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false }, handleScale: !active });
    this.onTool?.(t); this.redraw();
  }
  removeSelected() { if (this.sel < 0) return; this.items.splice(this.sel, 1); this.sel = -1; this.commit(); }
  clear() { this.items = []; this.sel = -1; this.commit(); }
  commit() { this.api.save(this.items); this.redraw(); }

  /* ---- 座標轉換 ---- */
  times() { const off = this.api.off(); return this.api.bars().map((b) => b.t + off); }
  step(ts) { return ts.length > 1 ? (ts[ts.length - 1] - ts[0]) / (ts.length - 1) : 60; }
  logicalOf(time) {
    const ts = this.times(); const n = ts.length; if (!n) return null;
    if (time <= ts[0]) return (time - ts[0]) / this.step(ts);
    if (time >= ts[n - 1]) return n - 1 + (time - ts[n - 1]) / this.step(ts);
    let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ts[m] <= time) lo = m; else hi = m; }
    return lo + (time - ts[lo]) / (ts[hi] - ts[lo]);
  }
  timeOf(l) {
    const ts = this.times(); const n = ts.length; if (!n) return null;
    if (l <= 0) return ts[0] + l * this.step(ts);
    if (l >= n - 1) return ts[n - 1] + (l - n + 1) * this.step(ts);
    const i = Math.floor(l); return ts[i] + (l - i) * (ts[i + 1] - ts[i]);
  }
  xy(p) {
    const s = this.api.series(); if (!s) return null;
    const l = this.logicalOf(p.time); if (l == null) return null;
    const x = this.chart.timeScale().logicalToCoordinate(l), y = s.priceToCoordinate(p.price);
    return x == null || y == null ? null : { x, y };
  }
  pt(e) {
    const r = this.pane.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, s = this.api.series();
    if (!s) return null;
    let l = this.chart.timeScale().coordinateToLogical(x), price = s.coordinateToPrice(y);
    if (l == null || price == null) return null;
    if (this.api.magnet()) {
      const b = this.api.bars()[Math.round(l)];
      if (b) {
        l = Math.round(l);
        let best = null, bd = 1e9;
        [b.o, b.h, b.l, b.c].forEach((v) => { const d = Math.abs(s.priceToCoordinate(v) - y); if (d < bd) { bd = d; best = v; } });
        if (bd < 30) price = best;
      }
    }
    return { time: this.timeOf(l), price, x, y };
  }

  /* ---- 滑鼠事件 ---- */
  down(e) {
    if (e.button !== 0 || this.hidden) return;
    if (this.tool !== 'cursor') {
      if (e.type === 'pointerdown') return; // 以 mousedown 處理
      e.stopPropagation(); e.preventDefault();
      const p = this.pt(e); if (!p) return;
      const def = DRAW_TOOLS.find((t) => t.id === this.tool);
      if (!this.temp) this.temp = { type: this.tool, color: this.color, points: [p], clicks: 0 };
      else this.temp.points[this.temp.points.length - 1] = p;
      this.temp.clicks++;
      if (this.temp.clicks >= def.pts) {
        const it = { type: this.temp.type, color: this.temp.color, points: this.temp.points.slice(0, def.pts).map(({ time, price }) => ({ time, price })) };
        if (it.type === 'text') {
          const t = prompt('輸入文字：', ''); if (!t) { this.temp = null; this.redraw(); return; }
          it.text = t;
        }
        this.items.push(it); this.sel = this.items.length - 1; this.temp = null; this.commit(); this.setTool('cursor');
      } else this.temp.points.push({ ...p }); // 跟著滑鼠移動的下一個點
      this.redraw(); return;
    }
    // 游標模式：命中測試（pointerdown 與 mousedown 都會進來，第二次直接擋掉）
    if (this.drag) { e.stopPropagation(); return; }
    const r = this.pane.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    if (this.sel >= 0) {
      const it = this.items[this.sel];
      const hi = it.points.findIndex((p) => { const q = this.xy(p); return q && Math.hypot(q.x - mx, q.y - my) < 8; });
      if (hi >= 0) { this.startDrag(e, { idx: this.sel, handle: hi }); return; }
    }
    const hit = this.hitTest(mx, my);
    if (hit >= 0) { this.sel = hit; this.startDrag(e, { idx: hit, handle: -1, start: this.pt(e), orig: this.items[hit].points.map((p) => ({ ...p })) }); this.redraw(); }
    else if (this.sel >= 0) { this.sel = -1; this.redraw(); }
  }
  startDrag(e, d) {
    e.stopPropagation(); // 不讓圖表收到，避免拖曳時圖表跟著捲動
    this.drag = d; this.moved = false;
    this.chart.applyOptions({ handleScroll: false, handleScale: false });
  }
  move(e) {
    if (this.temp) { const p = this.pt(e); if (p) { this.temp.points[this.temp.points.length - 1] = p; this.redraw(); } return; }
    if (!this.drag) return;
    const p = this.pt(e); if (!p) return;
    const it = this.items[this.drag.idx]; this.moved = true;
    if (this.drag.handle >= 0) it.points[this.drag.handle] = { time: p.time, price: p.price };
    else {
      const s = this.drag.start, dl = this.logicalOf(p.time) - this.logicalOf(s.time), dp = p.price - s.price;
      it.points = this.drag.orig.map((q) => ({ time: this.timeOf(this.logicalOf(q.time) + dl), price: q.price + dp }));
    }
    this.redraw();
  }
  up() {
    if (!this.drag) return;
    this.drag = null; this.chart.applyOptions({ handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false }, handleScale: true });
    if (this.moved) this.commit();
  }
  dbl(e) {
    if (this.tool !== 'cursor' || this.sel < 0) return;
    const it = this.items[this.sel];
    if (it.type === 'text') { const t = prompt('修改文字：', it.text); if (t != null) { it.text = t; this.commit(); } e.stopPropagation(); }
  }
  hitTest(mx, my) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const segs = this.segments(this.items[i]);
      for (const [a, b] of segs) if (distSeg(mx, my, a, b) < 6) return i;
      const it = this.items[i];
      if (it.type === 'text') { const q = this.xy(it.points[0]); if (q && Math.abs(mx - q.x - 30) < 40 && Math.abs(my - q.y + 6) < 12) return i; }
    }
    return -1;
  }
  /* 每種圖形轉成線段（命中測試與繪製共用） */
  segments(it) {
    const P = it.points.map((p) => this.xy(p)); if (P.some((p) => !p)) return [];
    const W = this.w, H = this.h, [a, b, c] = P;
    const extend = (p, q, both) => {
      const dx = q.x - p.x, dy = q.y - p.y; if (!dx && !dy) return [p, q];
      const t1 = dx ? (dx > 0 ? (W - p.x) / dx : -p.x / dx) : (dy > 0 ? (H - p.y) / dy : -p.y / dy);
      const end = { x: p.x + dx * Math.min(t1, 1e4), y: p.y + dy * Math.min(t1, 1e4) };
      if (!both) return [p, end];
      const t0 = dx ? (dx > 0 ? -p.x / dx : (W - p.x) / dx) : 0;
      return [{ x: p.x + dx * t0, y: p.y + dy * t0 }, end];
    };
    switch (it.type) {
      case 'trend': case 'measure': return [[a, b]];
      case 'ray': return [extend(a, b, false)];
      case 'ext': return [extend(a, b, true)];
      case 'hline': return [[{ x: 0, y: a.y }, { x: W, y: a.y }]];
      case 'hray': return [[a, { x: W, y: a.y }]];
      case 'vline': return [[{ x: a.x, y: 0 }, { x: a.x, y: H }]];
      case 'rect': return [[a, { x: b.x, y: a.y }], [{ x: b.x, y: a.y }, b], [b, { x: a.x, y: b.y }], [{ x: a.x, y: b.y }, a]];
      case 'channel': { if (!c) return [[a, b]]; const dy = c.y - (a.y + ((b.y - a.y) * (c.x - a.x)) / ((b.x - a.x) || 1)); return [[a, b], [{ x: a.x, y: a.y + dy }, { x: b.x, y: b.y + dy }]]; }
      case 'fib': return FIB.map((f) => { const y = b.y + (a.y - b.y) * f; return [{ x: Math.min(a.x, b.x), y }, { x: W, y }]; });
      default: return [];
    }
  }
  redraw() { // 等圖表本身畫完（同一個 frame 之後）再畫，避免座標還沒更新
    cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(() => this.paintAll());
  }
  paintAll() {
    const g = this.ctx; if (!g) return;
    g.clearRect(0, 0, this.w, this.h);
    if (this.hidden) return;
    const all = this.temp ? [...this.items, this.temp] : this.items;
    all.forEach((it, i) => this.paint(g, it, i === this.sel && it !== this.temp));
  }
  paint(g, it, selected) {
    const P = it.points.map((p) => this.xy(p)); if (P.some((p) => !p)) return;
    const col = it.color || '#f5a524';
    g.save(); g.strokeStyle = col; g.fillStyle = col; g.lineWidth = selected ? 2 : 1.3; g.font = '11px Segoe UI, Microsoft JhengHei';
    const segs = this.segments(it);
    const s = this.api.series();
    if (it.type === 'rect' || it.type === 'measure') {
      const [a, b] = P; g.globalAlpha = 0.12; g.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); g.globalAlpha = 1;
      if (it.type === 'measure') {
        const p0 = it.points[0].price, p1 = it.points[1].price, d = p1 - p0, bars = Math.round(this.logicalOf(it.points[1].time) - this.logicalOf(it.points[0].time));
        g.fillStyle = d >= 0 ? '#f0444f' : '#17b978'; g.globalAlpha = 0.18; g.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); g.globalAlpha = 1;
        const txt = `${d >= 0 ? '+' : ''}${d.toFixed(2)} (${d >= 0 ? '+' : ''}${((d / p0) * 100).toFixed(2)}%)  ${bars} 根`;
        label(g, txt, (a.x + b.x) / 2, Math.min(a.y, b.y) - 8, d >= 0 ? '#f0444f' : '#17b978');
        g.strokeStyle = d >= 0 ? '#f0444f' : '#17b978';
      }
    }
    if (it.type === 'channel' && segs.length === 2) {
      const [[a1, b1], [a2, b2]] = segs; g.globalAlpha = 0.08; g.beginPath(); g.moveTo(a1.x, a1.y); g.lineTo(b1.x, b1.y); g.lineTo(b2.x, b2.y); g.lineTo(a2.x, a2.y); g.fill(); g.globalAlpha = 1;
    }
    segs.forEach(([a, b], k) => {
      if (it.type === 'fib') g.globalAlpha = FIB[k] === 0.5 || FIB[k] === 0.618 ? 1 : 0.65;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.globalAlpha = 1;
    });
    if (it.type === 'fib' && s) {
      const pa = it.points[0].price, pb = it.points[1].price;
      FIB.forEach((f, k) => { const y = segs[k][0].y, pr = pb + (pa - pb) * f; g.fillText(`${(f * 100).toFixed(1)}%  ${pr.toFixed(2)}`, segs[k][0].x + 4, y - 3); });
    }
    if (it.type === 'hline' || it.type === 'hray') label(g, it.points[0].price.toFixed(2), this.w - 40, P[0].y - 9, col);
    if (it.type === 'text') { g.font = '13px Microsoft JhengHei, sans-serif'; g.fillText(it.text || '', P[0].x, P[0].y); }
    if (selected || it === this.temp) P.forEach((p) => { g.beginPath(); g.arc(p.x, p.y, 4, 0, 7); g.fillStyle = '#0f1116'; g.fill(); g.strokeStyle = col; g.lineWidth = 1.5; g.stroke(); });
    g.restore();
  }
}
function distSeg(px, py, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / L)) : 0;
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}
function label(g, txt, x, y, col) {
  g.save(); const w = g.measureText(txt).width + 10;
  g.fillStyle = col; g.globalAlpha = 0.9; g.fillRect(x - w / 2, y - 9, w, 17); g.globalAlpha = 1;
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, x, y); g.restore();
}
