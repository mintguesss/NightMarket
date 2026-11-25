/* 各功能頁：市場、排行、期權、觀察、日曆、模擬倉（全部依台股/美股模式分開） */
const nmCell = (c, n) => `<span class="nm"><b>${esc(n || nameOf(c))}</b><small>${esc(showCode(c))}</small></span>`;

/* ---------- 市場 ---------- */
const MARKET_SECTIONS = {
  tw: [
    ['台股大盤', [['t00', '加權指數'], ['o00', '櫃買指數'], ['FUT.TXF', '台指期近月'], ['FUT.MXF', '小台指近月'], ['0050', '元大台灣50'], ['00631L', '台灣50正2']]],
    ['權值股', [['2330', '台積電'], ['2317', '鴻海'], ['2454', '聯發科'], ['2308', '台達電'], ['2382', '廣達'], ['2881', '富邦金']]],
    ['亞洲股市', [['Y.^N225', '日經225'], ['Y.^KS11', '韓國綜合'], ['Y.^KQ11', '韓國KOSDAQ'], ['Y.^HSI', '恆生指數'], ['Y.000001.SS', '上證指數'], ['Y.399001.SZ', '深證成指'], ['Y.^STI', '新加坡海峽'], ['Y.^BSESN', '印度Sensex'], ['Y.^AXJO', '澳洲200']]],
    ['亞洲熱門股', [['G.005930.KS', '三星電子'], ['G.000660.KS', 'SK海力士'], ['G.8035.T', '東京威力科創'], ['G.6857.T', '愛德萬測試'], ['G.7203.T', '豐田汽車'], ['G.9984.T', '軟銀集團'], ['G.0700.HK', '騰訊'], ['G.1810.HK', '小米'], ['G.0981.HK', '中芯國際']]],
    ['匯率', [['FX.USDTWD', '美元/台幣'], ['Y.JPYTWD=X', '日圓/台幣'], ['Y.CNYTWD=X', '人民幣/台幣'], ['Y.EURTWD=X', '歐元/台幣']]],
  ],
  us: [
    ['美股指數', [['US.^DJI', '道瓊工業'], ['US.^IXIC', '那斯達克'], ['US.^GSPC', '標普500'], ['US.^SOX', '費城半導體'], ['Y.^RUT', '羅素2000'], ['Y.^VIX', 'VIX 恐慌指數']]],
    ['指數期貨', [['Y.ES=F', '標普期貨'], ['Y.NQ=F', '那斯達克期貨'], ['Y.YM=F', '道瓊期貨'], ['Y.RTY=F', '羅素期貨']]],
    ['類股 ETF', [['US.XLK', '科技'], ['US.SMH', '半導體'], ['US.XLF', '金融'], ['US.XLE', '能源'], ['US.XLV', '醫療'], ['US.XLY', '非必需消費'], ['US.XLI', '工業'], ['US.XLC', '通訊'], ['US.XLP', '必需消費'], ['US.XLU', '公用事業'], ['US.XLRE', '房地產'], ['US.XLB', '原物料']]],
    ['債券・匯率', [['Y.^TNX', '美債10年殖利率'], ['Y.^IRX', '美債3月殖利率'], ['Y.DX-Y.NYB', '美元指數'], ['Y.EURUSD=X', '歐元/美元'], ['Y.USDJPY=X', '美元/日圓']]],
    ['歐洲・全球股市', [['Y.^FTSE', '英國富時100'], ['Y.^GDAXI', '德國DAX'], ['Y.^FCHI', '法國CAC40'], ['Y.^STOXX50E', '歐洲斯托克50'], ['Y.^N225', '日經225'], ['Y.^KS11', '韓國綜合'], ['Y.^HSI', '恆生指數'], ['Y.^GSPTSE', '加拿大TSX']]],
    ['全球熱門股', [['G.ASML.AS', '艾司摩爾'], ['G.SAP.DE', '思愛普'], ['G.NOVO-B.CO', '諾和諾德'], ['G.MC.PA', '路威酩軒'], ['G.AZN.L', '阿斯特捷利康'], ['G.005930.KS', '三星電子'], ['G.000660.KS', 'SK海力士'], ['G.7203.T', '豐田汽車'], ['G.0700.HK', '騰訊']]],
    ['商品・加密貨幣', [['Y.CL=F', '原油'], ['Y.GC=F', '黃金'], ['Y.SI=F', '白銀'], ['Y.HG=F', '銅'], ['Y.BTC-USD', '比特幣'], ['Y.ETH-USD', '以太幣']]],
  ],
};
PAGES.market = {
  async load() { this.render(); await this.refresh(); },
  codes() { return MARKET_SECTIONS[state.mkt].flatMap(([, l]) => l.map(([c]) => c)); },
  async refresh() {
    const codes = this.codes();
    try {
      const [q, sp] = await Promise.all([api('/api/quote?codes=' + codes.map(encodeURIComponent).join(',')), api('/api/spark?codes=' + codes.filter((c) => c !== 'o00').map(encodeURIComponent).join(','))]);
      Object.assign(state.quotes, q); Object.assign(state.sparks, sp);
      if (state.mkt === 'tw') await refreshFutures();
      $('#marketUpd').textContent = '更新於 ' + new Date().toTimeString().slice(0, 8);
    } catch (e) { console.warn(e); }
    if (state.view === 'market') this.render();
  },
  tick() { if (!this.t || Date.now() - this.t > 15000) { this.t = Date.now(); this.refresh(); } },
  render() {
    $('#marketBody').innerHTML = MARKET_SECTIONS[state.mkt].map(([title, list]) => `<div class="sec-title"><b>${title}</b></div><div class="cards">${list.map(([c, n]) => {
      const q = state.quotes[c], { d, pct } = chgOf(q), k = cls(d), fx = c.includes('=X') || c.startsWith('FX.'), dp = fx ? 4 : c.startsWith('FUT.') ? 0 : pxDp(q?.price);
      return `<div class="card ${c === 'o00' ? '' : 'click'}" data-code="${esc(c)}"><div class="k"><span>${esc(n)}</span><span>${esc(showCode(c).replace('FUT.', ''))}</span></div>
        <div class="v num ${k}">${fmtP(q?.price, dp)}</div><div class="s num ${k}">${q ? `${sign(d)}${fmtP(d, dp)}　${sign(pct)}${pct.toFixed(2)}%` : '--'}</div><canvas></canvas></div>`;
    }).join('')}</div>`).join('') + '<div class="hint" style="padding:16px">期貨、商品、加密貨幣與其他國家股市為 Yahoo Finance 資料，多數延遲 15–20 分鐘。點卡片可看走勢，加入自選後台股、美股清單都能放。</div>';
    $$('#marketBody .card').forEach((el) => { const cv = el.querySelector('canvas'); if (state.sparks[el.dataset.code]) drawSpark(cv, state.sparks[el.dataset.code], 80, 32, el.dataset.code); });
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

/* ---------- 資訊（公司資料、營收、EPS、股利、公告、新聞） ---------- */
const infoState = { seq: 0, cache: {} };
const icard = (title, body, extra = '') => `<div class="icard ${extra}"><div class="icard-h">${title}</div><div class="icard-b">${body}</div></div>`;
const kvTable = (rows) => `<table class="kv">${rows.filter(([, v]) => v != null && v !== '' && v !== 'null' && !/^（?）?$/.test(String(v)) && v !== '／').map(([k, v]) => `<tr><th>${esc(k)}</th><td>${/^https?:\/\//.test(v) ? `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(v)}</a>` : esc(v)}</td></tr>`).join('')}</table>`;
function ibars(items, fmt, opt = {}) { // 簡易長條圖：items = [{label, a, b?}]
  const vals = items.flatMap((x) => [x.a, x.b]).filter((v) => v != null), mx = Math.max(1e-9, ...vals.map(Math.abs));
  return `<div class="ibars">${items.map((x) => `<div class="ibar"><div class="ibar-v">${x.a != null ? fmt(x.a) : '-'}</div><div class="ibar-c">
      ${x.b != null ? `<i class="est" style="height:${(Math.abs(x.b) / mx) * 100}%" title="${opt.bLabel || ''} ${fmt(x.b)}"></i>` : ''}
      <i class="${(x.a ?? 0) >= 0 ? 'pos' : 'neg'}" style="height:${(Math.abs(x.a ?? 0) / mx) * 100}%"></i></div><div class="ibar-l">${esc(x.label)}</div></div>`).join('')}</div>
    ${opt.legend ? `<div class="ilegend">${opt.legend}</div>` : ''}`;
}
// 個股數據分頁（概覽／財務／股利／公司）：資訊頁和右側「數據」欄共用
function infoSections(d) {
  const tw = d.market === 'tw', q = state.quotes[d.code], P = { ov: [], fin: [], div: [], co: [] };
  let cur = 'ov'; const L = { push: (h) => P[cur].push(h) }, sec = (x) => { cur = x; };
  sec('ov');
  if (tw) {
    const v = d.valuation || {}, r = d.revenue;
    L.push(icard('關鍵數據', `<div class="stat-grid">
      ${[['本益比', v.pe ? fmtP(v.pe) : '-'], ['殖利率', v.yield != null ? fmtP(v.yield) + '%' : '-'], ['股價淨值比', v.pb ? fmtP(v.pb) : '-'], ['現價', fmtP(q?.price)]].map(([k, x]) => `<div><span>${k}</span><b class="num">${x}</b></div>`).join('')}</div>
      <div class="hint">資料日期 ${esc(v.date || '-')}（證交所／櫃買中心）</div>`));
    if (r) L.push(icard(`月營收　<span class="muted small">${esc(r.month)}　${esc(r.industry || '')}</span>`, `<div class="stat-grid">
      <div><span>當月營收</span><b class="num">${fmtVol(r.cur * 1000)}</b></div>
      <div><span>月增率</span><b class="num ${cls(r.mom)}">${sign(r.mom)}${fmtP(r.mom)}%</b></div>
      <div><span>年增率</span><b class="num ${cls(r.yoy)}">${sign(r.yoy)}${fmtP(r.yoy)}%</b></div>
      <div><span>今年累計</span><b class="num">${fmtVol(r.ytd * 1000)}</b></div>
      <div><span>累計年增</span><b class="num ${cls(r.ytdYoy)}">${sign(r.ytdYoy)}${fmtP(r.ytdYoy)}%</b></div>
      <div><span>去年同月</span><b class="num">${fmtVol(r.lastYear * 1000)}</b></div></div>
      ${r.note && r.note !== '-' ? `<div class="hint">公司說明：${esc(r.note)}</div>` : ''}`));
  } else {
    const st = d.stats || [], grid = (rows) => `<div class="stat-grid">${rows.filter(([, v]) => v != null && v !== 'None – None' && v !== ' – ').map(([k, v]) => `<div><span>${esc(k)}</span><b class="num">${esc(v)}</b></div>`).join('')}</div>`;
    L.push(icard('關鍵數據', [['估值', st.slice(0, 8)], ['獲利能力', st.slice(8, 14)], ['財務狀況', st.slice(14)]]
      .filter(([, r]) => r.some(([, v]) => v != null)).map(([h, r]) => `<div class="stat-group"><div class="stat-group-h">${h}</div>${grid(r)}</div>`).join('')));
    const a = d.analyst || {};
    if (a.target) {
      const pos = a.high > a.low ? Math.min(100, Math.max(0, ((a.price - a.low) / (a.high - a.low)) * 100)) : 50, up = ((a.target - a.price) / a.price) * 100;
      const REC = { strong_buy: '強力買進', buy: '買進', hold: '持有', underperform: '表現落後', sell: '賣出' };
      L.push(icard('分析師目標價', `<div class="stat-grid"><div><span>平均目標價</span><b class="num">${fmtP(a.target)}</b></div><div><span>距現價</span><b class="num ${cls(up)}">${sign(up)}${up.toFixed(1)}%</b></div><div><span>評等</span><b>${esc(REC[a.rec] || a.rec || '-')}</b></div><div><span>分析師人數</span><b class="num">${a.count ?? '-'}</b></div></div>
        <div class="trange"><span class="num">${fmtP(a.low)}</span><div class="trange-bar"><i style="left:${pos}%"></i></div><span class="num">${fmtP(a.high)}</span></div><div class="hint">白點是目前股價在目標價區間（最低～最高）的位置</div>`));
    }
    if ((d.events || []).some(([, v]) => v)) L.push(icard('重要日期', kvTable(d.events)));
  }
  sec('fin');
  if ((d.eps || []).length) L.push(icard('每季 EPS（實際 vs 預估）', ibars(d.eps.map((e) => ({ label: e.q, a: e.actual, b: e.estimate })), (v) => fmtP(v), { bLabel: '預估', legend: '<i class="pos"></i>實際　<i class="est"></i>市場預估' })));
  if ((d.financials || []).length) L.push(icard(`年度營收與淨利　<span class="muted small">${tw ? '新台幣' : '美元'}</span>`, ibars(d.financials.map((f) => ({ label: String(f.year), a: f.revenue, b: f.earnings })), fmtVol, { legend: '<i class="pos"></i>營收　<i class="est"></i>淨利' })));
  sec('div');
  if ((d.dividends || []).length) {
    const byYear = {}; d.dividends.forEach((x) => { const y = x.date.slice(0, 4); byYear[y] = (byYear[y] || 0) + x.amount; });
    const years = Object.keys(byYear).sort().slice(-8), l = d.dividends.slice(0, 12);
    let rows = ''; for (let i = 0; i < l.length; i += 2) rows += `<tr><td class="l num">${l[i].date}</td><td class="num">${fmtP(l[i].amount, 3)}</td><td class="l num">${l[i + 1]?.date || ''}</td><td class="num">${l[i + 1] ? fmtP(l[i + 1].amount, 3) : ''}</td></tr>`;
    L.push(icard('股利歷史（現金，每年合計）', ibars(years.map((y) => ({ label: y, a: byYear[y] })), (v) => fmtP(v, v < 10 ? 2 : 1)) +
      `<table class="tbl mini"><thead><tr><th class="l">除息日</th><th>每股股利</th><th class="l">除息日</th><th>每股股利</th></tr></thead><tbody>${rows}</tbody></table>`));
  }
  sec('co');
  if (tw) L.push(icard('重大訊息（近期）', (d.announcements || []).length ? d.announcements.map((a) => `<details class="ann"><summary><span class="muted num">${esc(a.date)} ${a.time.slice(0, 2)}:${a.time.slice(2, 4)}</span>　${esc(a.title)}</summary><pre>${esc(a.desc)}</pre></details>`).join('') : '<div class="empty" style="padding:10px">最近幾天沒有重大訊息</div>'));
  L.push(icard('公司資料', kvTable(d.profile || []) + (d.officers?.length ? `<div class="sub-h">主要經營團隊</div>${kvTable(d.officers)}` : '') + (d.summary ? `<div class="sub-h">業務簡介</div>${d.summary_zh ? `<p class="summary">${esc(d.summary_zh)}</p><details class="orig-sum"><summary>英文原文</summary><p class="summary">${esc(d.summary)}</p></details>` : `<p class="summary">${esc(d.summary)}</p>`}` : '')));
  if (!P.div.length) P.div.push(icard('股利歷史', '<div class="empty" style="padding:10px">沒有配息紀錄</div>'));
  if (!P.fin.length) P.fin.push(icard('財務', '<div class="empty" style="padding:10px">沒有財務資料</div>'));
  const TABS = [['ov', '概覽'], ['fin', '財務'], ['div', '股利'], ['co', tw ? '公司與公告' : '公司資料']];
  return { P, TABS };
}
PAGES.news = {
  async load(force) {
    const code = state.code, idx = code === 't00' || isFut(code) || code.includes('^') || code.startsWith('Y.') || code.startsWith('FX.');
    $('#infoTitle').textContent = idx ? '資訊' : `${nameOf(code)}　${showCode(code)}`;
    $('#infoSub').textContent = idx ? '請先在自選清單選一檔個股' : '公司資料、營收、EPS、股利、公告與新聞';
    const seq = ++infoState.seq;
    if (idx) { $('#infoBody').innerHTML = '<div class="info-col"><div class="empty">指數沒有公司資訊，請先選擇個股</div></div><div class="info-col">' + icard('市場快訊', '<div id="infoMarket"><div class="empty">載入中…</div></div>', 'flush') + '</div>'; this.market(); return; }
    if (!infoState.cache[code] || force) {
      $('#infoBody').innerHTML = '<div class="empty">載入個股資訊…（第一次需要幾秒）</div>';
      try { infoState.cache[code] = await api('/api/info?code=' + encodeURIComponent(code) + TR); } catch (e) { $('#infoBody').innerHTML = `<div class="empty">載入失敗：${esc(e.message)}</div>`; return; }
    }
    if (seq !== infoState.seq || state.view !== 'news') return;
    this.render(infoState.cache[code]);
    this.market();
  },
  render(d) {
    // 依分頁收集卡片：概覽／財務／股利／公司；右欄固定放新聞
    const tw = d.market === 'tw', R = [], { P, TABS } = infoSections(d);
    if (!TABS.some(([k]) => k === infoState.tab)) infoState.tab = 'ov';
    const nNews = (d.news || []).length;
    const newsTabs = `<div class="itabs" id="infoNewsTabs"><button data-nt="stock" class="${infoState.ntab !== 'mkt' ? 'on' : ''}">個股新聞 <span class="muted small">${nNews}</span></button><button data-nt="mkt" class="${infoState.ntab === 'mkt' ? 'on' : ''}">市場快訊</button></div>`;
    R.push(icard(newsTabs, `<div class="ipane" data-np="stock" ${infoState.ntab === 'mkt' ? 'hidden' : ''}>${nNews ? d.news.map(newsItem).join('') : '<div class="empty">沒有相關新聞</div>'}</div>
      <div class="ipane" id="infoMarket" data-np="mkt" ${infoState.ntab === 'mkt' ? '' : 'hidden'}><div class="empty">載入中…</div></div>`, 'flush'));
    $('#infoBody').innerHTML = `<div class="info-col"><div class="itabs" id="infoTabs">${TABS.map(([k, n]) => `<button data-it="${k}" class="${infoState.tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      ${TABS.map(([k]) => `<div class="ipane info-col" data-ip="${k}" ${infoState.tab === k ? '' : 'hidden'}>${P[k].join('')}</div>`).join('')}</div>
      <div class="info-col">${R.join('')}</div>`;
  },
  async market() {
    const cat = state.mkt === 'tw' ? '台股' : '國際股';
    const m = await api('/api/news').catch(() => []);
    const list = m.filter((n) => n.cat === cat).slice(0, 30);
    const box = $('#infoMarket'); if (box) box.innerHTML = list.length ? list.map(newsItem).join('') : '<div class="empty">沒有快訊</div>';
  },
};
$('#newsRefresh').addEventListener('click', () => PAGES.news.load(true));
$('#infoBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-it]'), n = e.target.closest('[data-nt]');
  if (t) { infoState.tab = t.dataset.it; $$('#infoTabs button').forEach((b) => b.classList.toggle('on', b === t)); $$('#infoBody [data-ip]').forEach((p) => (p.hidden = p.dataset.ip !== infoState.tab)); }
  if (n) { infoState.ntab = n.dataset.nt; $$('#infoNewsTabs button').forEach((b) => b.classList.toggle('on', b === n)); $$('#infoBody [data-np]').forEach((p) => (p.hidden = p.dataset.np !== infoState.ntab)); }
});

/* ---------- 日曆（週檢視） ---------- */
const FLAG = { 'United States': ['美', '#2f6fd6'], China: ['中', '#d63c3c'], Japan: ['日', '#c2185b'], 'Euro Zone': ['歐', '#3949ab'], Germany: ['德', '#5d4037'], 'United Kingdom': ['英', '#6a1b9a'], France: ['法', '#1565c0'], Italy: ['義', '#2e7d32'], Spain: ['西', '#ef6c00'], Canada: ['加', '#c62828'], Australia: ['澳', '#00838f'], 'New Zealand': ['紐', '#37474f'], 'South Korea': ['韓', '#455a64'], India: ['印', '#f57c00'], Brazil: ['巴', '#388e3c'], Russia: ['俄', '#546e7a'], 'South Africa': ['南', '#827717'], Switzerland: ['瑞', '#b71c1c'] };
const flagDot = (c) => { const f = FLAG[c] || ['?', '#555c6b']; return `<span class="ic" style="background:${f[1]}">${f[0]}</span>`; };
const CAL_COUNTRIES = ['United States', 'China', 'Japan', 'Euro Zone', 'United Kingdom', 'Germany', 'South Korea', 'Australia', 'Canada'];
const COUNTRY_ZH_FE = { 'United States': '美國', China: '中國', Japan: '日本', 'Euro Zone': '歐元區', 'United Kingdom': '英國', Germany: '德國', 'South Korea': '南韓', Australia: '澳洲', Canada: '加拿大' };
const calState = { week: null, month: null, tab: { tw: 'focus', us: 'focus' }, cache: {}, countries: store.get('tw.calCountries', { tw: ['United States', 'China', 'Japan'], us: ['United States'] }) };
const ymdLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const weekStart = (d) => { const x = new Date(d); x.setDate(x.getDate() - x.getDay()); x.setHours(0, 0, 0, 0); return x; };
const hashColor = (s) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360; return `hsl(${h} 55% 45%)`; };
PAGES.calendar = {
  async load() {
    if (!calState.week) { calState.week = weekStart(twNow()); calState.month = new Date(calState.week.getFullYear(), twNow().getMonth(), 1); }
    this.sidebar();
    const key = state.mkt + ymdLocal(calState.week);
    if (!calState.cache[key]) {
      $('#calWeek').innerHTML = '<div class="empty" style="grid-column:1/-1">載入本週日曆…（第一次約需 10 秒）</div>';
      try { calState.cache[key] = await api(`/api/calweek?start=${ymdLocal(calState.week)}&mkt=${state.mkt}`); }
      catch (e) { $('#calWeek').innerHTML = `<div class="empty" style="grid-column:1/-1">載入失敗：${esc(e.message)}</div>`; return; }
    }
    if (state.view !== 'calendar' || key !== state.mkt + ymdLocal(calState.week)) return;
    this.render(calState.cache[key]);
  },
  tabs() { return state.mkt === 'us' ? [['focus', '本週焦點'], ['earn', '業績'], ['econ', '財經'], ['div', '權息'], ['hol', '休市']] : [['focus', '本週焦點'], ['econ', '財經'], ['div', '權息'], ['hol', '休市']]; },
  sidebar() {
    const m = calState.month, ws = ymdLocal(calState.week), today = ymdLocal(twNow());
    $('#mcalTitle').textContent = `${m.getFullYear()}/${String(m.getMonth() + 1).padStart(2, '0')}`;
    const start = weekStart(m); let h = ['日', '一', '二', '三', '四', '五', '六'].map((x) => `<div class="h">${x}</div>`).join('');
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i); const s = ymdLocal(d), inWk = ymdLocal(weekStart(d)) === ws;
      h += `<div class="d ${d.getMonth() !== m.getMonth() ? 'out' : ''} ${inWk ? 'wk' : ''} ${inWk && d.getDay() === 0 ? 'first' : ''} ${inWk && d.getDay() === 6 ? 'last' : ''} ${s === today ? 'today' : ''}" data-d="${s}">${d.getDate()}</div>`;
      if (i >= 34 && d.getDay() === 6 && d.getMonth() !== m.getMonth()) break;
    }
    $('#mcal').innerHTML = h;
    const sel = calState.countries[state.mkt];
    $('#calCountries').innerHTML = CAL_COUNTRIES.map((c) => `<label class="chk"><input type="checkbox" data-c="${c}" ${sel.includes(c) ? 'checked' : ''}> ${COUNTRY_ZH_FE[c]}</label>`).join('');
    const t = calState.tab[state.mkt]; if (!this.tabs().some(([k]) => k === t)) calState.tab[state.mkt] = 'focus';
    $('#calTabs').innerHTML = this.tabs().map(([k, n]) => `<button data-ct="${k}" class="${k === calState.tab[state.mkt] ? 'active' : ''}">${n}</button>`).join('');
  },
  filter(evs) {
    const tab = calState.tab[state.mkt], mine = $('#calMine').checked, sel = calState.countries[state.mkt], tw = state.mkt === 'tw';
    const inWatch = (e) => state.watch.includes(e.code);
    return evs.filter((e) => {
      if (e.type === 'econ') return (tab === 'focus' || tab === 'econ') && sel.includes(e.country);
      if (e.type === 'hol') return tab === 'focus' || tab === 'hol';
      if (e.type === 'earn') { if (tab !== 'focus' && tab !== 'earn') return false; if (mine) return inWatch(e); return tab === 'earn' || inWatch(e) || e.cap >= 5e10; }
      if (e.type === 'div') { if (tab !== 'focus' && tab !== 'div') return false; if (mine) return inWatch(e); return tab === 'div' || inWatch(e) || tw; }
      return false;
    }).sort((a, b) => (b.type === 'hol') - (a.type === 'hol') || inWatch(b) - inWatch(a) || String(a.time || '99').localeCompare(String(b.time || '99')) || (b.cap || 0) - (a.cap || 0));
  },
  card(e) {
    const mine = e.code && state.watch.includes(e.code), mineTag = mine ? '<span class="tg mine">自選</span>' : '';
    if (e.type === 'econ') {
      const res = [e.actual && `實際 ${e.actual}`, e.consensus && `預期 ${e.consensus}`, e.previous && `前值 ${e.previous}`].filter(Boolean).join('　');
      return `<div class="ev" title="${esc(res)}">${flagDot(e.country)}<div class="tx"><div class="tt">${esc(e.countryZh)} ${esc(e.title)}</div><div class="sb">${esc(e.time || '')}${e.actual ? `<span class="up">　實際 ${esc(e.actual)}</span>` : ''}</div></div></div>`;
    }
    if (e.type === 'hol') return `<div class="ev hol"><span class="ic">休</span><div class="tx"><div class="tt">${esc(e.title)}</div><div class="sb">${esc(e.desc || '')}</div></div></div>`;
    const sym = e.symbol || '', ic = `<span class="ic" style="background:${hashColor(sym)}">${esc(sym.replace(/^\d+/, (m) => m.slice(0, 2)).slice(0, 2))}</span>`;
    const name = state.mkt === 'tw' ? `${sym} ${e.title}` : `${sym} ${e.title || ''}`;
    if (e.type === 'earn') {
      const ses = e.session === 'pre' ? '<span class="tg pre">☀ 盤前</span>' : e.session === 'post' ? '<span class="tg post">☾ 盤後</span>' : '';
      return `<div class="ev click" data-code="${esc(e.code)}" title="預估 EPS ${esc(e.eps || '-')}／去年同期 ${esc(e.lastEps || '-')}"><span>${ic}</span><div class="tx"><div class="tt">${esc(name)}</div><div class="sb"><span class="tg">US</span>${ses}${mineTag}${e.eps ? `預估 ${esc(e.eps)}` : ''}</div></div></div>`;
    }
    const amt = state.mkt === 'tw' ? `除${esc(e.kind || '息')}${e.amount ? ' ' + fmtP(e.amount, 4).replace(/0+$/, '').replace(/\.$/, '') + ' 元' : ''}${e.stock ? '　配股 ' + esc(e.stock) : ''}` : `除息 $${e.amount ?? '-'}${e.pay ? '　發放 ' + esc(e.pay) : ''}`;
    return `<div class="ev click" data-code="${esc(e.code)}"><span>${ic}</span><div class="tx"><div class="tt">${esc(name)}</div><div class="sb"><span class="tg">${state.mkt === 'tw' ? 'TW' : 'US'}</span>${mineTag}${amt}</div></div></div>`;
  },
  render(d) {
    const today = ymdLocal(twNow()), W = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'], LIMIT = 80;
    $('#calWeek').innerHTML = d.days.map((day, i) => {
      const evs = this.filter(d.events[day] || []), shown = evs.slice(0, LIMIT);
      return `<div class="wcol ${day === today ? 'today' : ''}"><div class="wcol-h">${W[i]} <span class="dt num">${+day.slice(5, 7)}/${day.slice(8)}</span><span class="cnt">${evs.length || ''}</span></div>
        <div class="wcol-b">${shown.map((e) => this.card(e)).join('') || '<div class="more-ev">沒有事件</div>'}${evs.length > LIMIT ? `<div class="more-ev">還有 ${evs.length - LIMIT} 筆（可勾選「只看自選」或切到單一分類）</div>` : ''}</div></div>`;
    }).join('');
    $('#calUpd').textContent = `${d.days[0].slice(5).replace('-', '/')} – ${d.days[6].slice(5).replace('-', '/')}　台北時間`;
  },
};
$('#mcal').addEventListener('click', (e) => { const x = e.target.closest('[data-d]'); if (!x) return; const d = new Date(x.dataset.d + 'T00:00:00'); calState.week = weekStart(d); calState.month = new Date(d.getFullYear(), d.getMonth(), 1); PAGES.calendar.load(); });
$('#mcalPrev').addEventListener('click', () => { calState.month = new Date(calState.month.getFullYear(), calState.month.getMonth() - 1, 1); PAGES.calendar.sidebar(); });
$('#mcalNext').addEventListener('click', () => { calState.month = new Date(calState.month.getFullYear(), calState.month.getMonth() + 1, 1); PAGES.calendar.sidebar(); });
$('#calToday').addEventListener('click', () => { calState.week = null; PAGES.calendar.load(); });
$('#calTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-ct]'); if (!b) return; calState.tab[state.mkt] = b.dataset.ct; PAGES.calendar.sidebar(); PAGES.calendar.load(); });
$('#calMine').addEventListener('change', () => PAGES.calendar.load());
$('#calCountries').addEventListener('change', (e) => {
  const c = e.target.dataset.c; if (!c) return; const a = calState.countries[state.mkt];
  e.target.checked ? a.includes(c) || a.push(c) : a.splice(a.indexOf(c), 1);
  store.set('tw.calCountries', calState.countries); PAGES.calendar.load();
});
$('#calWeek').addEventListener('click', (e) => { const x = e.target.closest('.ev.click[data-code]'); if (x) { selectCode(x.dataset.code); setView('chart'); } });

/* ---------- 模擬倉 ---------- */
PAGES.paper = {
  load() { loadPaper(); if (state.sideTab !== 'trade') switchSideTab('trade'); },
  tick() { this.render(); },
  render() {
    $$('#paperAcct button').forEach((b) => b.classList.toggle('active', b.dataset.acct === state.paperAcct));
    const ai = state.paperAcct === 'ai';
    if (state.view !== 'paper' || !(ai ? state.paperAI : state.paper)) return;
    const a = ai ? state.paperAI : state.paper, ccy = state.mkt === 'tw' ? 'TWD' : 'USD', mine = (c) => ccyOf(c) === ccy, dp = ccy === 'TWD' ? 0 : 2;
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
      <div class="sec-title"><b>持倉</b><span>${ai ? 'AI 自動管理，點一列切到該股票' : '點一列切到該股票，按「賣出」帶入下單'}</span></div>
      ${pos.length ? `<table class="tbl"><thead><tr><th class="l">名稱</th><th>數量</th><th>均價</th><th>現價</th><th>市值</th><th>今日</th><th>未實現損益</th><th>報酬率</th><th></th></tr></thead><tbody>
        ${pos.map((p) => `<tr data-code="${esc(p.code)}"><td class="l">${nmCell(p.code, p.name)}</td><td class="num">${fmtInt(p.qty)}${isOpt(p.code) ? ' 口' : ''}</td><td class="num">${fmtP(p.avg)}</td>
          <td class="num ${cls(p.px - (state.quotes[p.code]?.prev ?? p.px))}">${fmtP(p.px)}</td><td class="num">${fmtP(p.mv)}</td><td class="num ${cls(p.dayChg)}">${sign(p.dayChg)}${fmtP(p.dayChg)}</td>
          <td class="num ${cls(p.pnl)}">${sign(p.pnl)}${fmtP(p.pnl)}</td><td class="num ${cls(p.pnl)}">${sign(p.pct)}${p.pct.toFixed(2)}%</td><td>${ai ? '' : `<button class="act" data-sell="${esc(p.code)}" data-qty="${p.qty}">賣出</button>`}</td></tr>`).join('')}</tbody></table>`
        : `<div class="empty">${ai ? 'AI 還沒有持股：開盤時會依「AI 選股」頁的策略自動買進。' : '還沒有持股。在右側「模擬下單」買進看看。'}</div>`}
      <div class="sec-title"><b>委託中</b></div>
      ${pending.length ? `<table class="tbl"><thead><tr><th class="l">時間</th><th class="l">名稱</th><th>買賣</th><th>限價</th><th>數量</th><th>現價</th><th></th></tr></thead><tbody>
        ${pending.map((o) => `<tr data-code="${esc(o.code)}"><td class="l num">${dt(o.created)}</td><td class="l">${nmCell(o.code, o.name)}</td><td>${side(o.side)}</td><td class="num">${fmtP(o.limit)}</td><td class="num">${fmtInt(o.qty)}</td><td class="num">${fmtP(state.quotes[o.code]?.price)}</td><td>${ai ? '' : `<button class="act" data-cancel="${o.id}">取消</button>`}</td></tr>`).join('')}</tbody></table>`
        : '<div class="empty">沒有委託中的單</div>'}
      <div class="sec-title"><b>交易紀錄</b></div>
      ${done.length ? `<table class="tbl"><thead><tr><th class="l">時間</th><th class="l">名稱</th><th>買賣</th><th>類型</th><th>數量</th><th>成交價</th><th>手續費+稅</th><th>損益</th><th>狀態</th></tr></thead><tbody>
        ${done.map((o) => `<tr data-code="${esc(o.code)}"><td class="l num">${dt(o.doneAt || o.created)}</td><td class="l">${nmCell(o.code, o.name)}</td><td>${side(o.side)}</td><td>${o.type === 'market' ? '市價' : '限價 ' + fmtP(o.limit)}</td><td class="num">${fmtInt(o.qty)}</td>
          <td class="num">${o.fillPrice != null ? fmtP(o.fillPrice) : '--'}</td><td class="num">${o.fee != null ? fmtP((o.fee || 0) + (o.tax || 0)) : '--'}</td>
          <td class="num ${cls(o.pnl || 0)}">${o.pnl != null ? sign(o.pnl) + fmtP(o.pnl) : ''}</td><td class="${o.status === 'rejected' ? 'down' : ''}">${stMap[o.status]}${o.reason ? '：' + esc(o.reason) : ''}</td></tr>${o.note ? `<tr class="note-row"><td></td><td class="l muted small" colspan="8">理由：${esc(o.note)}</td></tr>` : ''}`).join('')}</tbody></table>`
        : '<div class="empty">還沒有交易紀錄</div>'}
      ${ai ? `<div class="sec-title"><b>AI 動作紀錄</b><span>策略與每日建議在「AI 選股」頁</span></div>${(a.log || []).length ? `<table class="tbl"><tbody>${a.log.filter((x) => x.mkt === state.mkt).slice(0, 60).map((x) => `<tr><td class="l num" style="width:110px">${dt(x.t)}</td><td class="l">${esc(x.msg)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">還沒有紀錄</div>'}` : ''}`;
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
$('#paperAcct').addEventListener('click', (e) => {
  const b = e.target.closest('[data-acct]'); if (!b) return;
  state.paperAcct = b.dataset.acct; store.set('tw.paperAcct', state.paperAcct); PAGES.paper.render(); loadPaper();
});
$('#paperReset').addEventListener('click', () => {
  const acct = state.paperAcct;
  openModal(acct === 'ai' ? '重設 AI 模擬帳戶' : '重設模擬帳戶', `<div class="hint" style="margin:0 0 12px">會清空${acct === 'ai' ? ' <b>AI 模擬倉</b>' : ''}<b>台股與美股</b>的所有持股、委託與紀錄。${acct === 'ai' ? '下次開盤 AI 會重新建倉。' : ''}</div>
    <div class="fld"><label>台股起始資金 (TWD)</label><input id="rsT" type="number" value="10000000"></div>
    <div class="fld"><label>美股起始資金 (USD)</label><input id="rsU" type="number" value="30000"></div>`,
    [{ label: '取消' }, { label: '重設', cls: 'danger', act: async (m) => { const r = await post('/api/paper/reset', { acct, TWD: +m.querySelector('#rsT').value, USD: +m.querySelector('#rsU').value }); toast(r.msg); loadPaper(); } }]);
});

appInit();
