/* 右側欄：最右邊的圖示選單切換「行情／資訊／數據／期權／籌碼／下單／筆記」 */
(() => {
  const P = { quote: '#spQuote', info: '#spInfo', data: '#spData', opt: '#spOpt', chips: '#spChips', memo: '#spMemo' };
  let cur = store.get('tw.sidePanel', 'quote');
  if (cur === 'trade') cur = 'quote';
  const infoCache = {}; // code -> /api/info
  let infoTab = 'news', chipsBars = { code: null, bars: [], shares: null }, chipsIdx = null;

  function isIdx(c) { return c === 't00' || isFut(c) || c.includes('^') || c.startsWith('Y.') || c.startsWith('FX.') || c.startsWith('OPT.'); }

  function show(name) {
    cur = name; store.set('tw.sidePanel', name);
    Object.entries(P).forEach(([k, sel]) => ($(sel).hidden = k !== name));
    $$('#rail [data-sp]').forEach((b) => b.classList.toggle('active', b.dataset.sp === name || (name === 'quote' && b.dataset.sp === 'trade' && state.sideTab === 'trade')));
    refresh();
  }
  function refresh() {
    if (state.layout.noRight) return;
    if (cur === 'info') renderInfo();
    if (cur === 'data') renderData();
    if (cur === 'opt') loadOpt(true);
    if (cur === 'chips') loadChips();
    if (cur === 'memo') renderMemo();
  }
  window.sidePanelRefresh = refresh;

  $('#rail').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sp]'); if (!b) return;
    const want = b.dataset.sp === 'trade' ? 'quote' : b.dataset.sp;
    const activeBtn = b.classList.contains('active');
    if (activeBtn && !state.layout.noRight) { state.layout.noRight = true; applyLayout(); return; } // 再點一次收合
    if (state.layout.noRight) { state.layout.noRight = false; applyLayout(); }
    show(want);
    if (b.dataset.sp === 'trade') switchSideTab('trade');
    else if (want === 'quote' && state.sideTab === 'trade') switchSideTab(state.mkt === 'tw' ? 'book' : 'trade');
    syncRail();
  });
  function syncRail() {
    const qb = $('#rail [data-sp="quote"]'); if (qb) qb.hidden = !(isTW(state.code) || state.code === 't00'); // 只有台股有五檔／法人，其他市場和「下單」重複
    $$('#rail [data-sp]').forEach((b) => {
      const on = !state.layout.noRight && (b.dataset.sp === 'trade' ? cur === 'quote' && state.sideTab === 'trade' : b.dataset.sp === 'quote' ? cur === 'quote' && state.sideTab !== 'trade' : b.dataset.sp === cur);
      b.classList.toggle('active', on);
    });
  }
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-spclose]')) { state.layout.noRight = true; applyLayout(); syncRail(); }
    if (e.target.closest('[data-collapse], .rz-btn, #sideTabs button')) setTimeout(syncRail, 0);
  });

  /* ---------- 資訊 ---------- */
  async function getInfo(code) {
    if (!infoCache[code]) infoCache[code] = api('/api/info?code=' + encodeURIComponent(code) + TR).catch((e) => { delete infoCache[code]; throw e; });
    return infoCache[code];
  }
  async function renderInfo() {
    const code = state.code, tw = isTW(code);
    $('#spInfoName').textContent = nameOf(code);
    const tabs = tw ? [['news', '新聞'], ['ann', '公告'], ['rev', '營收']] : [['news', '新聞'], ['rating', '評級'], ['events', '日程']];
    if (!tabs.some(([k]) => k === infoTab)) infoTab = 'news';
    $('#spInfoTabs').innerHTML = tabs.map(([k, n]) => `<button data-it="${k}" class="${k === infoTab ? 'active' : ''}">${n}</button>`).join('');
    const body = $('#spInfoBody');
    if (isIdx(code)) {
      body.innerHTML = '<div class="empty">指數沒有個股資訊</div>';
      if (infoTab === 'news') { const m = await api('/api/news').catch(() => []); if (state.code === code) body.innerHTML = m.filter((n) => n.cat === (state.mkt === 'tw' ? '台股' : '國際股')).slice(0, 40).map(newsItem).join(''); }
      return;
    }
    body.innerHTML = '<div class="empty">載入中…</div>';
    let d; try { d = await getInfo(code); } catch (e) { body.innerHTML = `<div class="empty">載入失敗：${esc(e.message)}</div>`; return; }
    if (state.code !== code || cur !== 'info') return;
    if (infoTab === 'news') body.innerHTML = (d.news || []).length ? d.news.map(newsItem).join('') : '<div class="empty">沒有相關新聞</div>';
    if (infoTab === 'ann') body.innerHTML = (d.announcements || []).length ? d.announcements.map((a) => `<details class="ann sp"><summary><span class="t">${esc(a.title)}</span><span class="m">${esc(a.date)} ${a.time.slice(0, 2)}:${a.time.slice(2, 4)}・重大訊息</span></summary><pre>${esc(a.desc)}</pre></details>`).join('') : '<div class="empty">最近幾天沒有重大訊息<br><span class="small">（官方開放資料只保留近幾日）</span></div>';
    if (infoTab === 'rev') {
      const r = d.revenue;
      body.innerHTML = r ? `<div class="sp-pad"><div class="sp-k">${esc(r.month)} 營收</div><div class="sp-big num">${fmtVol(r.cur * 1000)}</div>
        <div class="stat-grid" style="margin-top:12px"><div><span>月增率</span><b class="num ${cls(r.mom)}">${sign(r.mom)}${fmtP(r.mom)}%</b></div><div><span>年增率</span><b class="num ${cls(r.yoy)}">${sign(r.yoy)}${fmtP(r.yoy)}%</b></div>
        <div><span>今年累計</span><b class="num">${fmtVol(r.ytd * 1000)}</b></div><div><span>累計年增</span><b class="num ${cls(r.ytdYoy)}">${sign(r.ytdYoy)}${fmtP(r.ytdYoy)}%</b></div></div>
        ${r.note && r.note !== '-' ? `<div class="hint">公司說明：${esc(r.note)}</div>` : ''}
        ${d.valuation ? `<div class="stat-grid" style="margin-top:14px"><div><span>本益比</span><b class="num">${fmtP(d.valuation.pe)}</b></div><div><span>殖利率</span><b class="num">${fmtP(d.valuation.yield)}%</b></div><div><span>股價淨值比</span><b class="num">${fmtP(d.valuation.pb)}</b></div></div>` : ''}</div>` : '<div class="empty">沒有營收資料（ETF 沒有月營收）</div>';
    }
    if (infoTab === 'rating') {
      const a = d.analyst || {}, REC = { strong_buy: '強力買進', buy: '買進', hold: '持有', underperform: '表現落後', sell: '賣出' };
      body.innerHTML = a.target ? (() => {
        const up = ((a.target - a.price) / a.price) * 100, pos = a.high > a.low ? Math.min(100, Math.max(0, ((a.price - a.low) / (a.high - a.low)) * 100)) : 50;
        return `<div class="sp-pad"><div class="sp-k">分析師共識（${a.count ?? '-'} 位）</div><div class="sp-big">${esc(REC[a.rec] || a.rec || '-')}</div>
          <div class="stat-grid" style="margin-top:12px"><div><span>平均目標價</span><b class="num">${fmtP(a.target)}</b></div><div><span>距現價</span><b class="num ${cls(up)}">${sign(up)}${up.toFixed(1)}%</b></div><div><span>最高</span><b class="num">${fmtP(a.high)}</b></div><div><span>最低</span><b class="num">${fmtP(a.low)}</b></div></div>
          <div class="trange"><span class="num">${fmtP(a.low)}</span><div class="trange-bar"><i style="left:${pos}%"></i></div><span class="num">${fmtP(a.high)}</span></div>
          <div class="hint">資料來源 Yahoo Finance。白點為現價位置。</div></div>`;
      })() : '<div class="empty">沒有分析師評級</div>';
    }
    if (infoTab === 'events') body.innerHTML = `<div class="sp-pad">${kvTable(d.events || [])}${(d.eps || []).length ? `<div class="sub-h">每季 EPS</div>${ibars(d.eps.map((e) => ({ label: e.q, a: e.actual, b: e.estimate })), (v) => fmtP(v), { legend: '<i class="pos"></i>實際　<i class="est"></i>預估' })}` : ''}</div>`;
  }
  $('#spInfoTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-it]'); if (b) { infoTab = b.dataset.it; renderInfo(); } });
  $('#spInfoFull').addEventListener('click', () => setView('news'));

  /* ---------- 數據（原本左邊的資訊頁：概覽／財務／股利／公司） ---------- */
  let dataTab = 'ov';
  async function renderData() {
    const code = state.code, body = $('#spDataBody');
    $('#spDataName').textContent = nameOf(code);
    if (isIdx(code)) { $('#spDataTabs').innerHTML = ''; body.innerHTML = '<div class="empty">指數沒有個股數據，請先選一檔個股</div>'; return; }
    if (!body.dataset.code || body.dataset.code !== code) body.innerHTML = '<div class="empty">載入中…</div>';
    let d; try { d = await getInfo(code); } catch (e) { body.innerHTML = `<div class="empty">載入失敗：${esc(e.message)}</div>`; return; }
    if (state.code !== code || cur !== 'data') return;
    const { P: sec, TABS } = infoSections(d);
    if (!TABS.some(([k]) => k === dataTab)) dataTab = 'ov';
    $('#spDataTabs').innerHTML = TABS.map(([k, n]) => `<button data-dt="${k}" class="${k === dataTab ? 'active' : ''}">${n}</button>`).join('');
    body.dataset.code = code;
    body.innerHTML = `<div class="sp-cards">${sec[dataTab].join('')}</div>`;
  }
  $('#spDataTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-dt]'); if (b) { dataTab = b.dataset.dt; renderData(); } });
  $('#spDataFull').addEventListener('click', () => setView('news'));

  /* ---------- 期權（精簡 T 字報價，點價格可模擬下單） ---------- */
  const opt = { und: null, exp: {}, data: null, t: 0 };
  function optUnderlying(code) {
    if (isTW(code) || code === 't00' || isFut(code)) return 'TXO';
    if (isUS(code) && !code.includes('^')) return 'US.' + showCode(code);
    return null;
  }
  async function loadOpt(first) {
    const und = optUnderlying(state.code), body = $('#spOptBody');
    $('#spOptName').textContent = und === 'TXO' ? '台指選擇權' : und ? showCode(state.code) : '';
    if (!und) { body.innerHTML = '<div class="empty">這檔沒有期權報價<br><span class="small">台股顯示台指選擇權；美股個股與 ETF 顯示自己的期權</span></div>'; $('#spOptExp').innerHTML = ''; $('#spOptSpot').textContent = ''; return; }
    if (und !== opt.und) { opt.und = und; opt.data = null; body.innerHTML = '<div class="empty">載入期權報價…</div>'; first = true; }
    const exp = opt.exp[und] || '';
    try {
      const d = await api(`/api/options?u=${encodeURIComponent(und)}${exp ? '&exp=' + encodeURIComponent(exp) : ''}`);
      if (opt.und !== und || cur !== 'opt') return;
      opt.data = d; opt.t = Date.now(); if (!exp && d.expiry) opt.exp[und] = d.expiry;
      renderOpt(first);
    } catch (e) { if (opt.und === und) body.innerHTML = `<div class="empty">載入失敗：${esc(e.message)}</div>`; }
  }
  function renderOpt(scroll) {
    const d = opt.data, tw = opt.und === 'TXO'; if (!d) return;
    $('#spOptExp').innerHTML = (d.expiries || []).map((x) => `<option value="${esc(x.id)}" ${x.id === d.expiry ? 'selected' : ''}>${esc(x.label)}</option>`).join('');
    $('#spOptSpot').innerHTML = `標的 <b class="num">${fmtP(d.spot, tw ? 0 : 2)}</b>`;
    const rows = d.rows || [], spot = d.spot;
    if (!rows.length) { $('#spOptBody').innerHTML = '<div class="empty">沒有資料</div>'; return; }
    const atmI = rows.reduce((bi, r, i) => (Math.abs(r.strike - spot) < Math.abs(rows[bi].strike - spot) ? i : bi), 0);
    const view = rows.slice(Math.max(0, atmI - 10), atmI + 11), dp = tw ? 0 : 2;
    const expLbl = $('#spOptExp').selectedOptions[0]?.text || d.expiry || '';
    const cell = (x, r, side) => {
      if (!x || !x.id) return '<td></td><td></td>';
      const chg = x.chg ?? (x.last && x.ref ? x.last - x.ref : null), oc = (tw ? 'OPT.TW:' : 'OPT.US:') + x.id;
      const lbl = `${tw ? '台指選 ' + expLbl : d.underlying.replace('US.', '') + ' ' + expLbl} ${fmtP(r.strike, dp)} ${side === 'call' ? (tw ? '買權' : 'Call') : (tw ? '賣權' : 'Put')}`;
      const px = `<td class="num oc ${cls(chg)}" data-oc="${esc(oc)}" data-ol="${esc(lbl)}" data-op="${x.ask || x.last || ''}" data-bid="${x.bid ?? ''}" data-ask="${x.ask ?? ''}" title="買 ${fmtP(x.bid)}／賣 ${fmtP(x.ask)}　未平倉 ${x.oi ?? '-'}">${x.last ? fmtP(x.last) : '<span class="muted">-</span>'}</td>`;
      const ch = `<td class="num small ${cls(chg)}">${chg ? sign(chg) + fmtP(chg) : ''}</td>`;
      return side === 'call' ? ch + px : px + ch;
    };
    $('#spOptBody').innerHTML = `<table class="tbl otbl sotbl"><thead><tr><th colspan="2" class="c cs">買權</th><th class="c">履約價</th><th colspan="2" class="c ps">賣權</th></tr></thead><tbody>
      ${view.map((r) => `<tr class="${rows[atmI].strike === r.strike ? 'atm' : ''}">${cell(r.call, r, 'call')}<td class="k num">${fmtP(r.strike, dp)}</td>${cell(r.put, r, 'put')}</tr>`).join('')}</tbody></table>
      <div class="hint" style="padding:8px 12px">${tw ? '台指選擇權（期交所 MIS 即時）' : 'Yahoo Finance，可能延遲 15 分鐘'}。點成交價可模擬下單。</div>`;
    if (scroll) setTimeout(() => $('#spOptBody tr.atm')?.scrollIntoView({ block: 'center' }), 30);
  }
  $('#spOptExp').addEventListener('change', (e) => { if (opt.und) { opt.exp[opt.und] = e.target.value; $('#spOptBody').innerHTML = '<div class="empty">載入期權報價…</div>'; loadOpt(true); } });
  $('#spOptBody').addEventListener('click', (e) => { const td = e.target.closest('[data-oc]'); if (td) optOrder(td.dataset.oc, td.dataset.ol, 'buy', +td.dataset.op || null, +td.dataset.bid || null, +td.dataset.ask || null); });
  $('#spOptFull').addEventListener('click', () => { if (opt.und && opt.und !== 'TXO') { optState.sym = opt.und.replace('US.', ''); optState.exp.us = ''; } setView('options'); });
  setInterval(() => { if (cur === 'opt' && !state.layout.noRight && !document.hidden && Date.now() - opt.t > 15000) loadOpt(false); }, 5000);

  /* ---------- 籌碼分布（成本分布估算） ---------- */
  async function loadChips() {
    const code = state.code;
    $('#spChipsName').textContent = nameOf(code);
    if (isIdx(code)) { $('#chipsStats').innerHTML = '<div class="empty">指數沒有籌碼分布</div>'; clearCanvas(); return; }
    if (chipsBars.code !== code) {
      $('#chipsStats').innerHTML = '<div class="empty">計算中…</div>'; clearCanvas();
      try {
        const [k, info] = await Promise.all([api(`/api/kline?code=${encodeURIComponent(code)}&interval=1d&range=2y`), getInfo(code).catch(() => ({}))]);
        if (state.code !== code) return;
        chipsBars = { code, bars: k.bars, shares: info.shares || null };
      } catch (e) { $('#chipsStats').innerHTML = `<div class="empty">載入失敗：${esc(e.message)}</div>`; return; }
    }
    drawChips(chipsIdx);
  }
  function clearCanvas() { const c = $('#chipsCanvas'); c.getContext('2d').clearRect(0, 0, c.width, c.height); }
  function computeChips(bars, end) {
    const N = 160, from = Math.max(0, end - 250), win = bars.slice(from, end + 1);
    if (win.length < 5) return null;
    let lo = Math.min(...win.map((b) => b.l)), hi = Math.max(...win.map((b) => b.h)); if (hi <= lo) hi = lo * 1.01 + 0.01;
    const step = (hi - lo) / N, chips = new Float64Array(N);
    const avgV = win.reduce((s, b) => s + b.v, 0) / win.length || 1, shares = chipsBars.shares;
    for (const b of win) {
      // 換手率：有總股數就用實際換手率，沒有就用成交量相對均量估算
      const t = Math.min(1, shares ? b.v / shares : (b.v / avgV) * 0.02);
      for (let i = 0; i < N; i++) chips[i] *= 1 - t;
      const peak = (b.h + b.l + b.c) / 3, a = Math.floor((b.l - lo) / step), z = Math.min(N - 1, Math.floor((b.h - lo) / step));
      let wsum = 0; const w = [];
      for (let i = a; i <= z; i++) { const p = lo + (i + 0.5) * step, x = p <= peak ? (p - b.l) / (peak - b.l || 1) : (b.h - p) / (b.h - peak || 1); w.push(Math.max(0.05, x)); wsum += w[w.length - 1]; }
      for (let i = a, j = 0; i <= z; i++, j++) chips[i] += (t * w[j]) / (wsum || 1);
    }
    const total = chips.reduce((s, v) => s + v, 0) || 1, price = bars[end].c;
    let below = 0, avg = 0; for (let i = 0; i < N; i++) { const p = lo + (i + 0.5) * step; avg += p * chips[i]; if (p <= price) below += chips[i]; }
    const q = (r) => { let acc = 0; for (let i = 0; i < N; i++) { acc += chips[i] / total; if (acc >= r) return lo + (i + 0.5) * step; } return hi; };
    const r90 = [q(0.05), q(0.95)], r70 = [q(0.15), q(0.85)];
    return { N, lo, hi, step, chips, total, price, profit: below / total, avg: avg / total, r90, r70, c90: (r90[1] - r90[0]) / (r90[1] + r90[0]), c70: (r70[1] - r70[0]) / (r70[1] + r70[0]), date: bars[end].t };
  }
  function drawChips(idx) {
    const bars = chipsBars.bars; if (!bars.length) return;
    const end = idx == null ? bars.length - 1 : Math.min(idx, bars.length - 1), r = computeChips(bars, end);
    if (!r) { $('#chipsStats').innerHTML = '<div class="empty">資料不足</div>'; return; }
    const cv = $('#chipsCanvas'), W = cv.parentElement.clientWidth - 28, H = 300, dpr = devicePixelRatio || 1;
    cv.style.width = W + 'px'; cv.style.height = H + 'px'; cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const axis = 54, mx = Math.max(...r.chips), y = (p) => H - 6 - ((p - r.lo) / (r.hi - r.lo)) * (H - 12), bh = Math.max(1, (H - 12) / r.N);
    for (let i = 0; i < r.N; i++) {
      const p = r.lo + (i + 0.5) * r.step, w = (r.chips[i] / mx) * (W - axis - 6);
      g.fillStyle = p <= r.price ? UP + 'cc' : '#3d8bfdcc';
      g.fillRect(0, y(p) - bh / 2, w, Math.max(1, bh - 0.5));
    }
    const line = (p, col, label, dash) => { const yy = y(p); g.strokeStyle = col; g.setLineDash(dash ? [4, 3] : []); g.beginPath(); g.moveTo(0, yy); g.lineTo(W - axis, yy); g.stroke(); g.setLineDash([]); g.fillStyle = col; g.fillRect(W - axis + 2, yy - 8, axis - 2, 16); g.fillStyle = '#fff'; g.font = '11px Segoe UI'; g.fillText(label, W - axis + 5, yy + 4); };
    g.fillStyle = TXT; g.font = '10px Segoe UI';
    for (let k = 0; k <= 4; k++) { const p = r.lo + ((r.hi - r.lo) * k) / 4; g.fillText(fmtP(p), W - axis + 5, y(p) + 3); }
    line(r.avg, '#f5a524', fmtP(r.avg), true);
    line(r.price, '#e8eaf0', fmtP(r.price), false);
    const dt = new Date((r.date + 8 * 3600) * 1000).toISOString().slice(0, 10);
    $('#chipsStats').innerHTML = `<table class="kv chips-kv">
      <tr><th>日期</th><td class="num">${dt}${idx != null ? '　<span class="muted small">（游標所在日）</span>' : ''}</td></tr>
      <tr><th>獲利比例</th><td><div class="pbar"><i style="width:${(r.profit * 100).toFixed(1)}%"></i></div><b class="num">${(r.profit * 100).toFixed(1)}%</b></td></tr>
      <tr><th>平均成本</th><td class="num" style="color:#f5a524">${fmtP(r.avg)}</td></tr>
      <tr><th>90% 成本</th><td class="num">${fmtP(r.r90[0])} – ${fmtP(r.r90[1])}　集中度 ${(r.c90 * 100).toFixed(1)}%</td></tr>
      <tr><th>70% 成本</th><td class="num">${fmtP(r.r70[0])} – ${fmtP(r.r70[1])}　集中度 ${(r.c70 * 100).toFixed(1)}%</td></tr></table>
      <div class="legend-row"><span><i style="background:${UP}"></i>獲利籌碼（成本低於現價）</span><span><i style="background:#3d8bfd"></i>套牢籌碼</span></div>
      <div class="hint">依近 250 個交易日的日 K 與換手率估算，不是真實持股資料。日K 圖上移動游標可看歷史某天的分布。</div>`;
  }
  $('#spChipsHelp').addEventListener('click', () => openModal('籌碼分布是什麼？', `<p>用過去約一年的每日成交量，估算目前市場上的股票大致是在什麼價位買進的（成本分布）。</p>
    <p>每天的成交量會依當天最高到最低價分配到各價位，同時依換手率讓舊籌碼逐步「換手」消失。</p>
    <ul><li><b>獲利比例</b>：成本低於現價的籌碼比例</li><li><b>平均成本</b>：所有籌碼的加權平均價（黃色虛線）</li><li><b>90%／70% 成本區間</b>：涵蓋該比例籌碼的價格範圍；集中度越小代表成本越集中</li></ul>
    <p class="hint">這是常見的技術分析估算方法，不是券商或集保的真實持股資料。</p>`));
  mainChart.subscribeCrosshairMove((p) => {
    if (cur !== 'chips' || state.layout.noRight || state.period !== 'D' || chipsBars.code !== state.code) return;
    let idx = null;
    if (p.time) { const t = p.time - state.dOff; idx = chipsBars.bars.findIndex((b) => Math.abs(b.t - t) < 43200); if (idx < 0) idx = null; }
    if (idx !== chipsIdx) { chipsIdx = idx; drawChips(idx); }
  });

  /* ---------- 筆記 ---------- */
  let memoTimer = null;
  function renderMemo() {
    const c = state.code; $('#spMemoName').textContent = nameOf(c);
    $('#memoNote').value = state.notes[c] || ''; $('#memoText').value = state.memos[c] || ''; $('#memoSaved').textContent = '自動儲存在這台電腦';
  }
  ['#memoNote', '#memoText'].forEach((sel) => $(sel).addEventListener('input', () => {
    clearTimeout(memoTimer); $('#memoSaved').textContent = '編輯中…';
    memoTimer = setTimeout(() => {
      const c = state.code, n = $('#memoNote').value.trim(), m = $('#memoText').value;
      n ? (state.notes[c] = n) : delete state.notes[c]; m.trim() ? (state.memos[c] = m) : delete state.memos[c];
      save('notes'); save('memos'); renderWatch(); $('#memoSaved').textContent = '已儲存 ' + new Date().toTimeString().slice(0, 8);
    }, 500);
  }));

  // 換股票、換市場、展開右欄時更新
  const _select = selectCode;
  selectCode = function (code) { _select(code); chipsIdx = null; refresh(); syncRail(); };
  const _switch = switchMarket;
  switchMarket = function (m) { _switch(m); chipsIdx = null; refresh(); };
  const _apply = applyLayout;
  applyLayout = function () { _apply(); syncRail(); setTimeout(refresh, 60); };
  const _sw = switchSideTab;
  switchSideTab = function (t) { _sw(t); syncRail(); };

  show(cur); syncRail();
})();
