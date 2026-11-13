/* 技術指標：計算函式與註冊表 */
const IND = (() => {
  const C = ['#f5a524', '#3d8bfd', '#d65bd6', '#26c6da', '#ef6c5a', '#7cb342'];
  const nul = (n) => new Array(n).fill(null);
  function sma(a, n) { const o = nul(a.length); let s = 0, k = 0; for (let i = 0; i < a.length; i++) { if (a[i] != null) { s += a[i]; k++; } if (i >= n && a[i - n] != null) { s -= a[i - n]; k--; } if (i >= n - 1 && k === n) o[i] = s / n; } return o; }
  function ema(a, n) { const o = nul(a.length), k = 2 / (n + 1); let p = null; for (let i = 0; i < a.length; i++) { if (a[i] == null) continue; p = p == null ? a[i] : a[i] * k + p * (1 - k); o[i] = p; } return o; }
  function smma(a, n) { const o = nul(a.length); let p = null, s = 0, c = 0; for (let i = 0; i < a.length; i++) { if (a[i] == null) continue; if (p == null) { s += a[i]; c++; if (c === n) { p = s / n; o[i] = p; } } else { p = (p * (n - 1) + a[i]) / n; o[i] = p; } } return o; }
  function std(a, n, mid) { return a.map((_, i) => { if (mid[i] == null) return null; let s = 0; for (let j = i - n + 1; j <= i; j++) s += (a[j] - mid[i]) ** 2; return Math.sqrt(s / n); }); }
  const hh = (b, i, n) => { let m = -Infinity; for (let j = Math.max(0, i - n + 1); j <= i; j++) m = Math.max(m, b[j].h); return m; };
  const ll = (b, i, n) => { let m = Infinity; for (let j = Math.max(0, i - n + 1); j <= i; j++) m = Math.min(m, b[j].l); return m; };
  const tr = (b) => b.map((x, i) => (i ? Math.max(x.h - x.l, Math.abs(x.h - b[i - 1].c), Math.abs(x.l - b[i - 1].c)) : x.h - x.l));

  // 主圖疊加
  const MAIN = {
    MA: { name: 'MA', params: [{ k: 'periods', label: '週期（逗號分隔）', v: '5,10,20,60,120,240' }],
      calc(b, p) { const c = b.map((x) => x.c); return { lines: String(p.periods).split(',').map((s) => +s).filter((n) => n > 0).map((n, i) => ({ name: 'MA' + n, color: C[i % 6], vals: sma(c, n) })) }; } },
    EMA: { name: 'EMA', params: [{ k: 'periods', label: '週期（逗號分隔）', v: '12,26,50' }],
      calc(b, p) { const c = b.map((x) => x.c); return { lines: String(p.periods).split(',').map((s) => +s).filter((n) => n > 0).map((n, i) => ({ name: 'EMA' + n, color: ['#ff9f43', '#54a0ff', '#ee5253', '#10ac84'][i % 4], vals: ema(c, n), dash: true })) }; } },
    BOLL: { name: 'BOLL', params: [{ k: 'n', label: '週期', v: 20 }, { k: 'm', label: '標準差倍數', v: 2 }],
      calc(b, p) { const c = b.map((x) => x.c), mid = sma(c, +p.n), sd = std(c, +p.n, mid);
        return { lines: [{ name: 'MID', color: '#f5a524', vals: mid }, { name: 'UP', color: '#d65bd6', vals: mid.map((v, i) => (v == null ? null : v + p.m * sd[i])) }, { name: 'DN', color: '#3d8bfd', vals: mid.map((v, i) => (v == null ? null : v - p.m * sd[i])) }] }; } },
    SAR: { name: 'SAR', params: [{ k: 'step', label: '加速因子', v: 0.02 }, { k: 'max', label: '最大值', v: 0.2 }],
      calc(b, p) {
        const o = nul(b.length); if (b.length < 3) return { dots: [] };
        let up = b[1].c >= b[0].c, af = +p.step, ep = up ? b[0].h : b[0].l, sar = up ? b[0].l : b[0].h;
        for (let i = 1; i < b.length; i++) {
          sar = sar + af * (ep - sar);
          if (up) { sar = Math.min(sar, b[i - 1].l, b[Math.max(0, i - 2)].l); if (b[i].l < sar) { up = false; sar = ep; ep = b[i].l; af = +p.step; } else if (b[i].h > ep) { ep = b[i].h; af = Math.min(af + +p.step, +p.max); } }
          else { sar = Math.max(sar, b[i - 1].h, b[Math.max(0, i - 2)].h); if (b[i].h > sar) { up = true; sar = ep; ep = b[i].h; af = +p.step; } else if (b[i].l < ep) { ep = b[i].l; af = Math.min(af + +p.step, +p.max); } }
          o[i] = sar;
        }
        return { lines: [{ name: 'SAR', color: '#c9ccd3', vals: o, dots: true }] };
      } },
    ENV: { name: '包絡線', params: [{ k: 'n', label: '週期', v: 20 }, { k: 'pct', label: '寬度%', v: 5 }],
      calc(b, p) { const m = sma(b.map((x) => x.c), +p.n); return { lines: [{ name: 'ENV', color: '#f5a524', vals: m }, { name: '+', color: '#26c6da', vals: m.map((v) => (v == null ? null : v * (1 + p.pct / 100))) }, { name: '-', color: '#26c6da', vals: m.map((v) => (v == null ? null : v * (1 - p.pct / 100))) }] }; } },
    DC: { name: '唐奇安', params: [{ k: 'n', label: '週期', v: 20 }],
      calc(b, p) { const n = +p.n, u = b.map((_, i) => (i >= n - 1 ? hh(b, i, n) : null)), d = b.map((_, i) => (i >= n - 1 ? ll(b, i, n) : null)); return { lines: [{ name: 'UP', color: '#d65bd6', vals: u }, { name: 'MID', color: '#f5a524', vals: u.map((v, i) => (v == null ? null : (v + d[i]) / 2)) }, { name: 'DN', color: '#3d8bfd', vals: d }] }; } },
  };

  // 副圖指標
  const SUB = {
    VOL: { name: 'VOL', params: [{ k: 'm1', label: '均量1', v: 5 }, { k: 'm2', label: '均量2', v: 10 }],
      calc(b, p, ctx) { const v = b.map((x) => x.v / ctx.volDiv); return { hist: v.map((x, i) => ({ v: x, up: b[i].c >= b[i].o })), volume: true, lines: [{ name: 'MA' + p.m1, color: C[0], vals: sma(v, +p.m1) }, { name: 'MA' + p.m2, color: C[1], vals: sma(v, +p.m2) }], label: ctx.volDiv > 1 ? '量(張)' : '量' }; } },
    MACD: { name: 'MACD', params: [{ k: 'f', label: '快線', v: 12 }, { k: 's', label: '慢線', v: 26 }, { k: 'sig', label: '訊號', v: 9 }],
      calc(b, p) { const c = b.map((x) => x.c), f = ema(c, +p.f), s = ema(c, +p.s), dif = c.map((_, i) => f[i] - s[i]), dea = ema(dif, +p.sig), h = dif.map((v, i) => (v - dea[i]) * 2);
        return { hist: h.map((v) => ({ v, up: v >= 0 })), lines: [{ name: 'DIF', color: C[0], vals: dif }, { name: 'DEA', color: C[1], vals: dea }], label: 'OSC' }; } },
    KD: { name: 'KD', params: [{ k: 'n', label: 'RSV週期', v: 9 }, { k: 'k', label: 'K平滑', v: 3 }, { k: 'd', label: 'D平滑', v: 3 }],
      calc(b, p) { const n = +p.n; let k = 50, d = 50; const K = [], D = [], J = [];
        b.forEach((x, i) => { const H = hh(b, i, n), L = ll(b, i, n), rsv = H === L ? 50 : ((x.c - L) / (H - L)) * 100; k = ((p.k - 1) * k + rsv) / p.k; d = ((p.d - 1) * d + k) / p.d; const ok = i >= n - 1; K.push(ok ? k : null); D.push(ok ? d : null); J.push(ok ? 3 * k - 2 * d : null); });
        return { lines: [{ name: 'K', color: C[0], vals: K }, { name: 'D', color: C[1], vals: D }, { name: 'J', color: C[2], vals: J }], guides: [80, 20] }; } },
    RSI: { name: 'RSI', params: [{ k: 'periods', label: '週期（逗號分隔）', v: '6,12,24' }],
      calc(b, p) { const c = b.map((x) => x.c);
        const one = (n) => { const up = c.map((v, i) => (i ? Math.max(v - c[i - 1], 0) : null)), dn = c.map((v, i) => (i ? Math.max(c[i - 1] - v, 0) : null)), su = smma(up, n), sd = smma(dn, n); return su.map((u, i) => (u == null ? null : sd[i] === 0 ? 100 : 100 - 100 / (1 + u / sd[i]))); };
        return { lines: String(p.periods).split(',').map((s) => +s).filter((n) => n > 0).map((n, i) => ({ name: 'RSI' + n, color: C[i], vals: one(n) })), guides: [70, 30] }; } },
    BIAS: { name: 'BIAS', params: [{ k: 'periods', label: '週期', v: '6,12,24' }],
      calc(b, p) { const c = b.map((x) => x.c); return { lines: String(p.periods).split(',').map((s) => +s).map((n, i) => { const m = sma(c, n); return { name: 'BIAS' + n, color: C[i], vals: m.map((v, j) => (v == null ? null : ((c[j] - v) / v) * 100)) }; }), guides: [0] }; } },
    WR: { name: 'W%R', params: [{ k: 'periods', label: '週期', v: '10,6' }],
      calc(b, p) { return { lines: String(p.periods).split(',').map((s) => +s).map((n, i) => ({ name: 'WR' + n, color: C[i], vals: b.map((x, j) => { if (j < n - 1) return null; const H = hh(b, j, n), L = ll(b, j, n); return H === L ? -50 : ((H - x.c) / (H - L)) * -100; }) })), guides: [-20, -80] }; } },
    CCI: { name: 'CCI', params: [{ k: 'n', label: '週期', v: 14 }],
      calc(b, p) { const n = +p.n, tp = b.map((x) => (x.h + x.l + x.c) / 3), m = sma(tp, n);
        return { lines: [{ name: 'CCI', color: C[0], vals: tp.map((v, i) => { if (m[i] == null) return null; let md = 0; for (let j = i - n + 1; j <= i; j++) md += Math.abs(tp[j] - m[i]); md /= n; return md ? (v - m[i]) / (0.015 * md) : 0; }) }], guides: [100, -100] }; } },
    DMI: { name: 'DMI', params: [{ k: 'n', label: '週期', v: 14 }, { k: 'adx', label: 'ADX平滑', v: 6 }],
      calc(b, p) { const n = +p.n, T = smma(tr(b), n);
        const pdm = b.map((x, i) => (i ? ((x.h - b[i - 1].h > b[i - 1].l - x.l && x.h - b[i - 1].h > 0) ? x.h - b[i - 1].h : 0) : 0));
        const mdm = b.map((x, i) => (i ? ((b[i - 1].l - x.l > x.h - b[i - 1].h && b[i - 1].l - x.l > 0) ? b[i - 1].l - x.l : 0) : 0));
        const P = smma(pdm, n), M = smma(mdm, n), pdi = P.map((v, i) => (v == null || !T[i] ? null : (v / T[i]) * 100)), mdi = M.map((v, i) => (v == null || !T[i] ? null : (v / T[i]) * 100));
        const dx = pdi.map((v, i) => (v == null || mdi[i] == null || v + mdi[i] === 0 ? null : (Math.abs(v - mdi[i]) / (v + mdi[i])) * 100));
        return { lines: [{ name: '+DI', color: C[0], vals: pdi }, { name: '-DI', color: C[1], vals: mdi }, { name: 'ADX', color: C[2], vals: smma(dx, +p.adx) }] }; } },
    OBV: { name: 'OBV', params: [{ k: 'm', label: '均線', v: 30 }],
      calc(b, p) { let s = 0; const o = b.map((x, i) => (s += i ? Math.sign(x.c - b[i - 1].c) * x.v : 0)); return { lines: [{ name: 'OBV', color: C[0], vals: o }, { name: 'MA' + p.m, color: C[1], vals: sma(o, +p.m) }], volume: true }; } },
    ATR: { name: 'ATR', params: [{ k: 'n', label: '週期', v: 14 }], calc(b, p) { return { lines: [{ name: 'ATR', color: C[0], vals: smma(tr(b), +p.n) }] }; } },
    ROC: { name: 'ROC', params: [{ k: 'n', label: '週期', v: 12 }, { k: 'm', label: '均線', v: 6 }],
      calc(b, p) { const n = +p.n, r = b.map((x, i) => (i >= n ? ((x.c - b[i - n].c) / b[i - n].c) * 100 : null)); return { lines: [{ name: 'ROC', color: C[0], vals: r }, { name: 'MA', color: C[1], vals: sma(r, +p.m) }], guides: [0] }; } },
    MTM: { name: 'MTM', params: [{ k: 'n', label: '週期', v: 12 }, { k: 'm', label: '均線', v: 6 }],
      calc(b, p) { const n = +p.n, r = b.map((x, i) => (i >= n ? x.c - b[i - n].c : null)); return { lines: [{ name: 'MTM', color: C[0], vals: r }, { name: 'MA', color: C[1], vals: sma(r, +p.m) }], guides: [0] }; } },
    PSY: { name: 'PSY', params: [{ k: 'n', label: '週期', v: 12 }],
      calc(b, p) { const n = +p.n, up = b.map((x, i) => (i && x.c > b[i - 1].c ? 1 : 0)); return { lines: [{ name: 'PSY', color: C[0], vals: b.map((_, i) => { if (i < n) return null; let s = 0; for (let j = i - n + 1; j <= i; j++) s += up[j]; return (s / n) * 100; }) }], guides: [75, 25] }; } },
    TRIX: { name: 'TRIX', params: [{ k: 'n', label: '週期', v: 12 }, { k: 'm', label: '均線', v: 9 }],
      calc(b, p) { const e = ema(ema(ema(b.map((x) => x.c), +p.n), +p.n), +p.n), t = e.map((v, i) => (i && e[i - 1] ? ((v - e[i - 1]) / e[i - 1]) * 100 : null)); return { lines: [{ name: 'TRIX', color: C[0], vals: t }, { name: 'MA', color: C[1], vals: sma(t, +p.m) }], guides: [0] }; } },
    DMA: { name: 'DMA', params: [{ k: 's', label: '短', v: 10 }, { k: 'l', label: '長', v: 50 }, { k: 'm', label: '均線', v: 10 }],
      calc(b, p) { const c = b.map((x) => x.c), s = sma(c, +p.s), l = sma(c, +p.l), d = s.map((v, i) => (v == null || l[i] == null ? null : v - l[i])); return { lines: [{ name: 'DDD', color: C[0], vals: d }, { name: 'AMA', color: C[1], vals: sma(d, +p.m) }], guides: [0] }; } },
    VR: { name: 'VR', params: [{ k: 'n', label: '週期', v: 26 }],
      calc(b, p) { const n = +p.n; return { lines: [{ name: 'VR', color: C[0], vals: b.map((_, i) => { if (i < n) return null; let u = 0, d = 0, f = 0; for (let j = i - n + 1; j <= i; j++) { const ch = b[j].c - b[j - 1].c; if (ch > 0) u += b[j].v; else if (ch < 0) d += b[j].v; else f += b[j].v; } return d + f / 2 ? ((u + f / 2) / (d + f / 2)) * 100 : null; }) }], guides: [150, 70] }; } },
  };

  // 參數（存在 localStorage）
  let params = {};
  try { params = JSON.parse(localStorage.getItem('tw.indParams') || '{}'); } catch {}
  function get(kind, key) {
    const def = (kind === 'main' ? MAIN : SUB)[key]; const o = {};
    def.params.forEach((x) => (o[x.k] = params[key]?.[x.k] ?? x.v)); return o;
  }
  function set(key, obj) { params[key] = obj; try { localStorage.setItem('tw.indParams', JSON.stringify(params)); } catch {} }
  function reset(key) { delete params[key]; try { localStorage.setItem('tw.indParams', JSON.stringify(params)); } catch {} }
  return { MAIN, SUB, get, set, reset, sma, ema };
})();
