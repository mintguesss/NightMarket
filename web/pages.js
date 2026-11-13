/* 各功能頁：市場、排行、期權、觀察、日曆、模擬倉（全部依台股/美股模式分開） */
const nmCell = (c, n) => `<span class="nm"><b>${esc(n || nameOf(c))}</b><small>${esc(showCode(c))}</small></span>`;

/* ---------- 市場 ---------- */
const MARKET_SECTIONS = {
  tw: [
    ['台股大盤', [['t00', '加權指數'], ['o00', '櫃買指數'], ['FUT.TXF', '台指期近月'], ['FUT.MXF', '小台指近月'], ['0050', '元大台灣50'], ['00631L', '台灣50正2']]],
    ['權值股', [['2330', '台積電'], ['2317', '鴻海'], ['2454', '聯發科'], ['2308', '台達電'], ['2382', '廣達'], ['2881', '富邦金']]],
    ['亞洲股市', [['Y.^N225', '日經225'], ['Y.^HSI', '恆生指數'], ['Y.^KS11', '韓國綜合'], ['Y.000001.SS', '上證指數'], ['Y.^STI', '新加坡海峽']]],
    ['匯率', [['FX.USDTWD', '美元/台幣'], ['Y.JPYTWD=X', '日圓/台幣'], ['Y.CNYTWD=X', '人民幣/台幣'], ['Y.EURTWD=X', '歐元/台幣']]],
  ],
  us: [
    ['美股指數', [['US.^DJI', '道瓊工業'], ['US.^IXIC', '那斯達克'], ['US.^GSPC', '標普500'], ['US.^SOX', '費城半導體'], ['Y.^RUT', '羅素2000'], ['Y.^VIX', 'VIX 恐慌指數']]],
    ['指數期貨', [['Y.ES=F', '標普期貨'], ['Y.NQ=F', '那斯達克期貨'], ['Y.YM=F', '道瓊期貨'], ['Y.RTY=F', '羅素期貨']]],
    ['類股 ETF', [['US.XLK', '科技'], ['US.SMH', '半導體'], ['US.XLF', '金融'], ['US.XLE', '能源'], ['US.XLV', '醫療'], ['US.XLY', '非必需消費'], ['US.XLI', '工業'], ['US.XLC', '通訊'], ['US.XLP', '必需消費'], ['US.XLU', '公用事業'], ['US.XLRE', '房地產'], ['US.XLB', '原物料']]],
    ['債券・匯率', [['Y.^TNX', '美債10年殖利率'], ['Y.^IRX', '美債3月殖利率'], ['Y.DX-Y.NYB', '美元指數'], ['Y.EURUSD=X', '歐元/美元'], ['Y.USDJPY=X', '美元/日圓']]],
    ['商品・加密貨幣', [['Y.CL=F', '原油'], ['Y.GC=F', '黃金'], ['Y.SI=F', '白銀'], ['Y.HG=F', '銅'], ['Y.BTC-USD', '比特幣'], ['Y.ETH-USD', '以太幣']]],
  ],
};
PAGES.market = {
  async load() { this.render(); await this.refresh(); },
  codes() { return MARKET_SECTIONS[state.mkt].flatMap(([, l]) => l.map(([c]) => c)).filter((c) => !c.startsWith('FUT.')); },
  async refresh() {
    const codes = this.codes();
    try {
      const [q, sp] = await Promise.all([api('/api/quote?codes=' + codes.map(encodeURIComponent).join(',')), api('/api/spark?codes=' + codes.filter((c) => c !== 'o00').map(encodeURIComponent).join(','))]);
      Object.assign(state.quotes, q); Object.assign(state.sparks, sp);
      if (state.mkt === 'tw') await refreshFutures();
      const mx = state.futures?.find((r) => /^MXF[A-L]\d-F$/.test(r.id)); if (mx) state.quotes['FUT.MXF'] = { code: 'FUT.MXF', name: mx.name, price: mx.last, prev: mx.ref };
      $('#marketUpd').textContent = '更新於 ' + new Date().toTimeString().slice(0, 8);
    } catch (e) { console.warn(e); }
    if (state.view === 'market') this.render();
  },
  tick() { if (!this.t || Date.now() - this.t > 15000) { this.t = Date.now(); this.refresh(); } },
  render() {
    $('#marketBody').innerHTML = MARKET_SECTIONS[state.mkt].map(([title, list]) => `<div class="sec-title"><b>${title}</b></div><div class="cards">${list.map(([c, n]) => {
      const q = state.quotes[c], { d, pct } = chgOf(q), k = cls(d), fx = c.includes('=X') || c.startsWith('FX.'), dp = fx ? 4 : c.startsWith('FUT.') ? 0 : 2;
      return `<div class="card ${c.startsWith('FUT.') || c === 'o00' ? '' : 'click'}" data-code="${esc(c)}"><div class="k"><span>${esc(n)}</span><span>${esc(showCode(c).replace('FUT.', ''))}</span></div>
        <div class="v num ${k}">${fmtP(q?.price, dp)}</div><div class="s num ${k}">${q ? `${sign(d)}${fmtP(d, dp)}　${sign(pct)}${pct.toFixed(2)}%` : '--'}</div><canvas></canvas></div>`;
    }).join('')}</div>`).join('') + '<div class="hint" style="padding:16px">期貨、商品、加密貨幣等為 Yahoo Finance 資料，部分可能延遲。</div>';
    $$('#marketBody .card').forEach((el) => { const cv = el.querySelector('canvas'); if (state.sparks[el.dataset.code]) drawSpark(cv, state.sparks[el.dataset.code], 80, 32); });
  },
};
$('#marketBody').addEventListener('click', (e) => { const c = e.target.closest('.card.click'); if (c) { selectCode(c.dataset.code); setView('chart'); } });
$('#marketBody').addEventListener('contextmenu', (e) => { const c = e.target.closest('.card.click'); if (c) { e.preventDefault(); stockMenu(c.dataset.code, e.clientX, e.clientY, false); } });

/* ---------- 排行 ---------- */
const rankState = { type: 'gainers', data: {} };
PAGES.rank = {
  async load(force) {
    const m = state.mkt, etf = $('#rankEtf').checked ? 1 : 0, key = m + etf;
    $('#rankMkt').hidden = true; $('#rankEtfWrap').hidden = m !== 'tw';
    if (!rankState.data[key] || force || Date.now() - rankState.data[key].t > 60000) {
      if (!rankState.data[key]) $('#rankBody').innerHTML = '<div class="empty">載入排行…</div>';
      try { rankState.data[key] = { d: await api(`/api/rank?mkt=${m}&etf=${etf}`), t: Date.now() }; } catch (e) { $('#rankBody').innerHTML = `<div class="empty">載入失敗：${esc(e.message)}</div>`; return; }
    }
    if (state.view !== 'rank' || state.mkt !== m) return;
    const d = rankState.data[key].d, rows = d[rankState.type] || [], tw = m === 'tw';
    rows.forEach((r) => rememberName(r.code, r.name));
    $('#rankUpd').textContent = `${tw ? '上市＋上櫃' : '美股'}　更新於 ${new Date(d.updated * 1000).toTimeString().slice(0, 8)}`;
    $('#rankBody').innerHTML = rows.length ? `<table class="tbl"><thead><tr><th class="l rk">#</th><th class="l">名稱</th><th>成交價</th><th>漲跌幅</th><th>漲跌</th><th>成交量${tw ? '(張)' : '(股)'}</th><th>成交值${tw ? '(台幣)' : '(美元)'}</th><th></th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr data-code="${esc(r.code)}"><td class="l rk">${i + 1}</td><td class="l">${nmCell(r.code, r.name)}${tw && r.mkt === 'otc' ? '<span class="tag tw">櫃</span>' : ''}${r.limitUp ? '<span class="tag buy">漲停</span>' : ''}${r.limitDown ? '<span class="tag sell">跌停</span>' : ''}</td>
        <td class="num ${cls(r.chg)}">${fmtP(r.price)}</td><td class="num ${cls(r.chg)}">${sign(r.pct)}${r.pct.toFixed(2)}%</td><td class="num ${cls(r.chg)}">${sign(r.chg)}${fmtP(r.chg)}</td>
        <td class="num">${fmtVol(r.volume)}</td><td class="num">${fmtVol(r.value)}</td><td><button class="act" data-add="${esc(r.code)}">${state.watch.includes(r.code) ? '♥ 已自選' : '+ 自選'}</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">沒有資料</div>';
  },
  tick() { this.load(); },
};
$('#rankBody').addEventListener('click', (e) => {
  const add = e.target.closest('[data-add]'); if (add) { e.stopPropagation(); const c = add.dataset.add; state.watch.includes(c) ? removeWatch(c) : addWatch(c); setTimeout(() => PAGES.rank.load(), 300); return; }
  const r = e.target.closest('tr[data-code]'); if (r) selectCode(r.dataset.code);
});
$('#rankBody').addEventListener('dblclick', (e) => { const r = e.target.closest('tr[data-code]'); if (r) { selectCode(r.dataset.code); setView('chart'); } });
$('#rankBody').addEventListener('contextmenu', (e) => { const r = e.target.closest('tr[data-code]'); if (r) { e.preventDefault(); stockMenu(r.dataset.code, e.clientX, e.clientY, false); } });
$('#rankType').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; rankState.type = b.dataset.r; $$('#rankType button').forEach((x) => x.classList.toggle('active', x === b)); PAGES.rank.load(); });
$('#rankEtf').addEventListener('change', () => PAGES.rank.load());
$('#rankRefresh').addEventListener('click', () => PAGES.rank.load(true));

/* ---------- 期權 ---------- */
const optState = { exp: { tw: '', us: '' }, sym: '', data: null };
PAGES.options = {
  async load() {
    const tw = state.mkt === 'tw';
    $('#optUnd').hidden = true; $('#optSym').hidden = tw;
    if (!tw) { if (!optState.sym) optState.sym = isUS(state.code) && !state.code.includes('^') ? showCode(state.code) : 'AAPL'; $('#optSym').value = optState.sym; }
    await this.refresh(true);
  },
  async refresh(first) {
    const tw = state.mkt === 'tw', und = tw ? 'TXO' : 'US.' + optState.sym.toUpperCase(), exp = optState.exp[state.mkt];
    if (first) $('#optBody').innerHTML = '<div class="empty">載入選擇權報價…</div>';
    try {
      const d = await api(`/api/options?u=${encodeURIComponent(und)}${exp ? '&exp=' + encodeURIComponent(exp) : ''}`);
      if (state.view !== 'options' || (state.mkt === 'tw') !== tw) return;
      optState.data = d; if (!exp && d.expiry) optState.exp[state.mkt] = d.expiry;
      if (tw) await refreshFutures();
      this.render(first);
    } catch (e) { $('#optBody').innerHTML = `<div class="empty">載入失敗：${esc(e.message)}${tw ? '' : '<br>請確認代號正確（例如 AAPL、NVDA、SPY）'}</div>`; }
  },
  tick() { if (!this.t || Date.now() - this.t > 10000) { this.t = Date.now(); this.refresh(); } },
  render(scroll) {
    const d = optState.data, tw = state.mkt === 'tw'; if (!d) return;
    $('#optExp').innerHTML = d.expiries.map((x) => `<option value="${esc(x.id)}" ${x.id === d.expiry ? 'selected' : ''}>${esc(x.label)}</option>`).join('');
    const spot = d.spot, futs = tw ? (state.futures || []).filter((r) => /^TXF[A-L]\d-F$/.test(r.id)).slice(0, 2) : [];
    $('#optHead').innerHTML = `<span>${esc(d.name)}　標的 <b class="num">${fmtP(spot)}</b></span>` + futs.map((f) => `<span>${esc(f.name)} <b class="num ${cls(f.chg)}">${fmtP(f.last, 0)}</b> <span class="num ${cls(f.chg)}">${sign(f.chg)}${fmtP(f.chg, 0)} (${sign(f.pct)}${fmtP(f.pct)}%)</span></span>`).join('') + `<span class="muted small">${tw ? '資料：期交所 MIS（盤中即時）' : '資料：Yahoo Finance（可能延遲 15 分鐘）'}</span>`;
    let rows = d.rows; const range = +$('#optRange').value;
    const atmI = rows.reduce((bi, r, i) => (Math.abs(r.strike - spot) < Math.abs(rows[bi].strike - spot) ? i : bi), 0);
    if (range && rows.length) rows = rows.slice(Math.max(0, atmI - range), atmI + range + 1);
    const atm = d.rows[atmI]?.strike;
    const f = (v, dp = 2) => (v == null || v === 0 ? '<span class="muted">-</span>' : fmtP(v, dp));
    let r_strike = 0;
    const cells = (x, side) => {
      if (!x || !x.id) return '<td></td>'.repeat(tw ? 6 : 7);
      const chg = x.chg ?? (x.last && x.ref ? x.last - x.ref : null);
      const oc = (tw ? 'OPT.TW:' : 'OPT.US:') + x.id, lbl = `${tw ? '台指選 ' + (d.expiry || '') : d.underlying.replace('US.', '') + ' ' + ($('#optExp').selectedOptions[0]?.text || '')} ${fmtP(r_strike, tw ? 0 : 2)} ${side === 'call' ? (tw ? '買權' : 'Call') : (tw ? '賣權' : 'Put')}`;
      const clk = (px, sd) => `data-oc="${esc(oc)}" data-ol="${esc(lbl)}" data-os="${sd}" data-op="${px ?? ''}" data-bid="${x.bid ?? ''}" data-ask="${x.ask ?? ''}"`;
      const arr = [`<td class="num">${f(x.oi, 0)}</td>`, `<td class="num">${f(x.vol, 0)}</td>`, ...(tw ? [] : [`<td class="num">${x.iv != null ? (x.iv * 100).toFixed(1) + '%' : '-'}</td>`]),
        `<td class="num ${cls(chg)}">${chg ? sign(chg) + fmtP(chg) : '<span class="muted">-</span>'}</td>`, `<td class="num ${cls(chg)} oc" ${clk(x.ask || x.last, 'buy')}><b>${f(x.last || null)}</b></td>`, `<td class="num up oc" ${clk(x.bid, 'sell')} title="以買價賣出">${f(x.bid)}</td>`, `<td class="num down oc" ${clk(x.ask, 'buy')} title="以賣價買進">${f(x.ask)}</td>`];
      return (side === 'put' ? [...arr].reverse() : arr).join('');
    };
    const hc = ['未平倉', '成交量', ...(tw ? [] : ['IV']), '漲跌', '成交價', '買價', '賣價'];
    $('#optBody').innerHTML = rows.length ? `<table class="tbl otbl"><thead><tr><th colspan="${hc.length}" class="c cs">買權 CALL</th><th class="c">履約價</th><th colspan="${hc.length}" class="c ps">賣權 PUT</th></tr>
      <tr>${hc.map((h) => `<th>${h}</th>`).join('')}<th class="c"></th>${[...hc].reverse().map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>
      ${rows.map((r) => { const itmC = r.strike < spot, itmP = r.strike > spot; r_strike = r.strike;
        return `<tr class="${r.strike === atm ? 'atm' : ''}">${cells(r.call, 'call').replace(/<td class="num/g, `<td class="num${itmC ? ' itm' : ''}`)}<td class="k num">${fmtP(r.strike, tw ? 0 : 2)}</td>${cells(r.put, 'put').replace(/<td class="num/g, `<td class="num${itmP ? ' itm' : ''}`)}</tr>`; }).join('')}</tbody></table>` : '<div class="empty">沒有資料</div>';
    if (scroll) setTimeout(() => $('#optBody tr.atm')?.scrollIntoView({ block: 'center' }), 30);
    $('#optUpd').textContent = '更新於 ' + new Date().toTimeString().slice(0, 8);
  },
};
$('#optBody').addEventListener('click', (e) => {
  const td = e.target.closest('[data-oc]'); if (!td) return;
  optOrder(td.dataset.oc, td.dataset.ol, td.dataset.os, +td.dataset.op || null, +td.dataset.bid || null, +td.dataset.ask || null);
});
function optOrder(code, label, side, px, bid, ask, maxQty) {
  rememberName(code, label);
  const mult = multOf(code), ccy = ccyOf(code), acc = state.paper, pos = acc?.positions?.[code];
  const m = openModal(`期權模擬下單`, `<div style="margin-bottom:10px"><b>${esc(label)}</b><div class="muted small">每口 ${mult}${code.startsWith('OPT.TW:') ? ' 元/點' : ' 股'}　買價 ${fmtP(bid)}　賣價 ${fmtP(ask)}　${pos ? '持有 ' + pos.qty + ' 口' : '目前沒有持倉'}</div></div>
    <div class="fld"><label>買賣</label><select id="ooSide"><option value="buy" ${side === 'buy' ? 'selected' : ''}>買進（建倉）</option><option value="sell" ${side === 'sell' ? 'selected' : ''}>賣出（平倉）</option></select></div>
    <div class="fld"><label>類型</label><select id="ooType"><option value="limit">限價</option><option value="market">市價（買用賣價、賣用買價）</option></select></div>
    <div class="fld"><label>價格（權利金）</label><input id="ooPx" type="number" step="any" value="${px ?? ''}"></div>
    <div class="fld"><label>口數</label><input id="ooQty" type="number" min="1" value="${maxQty || 1}"></div>
    <div class="hint" id="ooEst"></div>
    <div class="hint">模擬交易，只能買進建倉、賣出平倉（不做賣方）。到期日不會自動結算，請在到期前平倉。可用現金 ${acc ? fmtP(acc.cash[ccy]) : '--'} ${ccy}</div>`,
    [{ label: '取消' }, { label: '送出模擬委託', act: async (m) => {
      const sd = m.querySelector('#ooSide').value, ty = m.querySelector('#ooType').value, qty = parseInt(m.querySelector('#ooQty').value) || 0, p = parseFloat(m.querySelector('#ooPx').value);
      const r = await post('/api/paper/order', { code, side: sd, type: ty, qty, price: ty === 'limit' ? p : null }).catch((er) => ({ ok: false, msg: er.message }));
      toast((r.ok ? '✓ ' : '失敗：') + r.msg, 4000); loadPaper(); return r.ok ? undefined : false;
    } }]);
  const est = () => {
    const sd = m.querySelector('#ooSide').value, ty = m.querySelector('#ooType').value, qty = parseInt(m.querySelector('#ooQty').value) || 0;
    const p = ty === 'market' ? (sd === 'buy' ? ask : bid) : parseFloat(m.querySelector('#ooPx').value) || 0, amt = p * mult * qty, f = feesOf(code, sd, amt, qty);
    m.querySelector('#ooPx').disabled = ty === 'market';
    m.querySelector('#ooEst').innerHTML = `權利金 ${fmtP(amt)} ${ccy}　手續費＋稅 ${fmtP(f.fee + f.tax)}　${sd === 'buy' ? '預估付出' : '預估收入'} <b>${fmtP(sd === 'buy' ? amt + f.fee + f.tax : amt - f.fee - f.tax)}</b> ${ccy}`;
  };
  m.querySelectorAll('input,select').forEach((el) => el.addEventListener('input', est));
  m.querySelector('#ooSide').addEventListener('change', () => { const sd = m.querySelector('#ooSide').value; m.querySelector('#ooPx').value = (sd === 'buy' ? ask : bid) ?? ''; est(); });
  est();
}
$('#optExp').addEventListener('change', (e) => { optState.exp[state.mkt] = e.target.value; PAGES.options.refresh(true); });
$('#optRange').addEventListener('change', () => PAGES.options.render(true));
$('#optSym').addEventListener('keydown', (e) => { if (e.key === 'Enter') { optState.sym = e.target.value.trim().toUpperCase(); optState.exp.us = ''; PAGES.options.refresh(true); } });

/* ---------- 觀察（新聞） ---------- */
const newsState = { market: [] };
PAGES.news = {
  async load() {
    $('#newsCat').hidden = true;
    const code = state.code, idx = code === 't00' || code.includes('^');
    $('#newsStockTitle').textContent = idx ? '個股新聞（請先選擇個股）' : `${nameOf(code)} 新聞`;
    $('#newsStock').innerHTML = idx ? '<div class="empty">在自選清單點選一檔股票</div>' : '<div class="empty">載入中…</div>';
    $('#newsMarket').innerHTML = '<div class="empty">載入中…</div>';
    const cat = state.mkt === 'tw' ? '台股' : '國際股';
    const [s, m] = await Promise.all([idx ? null : api('/api/news?code=' + encodeURIComponent(code)).catch(() => []), api('/api/news').catch(() => [])]);
    if (state.view !== 'news') return;
    if (s) $('#newsStock').innerHTML = s.length ? s.map(newsItem).join('') : '<div class="empty">沒有相關新聞</div>';
    const list = m.filter((n) => n.cat === cat);
    $('#newsMarket').innerHTML = list.length ? list.map(newsItem).join('') : '<div class="empty">沒有快訊</div>';
  },
};
$('#newsRefresh').addEventListener('click', () => PAGES.news.load());

/* ---------- 日曆 ---------- */
const calState = { date: null, cache: {} };
const ymd = (d) => d.toISOString().slice(0, 10);
PAGES.calendar = {
  async load() {
    if (!calState.date) { const n = state.mkt === 'tw' ? twNow() : new Date(); calState.date = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; }
    $('#calDate').value = calState.date;
    $('#calBody').innerHTML = '<div class="empty">載入日曆…</div>';
    try { if (!calState.cache[calState.date]) calState.cache[calState.date] = await api('/api/calendar?date=' + calState.date); } catch (e) { $('#calBody').innerHTML = `<div class="empty">載入失敗：${esc(e.message)}</div>`; return; }
    if (state.view === 'calendar') this.render();
  },
  render() {
    const d = calState.cache[calState.date], tw = state.mkt === 'tw', mine = $('#calMine').checked, day = calState.date.replace(/-/g, '');
    // 週列
    const base = new Date(calState.date + 'T00:00:00Z'), wd = (base.getUTCDay() + 6) % 7, W = ['一', '二', '三', '四', '五', '六', '日'];
    const hol = new Set((d.twHolidays || []).map((h) => h.date));
    $('#calWeek').innerHTML = W.map((w, i) => {
      const x = new Date(base); x.setUTCDate(base.getUTCDate() - wd + i); const s = ymd(x), k = s.replace(/-/g, '');
      const divN = tw ? (d.twDividends || []).filter((r) => r.date === k).length : 0;
      return `<div class="day ${s === calState.date ? 'on' : ''} ${tw && hol.has(k) ? 'hol' : ''}" data-d="${s}"><div class="w">週${w}</div><div class="d">${x.getUTCMonth() + 1}/${x.getUTCDate()}</div><div class="b">${tw && hol.has(k) ? '休市' : divN ? `除權息 ${divN}` : ''}</div></div>`;
    }).join('');
    let html = '';
    if (tw) {
      let divs = (d.twDividends || []).filter((r) => r.date >= day).sort((a, b) => a.date.localeCompare(b.date));
      if (mine) divs = divs.filter((r) => state.watch.includes(r.code));
      const today = divs.filter((r) => r.date === day), later = divs.filter((r) => r.date !== day);
      const divTbl = (list) => `<table class="tbl"><thead><tr><th class="l">日期</th><th class="l">股票</th><th class="c">類型</th><th>現金股利</th><th>股票股利</th><th></th></tr></thead><tbody>${list.map((r) => `<tr data-code="${esc(r.code)}"><td class="l num">${r.date.slice(4, 6)}/${r.date.slice(6)}</td><td class="l">${nmCell(r.code, r.name)}${state.watch.includes(r.code) ? '<span class="tag tw">自選</span>' : ''}</td><td class="c">除${esc(r.type)}</td><td class="num">${r.cash ? fmtP(r.cash, 4) : '-'}</td><td class="num">${esc(r.stock || '-')}</td><td><button class="act" data-add="${esc(r.code)}">${state.watch.includes(r.code) ? '♥' : '+ 自選'}</button></td></tr>`).join('')}</tbody></table>`;
      html += `<div class="sec-title"><b>${calState.date} 除權息</b><span>${today.length} 檔</span></div>${today.length ? divTbl(today) : '<div class="empty">這天沒有除權息</div>'}`;
      html += `<div class="sec-title"><b>之後的除權息預告</b><span>證交所公告，${later.length} 檔</span></div>${later.length ? divTbl(later) : '<div class="empty">沒有資料</div>'}`;
      const hs = (d.twHolidays || []).filter((h) => h.date >= day);
      html += `<div class="sec-title"><b>台股休市日</b></div>${hs.length ? `<table class="tbl"><tbody>${hs.map((h) => `<tr><td class="l num">${h.date.slice(0, 4)}/${h.date.slice(4, 6)}/${h.date.slice(6)}</td><td class="l">${esc(h.name)}</td><td class="l muted small">${esc(h.desc || '')}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">今年沒有剩餘休市日資料</div>'}`;
    } else {
      const capNum = (s) => +String(s || '').replace(/[$,]/g, '') || 0;
      let er = [...(d.earnings || [])].sort((a, b) => capNum(b.cap) - capNum(a.cap));
      if (mine) er = er.filter((r) => state.watch.includes('US.' + r.symbol));
      const tmap = { 'time-pre-market': '盤前', 'time-after-hours': '盤後', 'time-not-supplied': '未定' };
      html += `<div class="sec-title"><b>${calState.date} 美股財報</b><span>${er.length} 家，依市值排序</span></div>${er.length ? `<table class="tbl"><thead><tr><th class="l">公司</th><th class="c">時間</th><th>市值</th><th>預估 EPS</th><th>去年同期 EPS</th><th></th></tr></thead><tbody>${er.slice(0, 150).map((r) => `<tr data-code="US.${esc(r.symbol)}"><td class="l">${nmCell('US.' + r.symbol, r.name)}${state.watch.includes('US.' + r.symbol) ? '<span class="tag us">自選</span>' : ''}</td><td class="c">${tmap[r.time] || esc(r.time || '')}</td><td class="num">${esc(r.cap || '-')}</td><td class="num">${esc(r.eps || '-')}</td><td class="num">${esc(r.lastEps || '-')}</td><td><button class="act" data-add="US.${esc(r.symbol)}">${state.watch.includes('US.' + r.symbol) ? '♥' : '+ 自選'}</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">這天沒有財報（或只看自選時沒有符合）</div>'}`;
      const ev = [...(d.economic || [])].sort((a, b) => (b.country === 'United States') - (a.country === 'United States') || String(a.time).localeCompare(String(b.time)));
      const toTW = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); if (!m) return t || ''; const h = (+m[1] + 8) % 24; return `${String(h).padStart(2, '0')}:${m[2]}`; };
      html += `<div class="sec-title"><b>經濟數據</b><span>時間為台北時間；美國數據排前面</span></div>${ev.length ? `<table class="tbl"><thead><tr><th class="l">時間</th><th class="l">國家</th><th class="l">事件</th><th>實際</th><th>預期</th><th>前值</th></tr></thead><tbody>${ev.map((r) => `<tr><td class="l num">${toTW(r.time)}</td><td class="l ${r.country === 'United States' ? 'imp' : ''}">${esc(r.country)}</td><td class="l">${esc(r.event)}</td><td class="num">${esc(r.actual || '')}</td><td class="num">${esc(r.consensus || '')}</td><td class="num">${esc(r.previous || '')}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">沒有經濟數據</div>'}`;
    }
    $('#calBody').innerHTML = html;
  },
};
$('#calWeek').addEventListener('click', (e) => { const x = e.target.closest('[data-d]'); if (x) { calState.date = x.dataset.d; PAGES.calendar.load(); } });
$('#calDate').addEventListener('change', (e) => { if (e.target.value) { calState.date = e.target.value; PAGES.calendar.load(); } });
const shiftDay = (n) => { const x = new Date(calState.date + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); calState.date = ymd(x); PAGES.calendar.load(); };
$('#calPrev').addEventListener('click', () => shiftDay(-1));
$('#calNext').addEventListener('click', () => shiftDay(1));
$('#calToday').addEventListener('click', () => { calState.date = null; PAGES.calendar.load(); });
$('#calMine').addEventListener('change', () => PAGES.calendar.render());
$('#calBody').addEventListener('click', (e) => {
  const add = e.target.closest('[data-add]'); if (add) { e.stopPropagation(); const c = add.dataset.add; state.watch.includes(c) ? removeWatch(c) : addWatch(c); setTimeout(() => PAGES.calendar.render(), 300); return; }
  const r = e.target.closest('tr[data-code]'); if (r) { selectCode(r.dataset.code); setView('chart'); }
});

/* ---------- 模擬倉 ---------- */
PAGES.paper = {
  load() { loadPaper(); if (state.sideTab !== 'trade') switchSideTab('trade'); },
  tick() { this.render(); },
  render() {
    if (state.view !== 'paper' || !state.paper) return;
    const a = state.paper, ccy = state.mkt === 'tw' ? 'TWD' : 'USD', mine = (c) => ccyOf(c) === ccy, dp = ccy === 'TWD' ? 0 : 2;
    const fm = (v) => (dp ? fmtP(v) : fmtInt(v));
    const pos = Object.values(a.positions).filter((p) => mine(p.code)).map((p) => {
      const mult = p.mult || multOf(p.code), q = state.quotes[p.code], px = (isOpt(p.code) ? q?.bid || q?.price : q?.price) ?? p.cost / p.qty / mult;
      const mv = px * p.qty * mult, f = feesOf(p.code, 'sell', mv, p.qty), pnl = mv - f.fee - f.tax - p.cost;
      return { ...p, mult, px, mv, pnl, pct: (pnl / p.cost) * 100, avg: p.cost / p.qty / mult, dayChg: q && q.prev ? (q.price - q.prev) * p.qty * mult : 0 };
    });
    const mv = pos.reduce((s, p) => s + p.mv, 0), unreal = pos.reduce((s, p) => s + p.pnl, 0), day = pos.reduce((s, p) => s + p.dayChg, 0);
    const total = a.cash[ccy] + mv, init = a.initial[ccy], real = a.realized[ccy] || 0;
    const card = (k, v, s, c = '') => `<div class="card"><div class="k">${k}</div><div class="v num ${c}">${v}</div><div class="s num">${s}</div></div>`;
    const orders = a.orders.filter((o) => mine(o.code)), pending = orders.filter((o) => o.status === 'pending'), done = orders.filter((o) => o.status !== 'pending').slice(0, 100);
    const stMap = { filled: '已成交', cancelled: '已取消', rejected: '失敗', pending: '委託中' };
    const dt = (s) => { const d = new Date(s * 1000); return `${d.getMonth() + 1}/${d.getDate()} ${d.toTimeString().slice(0, 5)}`; };
    const side = (s) => `<span class="tag ${s}">${s === 'buy' ? '買' : '賣'}</span>`;
    $('#paperBody').innerHTML = `
      <div class="cards">
        ${card(`${state.mkt === 'tw' ? '台股' : '美股'}帳戶總值 (${ccy})`, fm(total), `報酬 ${sign(total - init)}${fm(total - init)}（${sign(total - init)}${(((total - init) / init) * 100).toFixed(2)}%）`, cls(total - init))}
        ${card('今日損益（持股）', sign(day) + fm(day), `持股 ${pos.length} 檔`, cls(day))}
        ${card('未實現損益', sign(unreal) + fm(unreal), `已實現 ${sign(real)}${fm(real)}`, cls(unreal))}
        ${card('可用現金', fm(a.cash[ccy]), `持股市值 ${fm(mv)}`)}
      </div>
      ${state.mkt === 'us' ? '<div class="hint" style="padding:4px 16px">美股盤前（04:00–09:30）與盤後（16:00–20:00）時段只接受限價單，以延長時段價格撮合。</div>' : ''}
      <div class="sec-title"><b>持倉</b><span>點一列切到該股票，按「賣出」帶入下單</span></div>
      ${pos.length ? `<table class="tbl"><thead><tr><th class="l">名稱</th><th>數量</th><th>均價</th><th>現價</th><th>市值</th><th>今日</th><th>未實現損益</th><th>報酬率</th><th></th></tr></thead><tbody>
        ${pos.map((p) => `<tr data-code="${esc(p.code)}"><td class="l">${nmCell(p.code, p.name)}</td><td class="num">${fmtInt(p.qty)}${isOpt(p.code) ? ' 口' : ''}</td><td class="num">${fmtP(p.avg)}</td>
          <td class="num ${cls(p.px - (state.quotes[p.code]?.prev ?? p.px))}">${fmtP(p.px)}</td><td class="num">${fmtP(p.mv)}</td><td class="num ${cls(p.dayChg)}">${sign(p.dayChg)}${fmtP(p.dayChg)}</td>
          <td class="num ${cls(p.pnl)}">${sign(p.pnl)}${fmtP(p.pnl)}</td><td class="num ${cls(p.pnl)}">${sign(p.pct)}${p.pct.toFixed(2)}%</td><td><button class="act" data-sell="${esc(p.code)}" data-qty="${p.qty}">賣出</button></td></tr>`).join('')}</tbody></table>`
        : '<div class="empty">還沒有持股。在右側「模擬下單」買進看看。</div>'}
      <div class="sec-title"><b>委託中</b></div>
      ${pending.length ? `<table class="tbl"><thead><tr><th class="l">時間</th><th class="l">名稱</th><th>買賣</th><th>限價</th><th>數量</th><th>現價</th><th></th></tr></thead><tbody>
        ${pending.map((o) => `<tr data-code="${esc(o.code)}"><td class="l num">${dt(o.created)}</td><td class="l">${nmCell(o.code, o.name)}</td><td>${side(o.side)}</td><td class="num">${fmtP(o.limit)}</td><td class="num">${fmtInt(o.qty)}</td><td class="num">${fmtP(state.quotes[o.code]?.price)}</td><td><button class="act" data-cancel="${o.id}">取消</button></td></tr>`).join('')}</tbody></table>`
        : '<div class="empty">沒有委託中的單</div>'}
      <div class="sec-title"><b>交易紀錄</b></div>
      ${done.length ? `<table class="tbl"><thead><tr><th class="l">時間</th><th class="l">名稱</th><th>買賣</th><th>類型</th><th>數量</th><th>成交價</th><th>手續費+稅</th><th>損益</th><th>狀態</th></tr></thead><tbody>
        ${done.map((o) => `<tr data-code="${esc(o.code)}"><td class="l num">${dt(o.doneAt || o.created)}</td><td class="l">${nmCell(o.code, o.name)}</td><td>${side(o.side)}</td><td>${o.type === 'market' ? '市價' : '限價 ' + fmtP(o.limit)}</td><td class="num">${fmtInt(o.qty)}</td>
          <td class="num">${o.fillPrice != null ? fmtP(o.fillPrice) : '--'}</td><td class="num">${o.fee != null ? fmtP((o.fee || 0) + (o.tax || 0)) : '--'}</td>
          <td class="num ${cls(o.pnl || 0)}">${o.pnl != null ? sign(o.pnl) + fmtP(o.pnl) : ''}</td><td class="${o.status === 'rejected' ? 'down' : ''}">${stMap[o.status]}${o.reason ? '：' + esc(o.reason) : ''}</td></tr>`).join('')}</tbody></table>`
        : '<div class="empty">還沒有交易紀錄</div>'}`;
  },
};
$('#paperBody').addEventListener('click', async (e) => {
  const cancel = e.target.closest('[data-cancel]');
  if (cancel) { e.stopPropagation(); const r = await post('/api/paper/cancel', { id: cancel.dataset.cancel }); toast(r.msg); loadPaper(); return; }
  const sell = e.target.closest('[data-sell]');
  if (sell) {
    e.stopPropagation(); const c = sell.dataset.sell, qty = +sell.dataset.qty;
    if (isOpt(c)) { const q = state.quotes[c] || {}; optOrder(c, nameOf(c), 'sell', q.bid || q.price, q.bid, q.ask, qty); return; }
    selectCode(c);
    Object.assign(state.ticket, { side: 'sell', type: 'limit', code: c, price: state.quotes[c]?.price ?? '', unit: isTW(c) && qty % 1000 === 0 ? 1000 : 1 });
    state.ticket.qty = state.ticket.unit === 1000 ? qty / 1000 : qty; switchSideTab('trade'); return;
  }
  const r = e.target.closest('tr[data-code]'); if (r && !isOpt(r.dataset.code)) selectCode(r.dataset.code);
});
$('#paperReset').addEventListener('click', () => {
  openModal('重設模擬帳戶', `<div class="hint" style="margin:0 0 12px">會清空<b>台股與美股</b>的所有持股、委託與紀錄。</div>
    <div class="fld"><label>台股起始資金 (TWD)</label><input id="rsT" type="number" value="1000000"></div>
    <div class="fld"><label>美股起始資金 (USD)</label><input id="rsU" type="number" value="30000"></div>`,
    [{ label: '取消' }, { label: '重設', cls: 'danger', act: async (m) => { const r = await post('/api/paper/reset', { TWD: +m.querySelector('#rsT').value, USD: +m.querySelector('#rsU').value }); toast(r.msg); loadPaper(); } }]);
});

appInit();
