/* 進階功能：策略（條件提醒、自動模擬下單、歷史回測）、選股器、熱力圖、多圖同框 */
let OPDEF = null; // 指標目錄（從後端 /api/strategy/operands 載入）
async function loadOperands() { if (!OPDEF) OPDEF = await api('/api/strategy/operands'); return OPDEF; }

/* ---------- 條件編輯器（策略與選股共用） ---------- */
function ruleEditor(el, group, onChange) {
  group.mode = group.mode || 'all'; group.rules = group.rules || [];
  const opSel = (o) => `<select class="tsel" data-f="k">${OPDEF.operands.map((d) => `<option value="${d.k}" ${d.k === o.k ? 'selected' : ''}>${esc(LANG === 'en' ? d.en || d.label : d.label)}</option>`).join('')}</select>${
    OPDEF.operands.find((d) => d.k === o.k)?.n !== undefined ? `<input class="tin num-in" data-f="n" type="number" min="1" value="${o.n ?? OPDEF.operands.find((d) => d.k === o.k).n}" title="週期 N">` : ''}${
    o.k === 'value' ? `<input class="tin num-in w" data-f="v" type="number" step="any" value="${o.v ?? 0}" title="數值">` : ''}`;
  const render = () => {
    el.innerHTML = `<div class="re-head">符合 <select class="tsel" data-mode><option value="all" ${group.mode === 'all' ? 'selected' : ''}>全部條件</option><option value="any" ${group.mode === 'any' ? 'selected' : ''}>任一條件</option></select></div>
      ${group.rules.map((r, i) => `<div class="re-row" data-i="${i}"><span class="re-a">${opSel(r.a)}</span><select class="tsel re-op" data-f="op">${Object.entries(OPDEF.ops).map(([k, n]) => `<option value="${k}" ${k === r.op ? 'selected' : ''}>${n}</option>`).join('')}</select><span class="re-b">${opSel(r.b)}</span><button class="icon-btn" data-del title="刪除條件">✕</button></div>`).join('') || '<div class="muted small" style="padding:6px 0">還沒有條件</div>'}
      <button class="btn-ghost small" data-add>＋ 新增條件</button>`;
  };
  el.onchange = el.oninput = (e) => {
    if (e.target.matches('[data-mode]')) { group.mode = e.target.value; onChange?.(); return; }
    const row = e.target.closest('.re-row'); if (!row) return;
    const r = group.rules[+row.dataset.i], side = e.target.closest('.re-a') ? r.a : e.target.closest('.re-b') ? r.b : null, f = e.target.dataset.f;
    if (f === 'op') r.op = e.target.value;
    else if (side && f === 'k') { const d = OPDEF.operands.find((x) => x.k === e.target.value); Object.keys(side).forEach((k) => delete side[k]); side.k = d.k; if (d.n !== undefined) side.n = d.n; if (d.k === 'value') side.v = d.v; if (e.type === 'change') render(); }
    else if (side && (f === 'n' || f === 'v')) side[f] = +e.target.value;
    onChange?.();
  };
  el.onclick = (e) => {
    if (e.target.closest('[data-add]')) { group.rules.push({ a: { k: 'close' }, op: 'gt', b: { k: 'ma', n: 20 } }); render(); onChange?.(); }
    const del = e.target.closest('[data-del]'); if (del) { group.rules.splice(+del.closest('.re-row').dataset.i, 1); render(); onChange?.(); }
  };
  render();
}
const R = (a, op, b) => ({ a, op, b });
const C = (k, n) => (n ? { k, n } : { k }), V = (v) => ({ k: 'value', v });

/* ---------- 策略 ---------- */
// 依 10 年日 K 回測調整過的範本（研究見 README「策略研究」）：research 欄位會顯示在範本說明裡
const DIP_TW = [R(C('chg_pct'), 'le', V(-3)), R(C('dist_hh', 20), 'le', V(-10)), R(C('rel_chg'), 'le', V(-4))];
const STRAT_TEMPLATES = [
  { name: '★ 台股逢低（只在大盤修正時）', desc: '單日跌 3%、距 20 日高點跌 10%、比 0050 多跌 4%，且大盤處於修正；持有 60 天或跌 15% 停損', mkt: 'tw', benchmark: '0050',
    entry: { mode: 'all', rules: [...DIP_TW, R(C('regime'), 'lt', V(1))] }, exit: { mode: 'any', rules: [] }, stop_loss: 15, max_hold: 60,
    research: '10 年、stock-watch 的 18 檔台股 AI／半導體股：20 天勝率 71%（任意一天 55%），比任意一天多 +6.5%；最近 4 個月崩跌期平均 −5.5%（原規則 −9.9%）' },
  { name: '★ 美股強勢突破（類股站穩時）', desc: '收盤創 250 日新高、量 ≥ 20 日均量 1.5 倍，且 SOXX 在 50 日線上；跌破 MA20 出場（至少 5 天、最多 120 天）', mkt: 'us', benchmark: 'US.SOXX',
    entry: { mode: 'all', rules: [R(C('close'), 'gt', C('hh', 250)), R(C('vol_ratio', 20), 'ge', V(1.5)), R(C('bench_ma_pct', 50), 'gt', V(0))] }, exit: { mode: 'any', rules: [R(C('close'), 'lt', C('ma', 20))] }, stop_loss: 0, min_hold: 5, max_hold: 120,
    research: '10 年、15 檔美股 AI／半導體股：20 天勝率 63%（任意一天 56%），多 +4.2%，最大回撤約 −7.5%；原本的美股逢低規則幾乎沒有優勢（+0.4%）' },
  { name: '★ 台股強勢突破', desc: '收盤創 250 日新高、量 ≥ 20 日均量 1.5 倍；跌破 MA20 出場（至少 5 天、最多 120 天）', mkt: 'tw', benchmark: '0050',
    entry: { mode: 'all', rules: [R(C('close'), 'gt', C('hh', 250)), R(C('vol_ratio', 20), 'ge', V(1.5))] }, exit: { mode: 'any', rules: [R(C('close'), 'lt', C('ma', 20))] }, stop_loss: 0, min_hold: 5, max_hold: 120,
    research: '10 年、18 檔台股 AI／半導體股：20 天比任意一天多 +3.4%、60 天多 +7.9%，最大回撤約 −9%' },
  { name: '均線黃金交叉', desc: 'MA20 上穿 MA60 進場，下穿出場', entry: { mode: 'all', rules: [R(C('ma', 20), 'cross_up', C('ma', 60))] }, exit: { mode: 'any', rules: [R(C('ma', 20), 'cross_down', C('ma', 60))] }, stop_loss: 10 },
  { name: 'RSI 超賣反彈', desc: 'RSI 由下往上穿越 30 進場，大於 70 出場', entry: { mode: 'all', rules: [R(C('rsi', 14), 'cross_up', V(30))] }, exit: { mode: 'any', rules: [R(C('rsi', 14), 'gt', V(70))] }, stop_loss: 8 },
  { name: '布林下軌反彈', desc: '收盤由下往上穿越布林下軌進場，碰上軌出場', entry: { mode: 'all', rules: [R(C('close'), 'cross_up', C('boll_dn', 20))] }, exit: { mode: 'any', rules: [R(C('close'), 'gt', C('boll_up', 20))] }, stop_loss: 8 },
  { name: '量增突破 20 日高', desc: '收盤創 20 日新高且量比 > 1.5 進場，跌破 MA10 出場', entry: { mode: 'all', rules: [R(C('close'), 'gt', C('hh', 20)), R(C('vol_ratio', 5), 'gt', V(1.5))] }, exit: { mode: 'any', rules: [R(C('close'), 'cross_down', C('ma', 10))] }, stop_loss: 7 },
  { name: 'MACD 黃金交叉', desc: 'DIF 上穿 DEA 進場，下穿出場', entry: { mode: 'all', rules: [R(C('macd_dif'), 'cross_up', C('macd_dea'))] }, exit: { mode: 'any', rules: [R(C('macd_dif'), 'cross_down', C('macd_dea'))] }, stop_loss: 8 },
  { name: 'KD 低檔黃金交叉', desc: 'K 上穿 D 且 K < 30 進場，K 下穿 D 出場', entry: { mode: 'all', rules: [R(C('kd_k', 9), 'cross_up', C('kd_d', 9)), R(C('kd_k', 9), 'lt', V(30))] }, exit: { mode: 'any', rules: [R(C('kd_k', 9), 'cross_down', C('kd_d', 9))] }, stop_loss: 8 },
  { name: '海龜通道突破', desc: '收盤突破 55 日高點進場，跌破 20 日低點出場', entry: { mode: 'all', rules: [R(C('close'), 'gt', C('hh', 55))] }, exit: { mode: 'any', rules: [R(C('close'), 'lt', C('ll', 20))] }, stop_loss: 10 },
  { name: '均線多頭排列', desc: 'MA5 > MA20 > MA60 且收盤站上 MA5 進場，跌破 MA20 出場', entry: { mode: 'all', rules: [R(C('ma', 5), 'gt', C('ma', 20)), R(C('ma', 20), 'gt', C('ma', 60)), R(C('close'), 'cross_up', C('ma', 5))] }, exit: { mode: 'any', rules: [R(C('close'), 'cross_down', C('ma', 20))] }, stop_loss: 8 },
  { name: '趨勢跟隨＋移動停損', desc: 'ADX > 25 且 +DI 上穿 -DI 進場，從高點回落 8% 出場', entry: { mode: 'all', rules: [R(C('pdi', 14), 'cross_up', C('mdi', 14)), R(C('adx', 14), 'gt', V(25))] }, exit: { mode: 'any', rules: [] }, stop_loss: 0, trailing_stop: 8 },
  { name: '負乖離過大反彈', desc: '收盤低於 MA20 超過 10% 進場，回到 MA20 出場', entry: { mode: 'all', rules: [R(C('bias', 20), 'lt', V(-10))] }, exit: { mode: 'any', rules: [R(C('bias', 20), 'gt', V(0))] }, stop_loss: 10, max_hold: 20 },
  { name: '布林收斂後突破', desc: '布林帶寬 < 10% 且收盤突破上軌進場，跌破中軌出場', entry: { mode: 'all', rules: [R(C('boll_width', 20), 'lt', V(10)), R(C('close'), 'cross_up', C('boll_up', 20))] }, exit: { mode: 'any', rules: [R(C('close'), 'cross_down', C('boll_mid', 20))] }, stop_loss: 6 },
  { name: '跳空上漲續強', desc: '跳空上漲 > 2% 且量比 > 2 進場，持有 10 天或跌破 MA10 出場', entry: { mode: 'all', rules: [R(C('gap_pct'), 'gt', V(2)), R(C('vol_ratio', 5), 'gt', V(2))] }, exit: { mode: 'any', rules: [R(C('close'), 'cross_down', C('ma', 10))] }, stop_loss: 6, max_hold: 10 },
  { name: '連跌後反彈', desc: '連續下跌 5 天且 RSI < 30 進場，上漲 8% 或持有 10 天出場', entry: { mode: 'all', rules: [R(C('down_days'), 'ge', V(5)), R(C('rsi', 14), 'lt', V(30))] }, exit: { mode: 'any', rules: [] }, stop_loss: 8, take_profit: 8, max_hold: 10 },
  { name: '接近 52 週新高', desc: '距 250 日高點不到 3% 且站上 MA50 進場，移動停損 10%', entry: { mode: 'all', rules: [R(C('dist_hh', 250), 'gt', V(-3)), R(C('close'), 'gt', C('ma', 50))] }, exit: { mode: 'any', rules: [] }, stop_loss: 0, trailing_stop: 10 },
  { name: 'SAR 翻多', desc: '收盤由下往上穿越 SAR 進場，跌破 SAR 出場', entry: { mode: 'all', rules: [R(C('close'), 'cross_up', C('sar'))] }, exit: { mode: 'any', rules: [R(C('close'), 'cross_down', C('sar'))] }, stop_loss: 8 },
  { name: 'MFI 超賣＋OBV 轉強', desc: 'MFI < 20 且 OBV 站上均線進場，MFI > 80 出場', entry: { mode: 'all', rules: [R(C('mfi', 14), 'lt', V(20)), R(C('obv'), 'gt', C('obv_ma', 20))] }, exit: { mode: 'any', rules: [R(C('mfi', 14), 'gt', V(80))] }, stop_loss: 8 },
];
const stState = { list: [], cur: null, result: null, chart: null, years: 2, lastEvent: store.get('tw.lastEvent', 0) };
function newStrategy(tpl = {}) {
  return JSON.parse(JSON.stringify({ name: (LANG === 'en' && tpl.name ? I18N_EN[tpl.name] : tpl.name) || (LANG === 'en' ? 'My strategy' : '我的策略'), mkt: state.mkt, universe: state.watch.slice(0, 5), entry: tpl.entry || { mode: 'all', rules: [] },
    exit: tpl.exit || { mode: 'any', rules: [] }, stop_loss: tpl.stop_loss ?? 8, take_profit: tpl.take_profit ?? 0, trailing_stop: tpl.trailing_stop ?? 0, max_hold: tpl.max_hold ?? 0,
    min_hold: tpl.min_hold ?? 0, atr_stop: tpl.atr_stop ?? 0, cooldown: tpl.cooldown ?? 0, benchmark: tpl.mkt === state.mkt ? tpl.benchmark || '' : '', size_pct: 100, enabled: false, alert: true, auto_trade: false }));
}
PAGES.strategy = {
  async load() {
    await loadOperands();
    stState.list = await api('/api/strategies').catch(() => []);
    $('#stTemplates').innerHTML = STRAT_TEMPLATES.filter((t) => !t.mkt || t.mkt === state.mkt).map((t) => `<button class="preset" data-tpl="${STRAT_TEMPLATES.indexOf(t)}" title="${esc(t.desc + (t.research ? '\n\n' + t.research : ''))}"><b>${esc(t.name)}</b><small>${esc(t.desc)}</small>${t.research ? `<small class="tpl-research">📊 ${esc(t.research)}</small>` : ''}</button>`).join('');
    this.regime();
    this.renderList(); this.events();
    if (stState.cur && stState.cur.mkt !== state.mkt) stState.cur = null;
    if (!stState.cur) { const first = stState.list.find((x) => x.mkt === state.mkt); if (first) stState.cur = JSON.parse(JSON.stringify(first)); }
    this.renderEditor();
    // 網址 #view=strategy&tpl=0&bt=5：直接套用範本並回測（展示用）
    const hp = new URLSearchParams(location.hash.slice(1));
    if (hp.get('tpl') && !this.autoRan) {
      this.autoRan = true; stState.cur = newStrategy(STRAT_TEMPLATES[+hp.get('tpl')] || STRAT_TEMPLATES[0]); stState.years = +hp.get('bt') || 5;
      this.renderEditor(); this.run();
    }
  },
  async regime() {
    const r = await api('/api/regime?mkt=' + state.mkt).catch(() => null);
    let el = $('#stRegime');
    if (!el) { el = document.createElement('div'); el.id = 'stRegime'; el.className = 'st-regime'; $('#stList').before(el); }
    el.innerHTML = r?.regime == null ? '' : `<span class="dot ${r.regime ? 'up' : 'down'}"></span>市場環境：<b>${esc(r.label.split('（')[0])}</b><div class="muted small">${esc((r.label.match(/（(.+)）/) || [])[1] || '')}</div>`;
  },
  renderList() {
    const mine = stState.list.filter((x) => x.mkt === state.mkt);
    $('#stList').innerHTML = mine.length ? mine.map((x) => `<div class="st-item ${stState.cur?.id === x.id ? 'active' : ''}" data-id="${x.id}">
      <div class="st-item-h"><b>${esc(x.name)}</b><span class="flex1"></span>${x.enabled ? '<span class="tag buy">監控中</span>' : '<span class="tag">暫停</span>'}</div>
      <div class="muted small">${(x.universe || []).length} 檔　${x.alert ? '🔔 提醒' : ''} ${x.auto_trade ? '🤖 自動模擬下單' : ''}</div></div>`).join('') : `<div class="empty" style="padding:12px">還沒有${state.mkt === 'tw' ? '台股' : '美股'}策略</div>`;
  },
  async events() {
    const ev = await api('/api/strategy/events').catch(() => []);
    $('#stEvents').innerHTML = ev.filter((e) => (state.mkt === 'tw') === isTW(e.code)).slice(0, 30).map((e) => `<div class="st-ev" data-code="${esc(e.code)}"><span class="tag ${e.kind === 'entry' ? 'buy' : 'sell'}">${e.kind === 'entry' ? '進場' : '出場'}</span> <b>${esc(e.name)}</b> <span class="num">${fmtP(e.price)}</span><div class="muted small">${esc(e.strategy)}　${new Date(e.t * 1000).toLocaleString('zh-TW', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}${e.trade ? '　' + esc(e.trade) : ''}</div>${evStat(e)}</div>`).join('') || '<div class="muted small">還沒有訊號。啟用策略後，盤中每分鐘檢查一次。</div>';
  },
  renderEditor() {
    const el = $('#stEditor'), st = stState.cur;
    if (!st) { el.innerHTML = '<div class="empty">選擇左邊的策略、從範本建立，或按「＋ 新增」</div>'; return; }
    const ccy = st.mkt === 'tw' ? '台幣' : '美元';
    el.innerHTML = `<div class="st-form">
      <div class="st-row"><input class="tin st-name" id="stName" value="${esc(st.name)}" placeholder="策略名稱"><span class="tag ${st.mkt === 'tw' ? 'tw' : 'us'}">${st.mkt === 'tw' ? '台股' : '美股'}</span><span class="flex1"></span>
        <button class="btn sec" id="stCheck" title="不管是否開盤，立刻用最新資料檢查一次">立即檢查</button><button class="btn sec" id="stDel">刪除</button><button class="btn" id="stSave">儲存</button></div>
      <div class="st-card"><div class="st-card-h">股票池 <span class="muted small">最多 20 檔回測、30 檔監控</span></div>
        <div class="uni" id="stUni">${(st.universe || []).map((c) => `<span class="uchip">${esc(showCode(c))} ${esc(nameOf(c))}<button data-rm="${esc(c)}">✕</button></span>`).join('')}</div>
        <div class="st-row"><input class="tin" id="stAdd" placeholder="${st.mkt === 'tw' ? '輸入代號，例如 2330' : '輸入代號，例如 AAPL'}" style="width:180px"><button class="btn-ghost" id="stAddBtn">加入</button><button class="btn-ghost" id="stUseWatch">使用自選股</button><button class="btn-ghost" id="stClearUni">清空</button></div></div>
      <div class="st-grid2">
        <div class="st-card"><div class="st-card-h"><span class="tag buy">進場條件</span> 收盤時判斷，隔天開盤買進</div><div id="stEntry"></div></div>
        <div class="st-card"><div class="st-card-h"><span class="tag sell">出場條件</span> 任一觸發就賣出（可留空，只用停損停利）</div><div id="stExit"></div></div>
      </div>
      <div class="st-card"><div class="st-card-h">風險控管與資金</div><div class="st-fields">
        <label>停損 %<input class="tin" data-k="stop_loss" type="number" step="any" value="${st.stop_loss ?? 0}"></label>
        <label>停利 %<input class="tin" data-k="take_profit" type="number" step="any" value="${st.take_profit ?? 0}"></label>
        <label title="從進場後的最高價回落這麼多 % 就賣出，讓獲利奔跑">移動停損 %<input class="tin" data-k="trailing_stop" type="number" step="any" value="${st.trailing_stop ?? 0}"></label>
        <label>最長持有天數<input class="tin" data-k="max_hold" type="number" value="${st.max_hold ?? 0}"></label>
        <label>每次投入資金 %<input class="tin" data-k="size_pct" type="number" value="${st.size_pct ?? 100}"></label>
        <label title="進場價減掉 N 倍 ATR(14) 就停損：波動大的股票停損放寬、波動小的收緊">ATR 停損（倍）<input class="tin" data-k="atr_stop" type="number" step="any" value="${st.atr_stop ?? 0}"></label>
        <label title="持有未滿這麼多天，出場條件先不理會（停損仍有效）">最短持有天數<input class="tin" data-k="min_hold" type="number" value="${st.min_hold ?? 0}"></label>
        <label title="停損出場後，這麼多天內不再買同一檔，避免一直接刀">停損後冷卻天數<input class="tin" data-k="cooldown" type="number" value="${st.cooldown ?? 0}"></label>
        <label title="「比大盤」「市場環境」這類條件用哪一檔當大盤">比較大盤<select class="tin" data-s="benchmark">${(st.mkt === 'tw' ? [['', '0050（預設）'], ['t00', '加權指數'], ['00881', '00881 國泰台灣5G+'], ['0052', '0052 富邦科技']] : [['', 'SPY 標普 500（預設）'], ['US.QQQ', 'QQQ 那斯達克 100'], ['US.SOXX', 'SOXX 費城半導體'], ['US.SMH', 'SMH 半導體']]).map(([v, n]) => `<option value="${v}" ${(st.benchmark || '') === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
        <div class="muted small">0 代表不使用。回測時資金平均分給股票池每一檔。</div></div>
      <div class="st-card"><div class="st-card-h">監控與執行</div>
        <label class="chk big"><input type="checkbox" data-b="enabled" ${st.enabled ? 'checked' : ''}> 啟用策略（交易時段每分鐘檢查一次，網頁關掉也會繼續）</label>
        <label class="chk big"><input type="checkbox" data-b="alert" ${st.alert ? 'checked' : ''}> 觸發時推播提醒（Telegram／Discord／ntfy，到「設定」開啟）</label>
        <label class="chk big"><input type="checkbox" data-b="auto_trade" ${st.auto_trade ? 'checked' : ''}> 自動在模擬倉下單（進場買進、出場賣出，用模擬資金）</label></div>
      <div class="st-card"><div class="st-card-h">歷史回測 <span class="seg mini" id="stYears">${[1, 2, 3, 5, 10].map((y) => `<button data-y="${y}" class="${stState.years === y ? 'active' : ''}">${y} 年</button>`).join('')}</span>
        <label class="small muted">初始資金 <input class="tin" id="stCap" type="number" value="${st.mkt === 'tw' ? 10000000 : 30000}" style="width:110px"> ${ccy}</label><span class="flex1"></span><button class="btn" id="stRun">開始回測</button></div>
        <div id="stResult"><div class="muted small">回測使用日 K：收盤判斷訊號、隔天開盤成交，含手續費${st.mkt === 'tw' ? '與證交稅' : ''}。過去績效不代表未來。</div></div></div>
    </div>`;
    ruleEditor($('#stEntry'), st.entry, () => {});
    ruleEditor($('#stExit'), st.exit, () => {});
    if (stState.result?.sid === (st.id || 'new')) this.renderResult(stState.result.data);
  },
  async save() {
    const st = stState.cur; st.name = $('#stName').value.trim() || '我的策略';
    const r = await post('/api/strategies', st); if (r.ok) { stState.cur = r.strategy; toast('策略已儲存'); stState.list = await api('/api/strategies'); this.renderList(); this.renderEditor(); }
  },
  async run() {
    const st = stState.cur, box = $('#stResult');
    box.innerHTML = '<div class="empty">回測中…（抓歷史資料需要幾秒）</div>';
    const d = await post('/api/backtest', { strategy: st, years: stState.years, capital: +$('#stCap').value }).catch((e) => ({ error: e.message }));
    if (d.error) { box.innerHTML = `<div class="empty">${esc(d.error)}</div>`; return; }
    stState.result = { sid: st.id || 'new', data: d }; this.renderResult(d);
  },
  renderResult(d) {
    const m = d.metrics || {}, box = $('#stResult'), pct = (v) => (v == null ? '-' : `<span class="${cls(v)}">${sign(v)}${fmtP(v)}%</span>`);
    const cards = [['總報酬', pct(m.total_return)], ['買進持有', pct(m.bench_return)], ['年化報酬', pct(m.cagr)], ['最大回撤', `<span class="down">${fmtP(m.max_drawdown)}%</span>`],
      ['夏普值', fmtP(m.sharpe)], ['交易次數', m.trades ?? 0], ['勝率', fmtP(m.win_rate) + '%'], ['獲利因子', m.profit_factor == null ? '-' : fmtP(m.profit_factor)], ['平均每筆', pct(m.avg_trade)], ['平均持有', fmtP(m.avg_days, 0) + ' 天']];
    const verdict = m.total_return > (m.bench_return ?? -1e9) ? '<span class="up">策略報酬勝過買進持有</span>' : '<span class="down">策略報酬輸給買進持有</span>';
    box.innerHTML = `<div class="bt-cards">${cards.map(([k, v]) => `<div><span>${k}</span><b class="num">${v}</b></div>`).join('')}</div>
      <div class="muted small" style="margin:6px 0">${verdict}　期間 ${fmtP(m.years, 1)} 年，最終資產 ${fmtP(m.final, 0)}</div>
      <div class="bt-chart" id="btChart"></div><div class="ilegend"><i class="pos"></i>策略　<i class="est"></i>買進持有（同資金）</div>
      ${statsTable(d.stats, d.names)}
      <div class="sub-h">各股表現</div><table class="tbl mini"><thead><tr><th class="l">股票</th><th>報酬</th><th>買進持有</th><th>最大回撤</th><th>交易</th><th>勝率</th></tr></thead><tbody>
      ${(d.per_code || []).map((p) => `<tr data-code="${esc(p.code)}"><td class="l">${esc(showCode(p.code))} ${esc(d.names?.[p.code] || nameOf(p.code))}</td><td class="num">${pct(p.metrics.total_return)}</td><td class="num">${pct(p.metrics.bench_return)}</td><td class="num down">${fmtP(p.metrics.max_drawdown)}%</td><td class="num">${p.trades}</td><td class="num">${fmtP(p.metrics.win_rate)}%</td></tr>`).join('')}</tbody></table>
      <div class="sub-h">交易紀錄（最近 ${Math.min(100, (d.trades || []).length)} 筆）</div><table class="tbl mini"><thead><tr><th class="l">股票</th><th class="l">買進日</th><th class="l">賣出日</th><th>買價</th><th>賣價</th><th>報酬</th><th>天數</th><th class="l">原因</th></tr></thead><tbody>
      ${(d.trades || []).slice(0, 100).map((t) => { const dt = (x) => new Date((x + 8 * 3600) * 1000).toISOString().slice(0, 10); return `<tr><td class="l">${esc(showCode(t.code))}</td><td class="l num">${dt(t.entry_t)}</td><td class="l num">${dt(t.exit_t)}</td><td class="num">${fmtP(t.entry)}</td><td class="num">${fmtP(t.exit)}</td><td class="num">${pct(t.ret)}</td><td class="num">${t.days}</td><td class="l">${esc(t.reason)}</td></tr>`; }).join('')}</tbody></table>`;
    if (stState.chart) { try { stState.chart.remove(); } catch {} }
    const ch = LightweightCharts.createChart($('#btChart'), { ...chartOpts(true), height: 260, autoSize: true, timeScale: { borderColor: '#262b38', timeVisible: false } });
    const a = ch.addAreaSeries({ lineColor: '#f5a524', topColor: '#f5a52433', bottomColor: '#f5a52400', lineWidth: 2, priceLineVisible: false });
    a.setData((d.equity || []).map(([t, v]) => ({ time: t + 8 * 3600, value: v })));
    const b = ch.addLineSeries({ color: '#5b7bb0', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    b.setData((d.bench || []).map(([t, v]) => ({ time: t + 8 * 3600, value: v })));
    ch.timeScale().fitContent(); stState.chart = ch;
  },
};
$('#stList').addEventListener('click', (e) => { const it = e.target.closest('[data-id]'); if (!it) return; stState.cur = JSON.parse(JSON.stringify(stState.list.find((x) => x.id === it.dataset.id))); stState.result = null; PAGES.strategy.renderList(); PAGES.strategy.renderEditor(); });
$('#stNew').addEventListener('click', () => { stState.cur = newStrategy(); stState.result = null; PAGES.strategy.renderList(); PAGES.strategy.renderEditor(); });
$('#stTemplates').addEventListener('click', (e) => { const b = e.target.closest('[data-tpl]'); if (!b) return; stState.cur = newStrategy(STRAT_TEMPLATES[+b.dataset.tpl]); stState.result = null; PAGES.strategy.renderList(); PAGES.strategy.renderEditor(); toast('已套用範本，可以先按「開始回測」看看'); });
$('#stEvents').addEventListener('click', (e) => { const x = e.target.closest('[data-code]'); if (x) { selectCode(x.dataset.code); setView('chart'); } });
$('#stEditor').addEventListener('click', async (e) => {
  const st = stState.cur; if (!st) return; const t = e.target;
  if (t.id === 'stSave') PAGES.strategy.save();
  if (t.id === 'stRun') PAGES.strategy.run();
  if (t.id === 'stDel') { if (!st.id) { stState.cur = null; PAGES.strategy.renderEditor(); return; } confirmBox('刪除策略', `確定刪除「${esc(st.name)}」？`, '刪除', async () => { await post('/api/strategies/delete', { id: st.id }); stState.cur = null; PAGES.strategy.load(); }); }
  if (t.id === 'stCheck') { if (!st.id) { toast('請先儲存策略'); return; } toast('檢查中…'); const r = await post('/api/strategy/check', {}); toast(r.events?.length ? `觸發 ${r.events.length} 個訊號` : '目前沒有股票符合條件（或策略未啟用）', 4000); PAGES.strategy.events(); }
  if (t.dataset.rm) { st.universe = st.universe.filter((c) => c !== t.dataset.rm); PAGES.strategy.renderEditor(); }
  if (t.id === 'stUseWatch') { st.universe = state.watch.slice(0, 30); PAGES.strategy.renderEditor(); }
  if (t.id === 'stClearUni') { st.universe = []; PAGES.strategy.renderEditor(); }
  if (t.id === 'stAddBtn') { const v = $('#stAdd').value.trim().toUpperCase(); if (!v) return; const c = st.mkt === 'tw' ? v : 'US.' + v.replace(/^US\./, ''); if (!st.universe.includes(c)) st.universe.push(c); PAGES.strategy.renderEditor(); }
  const y = t.closest('[data-y]'); if (y) { stState.years = +y.dataset.y; $$('#stYears button').forEach((b) => b.classList.toggle('active', b === y)); }
  const row = t.closest('#stResult tr[data-code]'); if (row) { selectCode(row.dataset.code); setView('chart'); }
});
$('#stEditor').addEventListener('change', (e) => {
  const st = stState.cur; if (!st) return;
  if (e.target.dataset.k) st[e.target.dataset.k] = +e.target.value;
  if (e.target.dataset.s) st[e.target.dataset.s] = e.target.value;
  if (e.target.dataset.b) st[e.target.dataset.b] = e.target.checked;
});
$('#stEditor').addEventListener('keydown', (e) => { if (e.target.id === 'stAdd' && e.key === 'Enter') $('#stAddBtn').click(); });
// 歷史訊號統計：進場條件剛成立的日子，之後 N 天的表現，和「任意一天進場」比較
function evStat(e) {
  const x = e.stats?.per?.[e.code]?.[20] || e.stats?.per?.[e.code]?.['20'];
  if (!x || !x.n) return '';
  return `<div class="muted small">本檔過去 ${x.n} 次：20 天勝率 ${Math.round(x.win * 100)}%、平均 ${sign(x.avg)}${(x.avg * 100).toFixed(1)}%${x.n < 15 ? '（樣本少）' : ''}</div>`;
}
function statsTable(sx, names = {}) {
  if (!sx || !sx.all) return '';
  const H = sx.horizons || [5, 20, 60], P = (v) => (v == null ? '-' : `<span class="${cls(v)}">${sign(v)}${(v * 100).toFixed(1)}%</span>`);
  const cell = (x, base) => !x || !x.n ? '<td class="num muted">-</td><td class="num muted">-</td><td class="num muted">-</td>'
    : `<td class="num">${x.n}${x.n < 15 ? ' <span class="warn" title="樣本少於 15，參考價值低">⚠</span>' : ''}</td><td class="num" title="95% 區間 ${Math.round(x.win_lo * 100)}%～${Math.round(x.win_hi * 100)}%">${Math.round(x.win * 100)}%</td><td class="num">${P(x.avg - (base?.avg ?? 0))}</td>`;
  const head = `<tr><th class="l" rowspan="2">股票</th>${H.map((h) => `<th colspan="3">之後 ${h} 天</th>`).join('')}</tr><tr>${H.map(() => '<th>次數</th><th>勝率</th><th title="訊號平均報酬 − 任意一天進場平均報酬">多賺</th>').join('')}</tr>`;
  const row = (label, per, cls_ = '') => `<tr class="${cls_}"><td class="l">${label}</td>${H.map((h) => cell(per[h] || per[String(h)], sx.base[h] || sx.base[String(h)])).join('')}</tr>`;
  const base = `<tr class="muted"><td class="l">任意一天進場（對照）</td>${H.map((h) => { const b = sx.base[h] || sx.base[String(h)] || {}; return `<td class="num">${b.n || '-'}</td><td class="num">${b.n ? Math.round(b.win * 100) + '%' : '-'}</td><td class="num">${b.n ? P(b.avg) + '<small> 平均</small>' : '-'}</td>`; }).join('')}</tr>`;
  const per = Object.entries(sx.per || {}).map(([c, v]) => row(`${esc(showCode(c))} ${esc(names[c] || nameOf(c))}`, v)).join('');
  return `<div class="sub-h">歷史訊號統計 <span class="muted small">進場條件「剛成立」的日子，隔天開盤買、持有 N 天的結果（已扣費用 ${(sx.cost * 100).toFixed(1)}%）。「多賺」= 比任意一天進場多賺多少；過去統計不代表未來。</span></div>
    <div class="tbl-scroll"><table class="tbl mini stats-tbl"><thead>${head}</thead><tbody>${row('<b>全部合併</b>', sx.all, 'hl')}${base}${per}</tbody></table></div>`;
}
// 背景訊號：每 30 秒看有沒有新觸發，跳出提示
setInterval(async () => {
  const ev = await api('/api/strategy/events?since=' + stState.lastEvent).catch(() => []);
  if (!ev.length) return;
  stState.lastEvent = Math.max(...ev.map((e) => e.t)); store.set('tw.lastEvent', stState.lastEvent);
  ev.slice(0, 3).forEach((e) => toast(`📈 ${e.strategy}：${e.name} ${e.kind === 'entry' ? '進場' : '出場'}訊號 ${fmtP(e.price)}${e.trade ? '（' + e.trade + '）' : ''}`, 7000));
  if (state.view === 'strategy') PAGES.strategy.events();
  loadPaper();
}, 30000);

/* ---------- 選股器 ---------- */
const SCR_PRESETS = {
  tw: [
    { name: '高殖利率低本益比', f: { yld_min: 5, pe_max: 15, vol_min: 500 }, tech: [] },
    { name: '強勢股', f: { vol_min: 2000 }, tech: [R(C('close'), 'gt', C('ma', 20)), R(C('ma', 20), 'gt', C('ma', 60)), R(C('vol_ratio', 5), 'gt', V(1.5))] },
    { name: '突破 20 日新高', f: { vol_min: 1000 }, tech: [R(C('close'), 'gt', C('hh', 20))] },
    { name: 'RSI 超賣', f: { vol_min: 500 }, tech: [R(C('rsi', 14), 'lt', V(30))] },
  ],
  us: [
    { name: '大型股強勢', f: { mcap_min: 50 }, tech: [R(C('close'), 'gt', C('ma', 50)), R(C('ma', 50), 'gt', C('ma', 200))] },
    { name: '今日大漲且量大', f: { pct_min: 3, vol_min: 2000000, mcap_min: 2 }, tech: [] },
    { name: '突破 20 日新高', f: { mcap_min: 10 }, tech: [R(C('close'), 'gt', C('hh', 20))] },
    { name: 'RSI 超賣', f: { mcap_min: 10 }, tech: [R(C('rsi', 14), 'lt', V(30))] },
  ],
};
const scrState = { f: {}, tech: { mode: 'all', rules: [] }, inds: [], rows: [], mkt: null };
PAGES.screener = {
  async load() {
    await loadOperands();
    if (scrState.mkt !== state.mkt) { scrState.mkt = state.mkt; scrState.f = {}; scrState.tech = { mode: 'all', rules: [] }; scrState.inds = []; scrState.rows = []; $('#scrBody').innerHTML = '<div class="empty">設定條件後按「開始選股」</div>'; }
    const tw = state.mkt === 'tw';
    $('#scrPresets').innerHTML = SCR_PRESETS[state.mkt].map((p, i) => `<button class="preset" data-p="${i}"><b>${esc(p.name)}</b></button>`).join('');
    const fields = [['price', '股價', '', ''], ['pct', '漲跌幅 %', '', ''], ['vol', tw ? '成交量（張）' : '成交量（股）', '', ''], ...(tw ? [['pe', '本益比', '', ''], ['yld', '殖利率 %', '', ''], ['pb', '股價淨值比', '', '']] : [])];
    $('#scrFields').innerHTML = fields.map(([k, n]) => `<div class="sf"><span>${n}</span><input class="tin" data-f="${k}_min" placeholder="最低" value="${scrState.f[k + '_min'] ?? ''}"><i>~</i><input class="tin" data-f="${k}_max" placeholder="最高" value="${scrState.f[k + '_max'] ?? ''}"></div>`).join('') +
      `<div class="sf"><span>市值 ≥</span><input class="tin" data-f="mcap_min" placeholder="${tw ? '億元' : '十億美元'}" value="${scrState.f.mcap_min ?? ''}"><i></i><span class="muted small">${tw ? '億元' : '十億美元'}</span></div>` +
      (tw ? `<label class="chk"><input type="checkbox" data-f="no_etf" ${scrState.f.no_etf ? 'checked' : ''}> 排除 ETF</label>` : '');
    const inds = tw ? ['半導體', '電子零組件', '電腦週邊', '光電', '通信網路', '其他電子', '金融保險', '航運', '生技醫療', '電機機械', '鋼鐵', '塑膠', '建材營造', '食品', '綠能環保', 'ETF'] : ['Technology', 'Health Care', 'Finance', 'Consumer Discretionary', 'Industrials', 'Energy', 'Utilities', 'Real Estate', 'Basic Materials', 'Consumer Staples', 'Telecommunications'];
    const zh = { Technology: '科技', 'Health Care': '醫療', Finance: '金融', 'Consumer Discretionary': '非必需消費', Industrials: '工業', Energy: '能源', Utilities: '公用事業', 'Real Estate': '房地產', 'Basic Materials': '原物料', 'Consumer Staples': '必需消費', Telecommunications: '通訊' };
    $('#scrInd').innerHTML = inds.map((x) => `<button class="chip ${scrState.inds.includes(x) ? 'active' : ''}" data-ind="${esc(x)}">${esc(zh[x] || x)}</button>`).join('');
    ruleEditor($('#scrTech'), scrState.tech, () => {});
  },
  async run() {
    $('#scrBody').innerHTML = '<div class="empty">選股中…（有技術條件時要抓歷史資料，約需 10–30 秒）</div>';
    const body = { mkt: state.mkt, filters: { ...scrState.f, industries: scrState.inds }, tech: scrState.tech, limit: +$('#scrLimit').value || 80, sort: state.mkt === 'tw' ? 'volume' : 'mcap' };
    const d = await post('/api/screener', body).catch((e) => ({ error: e.message }));
    if (d.error) { $('#scrBody').innerHTML = `<div class="empty">失敗：${esc(d.error)}</div>`; return; }
    scrState.rows = d.rows; this.render(d);
  },
  render(d) {
    const tw = state.mkt === 'tw', rows = d.rows;
    rows.forEach((r) => rememberName(r.code, r.name));
    $('#scrInfo').textContent = d.scanned ? `基本條件 ${d.total} 檔 → 掃描前 ${d.scanned} 檔 → 符合 ${rows.length} 檔` : `符合 ${d.total} 檔${d.total > rows.length ? `（顯示前 ${rows.length}）` : ''}`;
    $('#scrToStrat').disabled = $('#scrAddAll').disabled = !rows.length;
    $('#scrBody').innerHTML = rows.length ? `<table class="tbl"><thead><tr><th class="l">股票</th><th>股價</th><th>漲跌幅</th><th>成交量</th><th>市值</th>${tw ? '<th>本益比</th><th>殖利率</th><th>淨值比</th>' : ''}<th class="l">產業</th>${rows[0].detail ? '<th class="l">技術條件</th>' : ''}<th></th></tr></thead><tbody>
      ${rows.map((r) => `<tr data-code="${esc(r.code)}"><td class="l">${nmCell(r.code, r.name)}</td><td class="num">${fmtP(r.price)}</td><td class="num ${cls(r.pct)}">${sign(r.pct)}${fmtP(r.pct)}%</td><td class="num">${fmtVol(r.volume)}</td><td class="num">${fmtVol(r.mcap)}</td>
        ${tw ? `<td class="num">${r.pe ? fmtP(r.pe) : '-'}</td><td class="num">${r.yld != null ? fmtP(r.yld) + '%' : '-'}</td><td class="num">${r.pb ? fmtP(r.pb) : '-'}</td>` : ''}<td class="l muted">${esc(r.industry || '')}</td>
        ${r.detail ? `<td class="l small">${r.detail.map((x) => `${esc(x.text)}（${fmtP(x.a)} / ${fmtP(x.b)}）`).join('<br>')}</td>` : ''}<td><button class="act" data-add="${esc(r.code)}">${state.watch.includes(r.code) ? '♥' : '+ 自選'}</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">沒有符合條件的股票，試著放寬條件</div>';
  },
};
$('#scrPresets').addEventListener('click', (e) => {
  const b = e.target.closest('[data-p]'); if (!b) return; const p = SCR_PRESETS[state.mkt][+b.dataset.p];
  scrState.f = { ...p.f, no_etf: state.mkt === 'tw' }; scrState.tech = { mode: 'all', rules: JSON.parse(JSON.stringify(p.tech)) }; scrState.inds = [];
  scrState.mkt = state.mkt; PAGES.screener.load().then(() => PAGES.screener.run());
});
$('#scrFields').addEventListener('input', (e) => { const f = e.target.dataset.f; if (!f) return; scrState.f[f] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; });
$('#scrInd').addEventListener('click', (e) => { const b = e.target.closest('[data-ind]'); if (!b) return; const x = b.dataset.ind, i = scrState.inds.indexOf(x); i >= 0 ? scrState.inds.splice(i, 1) : scrState.inds.push(x); b.classList.toggle('active'); });
$('#scrRun').addEventListener('click', () => PAGES.screener.run());
$('#scrBody').addEventListener('click', (e) => {
  const add = e.target.closest('[data-add]'); if (add) { e.stopPropagation(); addWatch(add.dataset.add); add.textContent = '♥'; return; }
  const r = e.target.closest('tr[data-code]'); if (r) { selectCode(r.dataset.code); setView('chart'); }
});
$('#scrAddAll').addEventListener('click', () => { const n = scrState.rows.filter((r) => !state.watch.includes(r.code)).length; scrState.rows.slice(0, 50).forEach((r) => { if (!state.watch.includes(r.code)) state.watch.push(r.code); }); save('watch'); renderWatch(); refreshQuotes(); toast(`已加入 ${Math.min(n, 50)} 檔到自選`); });
$('#scrToStrat').addEventListener('click', () => { const st = newStrategy({ name: '選股策略' }); st.universe = scrState.rows.slice(0, 20).map((r) => r.code); if (scrState.tech.rules.length) st.entry = JSON.parse(JSON.stringify(scrState.tech)); stState.cur = st; stState.result = null; setView('strategy'); });

/* ---------- 熱力圖（squarified treemap） ---------- */
const hmState = { size: 'mcap', data: {}, t: 0 };
function squarify(items, x, y, w, h) { // items: [{v, ...}] 依 v 由大到小
  const out = [], total = items.reduce((s, i) => s + i.v, 0); if (!total || w <= 0 || h <= 0) return out;
  const scale = (w * h) / total; let rest = items.map((i) => ({ ...i, a: i.v * scale }));
  while (rest.length) {
    const short = Math.min(w, h); let row = [], best = Infinity;
    for (const it of rest) {
      const tr = [...row, it], s = tr.reduce((a, b) => a + b.a, 0), mx = Math.max(...tr.map((t) => t.a)), mn = Math.min(...tr.map((t) => t.a));
      const worst = Math.max((short * short * mx) / (s * s), (s * s) / (short * short * mn));
      if (worst > best) break; best = worst; row = tr;
    }
    const s = row.reduce((a, b) => a + b.a, 0), thick = s / short;
    let off = 0;
    row.forEach((it) => { const len = it.a / thick; out.push(w >= h ? { ...it, x, y: y + off, w: thick, h: len } : { ...it, x: x + off, y, w: len, h: thick }); off += len; });
    if (w >= h) { x += thick; w -= thick; } else { y += thick; h -= thick; }
    rest = rest.slice(row.length);
  }
  return out;
}
const hmColor = (p) => { const t = Math.max(-1, Math.min(1, p / 3)); const base = [42, 46, 58]; const to = t >= 0 ? [214, 48, 60] : [22, 160, 104]; const k = Math.abs(t); return `rgb(${base.map((b, i) => Math.round(b + (to[i] - b) * k)).join(',')})`; };
PAGES.heatmap = {
  async load() { this.draw(); await this.refresh(); },
  async refresh() {
    try { hmState.data[state.mkt] = await api('/api/heatmap?mkt=' + state.mkt); hmState.t = Date.now(); } catch (e) { $('#hmWrap').innerHTML = `<div class="empty">載入失敗：${esc(e.message)}</div>`; return; }
    if (state.view === 'heatmap') requestAnimationFrame(() => this.draw());
  },
  tick() { if (Date.now() - hmState.t > 30000) this.refresh(); },
  draw() {
    const d = hmState.data[state.mkt], wrap = $('#hmWrap'); if (!d) return;
    $('#hmSub').textContent = LANG === 'en' ? `Top ${d.rows.length} by market cap${state.mkt === 'tw' ? ' (ex-ETF)' : ''}` : state.mkt === 'tw' ? `市值前 ${d.rows.length} 大（不含 ETF）` : `市值前 ${d.rows.length} 大美股`;
    $('#hmUpd').textContent = '更新於 ' + new Date(d.updated * 1000).toTimeString().slice(0, 8);
    $('#hmLegend').innerHTML = [-3, -2, -1, 0, 1, 2, 3].map((p) => `<span style="background:${hmColor(p)}">${p > 0 ? '+' : ''}${p}%</span>`).join('');
    const W = wrap.clientWidth, H = wrap.clientHeight;
    if (W < 50 || H < 50) { if ((this.retry = (this.retry || 0) + 1) < 20) setTimeout(() => this.draw(), 100); return; } // 版面還沒排好就稍後再畫
    this.retry = 0;
    const val = (r) => (hmState.size === 'mcap' ? r.mcap : (r.price || 0) * (r.volume || 0) * (state.mkt === 'tw' ? 1000 : 1)) || 0;
    const groups = {}; d.rows.forEach((r) => { const v = val(r); if (v > 0) { const g = LANG === 'en' && state.mkt === 'us' ? r.industry : (r.industryZh || r.industry); (groups[g] = groups[g] || []).push({ ...r, v }); } });
    const gItems = Object.entries(groups).map(([g, rs]) => ({ g, rs: rs.sort((a, b) => b.v - a.v), v: rs.reduce((s, r) => s + r.v, 0) })).sort((a, b) => b.v - a.v);
    let html = '';
    squarify(gItems, 0, 0, W, H).forEach((G) => {
      const head = G.h > 40 && G.w > 60 ? 16 : 0;
      html += `<div class="hm-g" style="left:${G.x}px;top:${G.y}px;width:${G.w}px;height:${G.h}px">${head ? `<div class="hm-gh">${esc(G.g)}</div>` : ''}</div>`;
      squarify(G.rs, G.x + 1, G.y + head + 1, G.w - 2, G.h - head - 2).forEach((c) => {
        const big = c.w > 54 && c.h > 34, mid = c.w > 34 && c.h > 20;
        html += `<div class="hm-c" data-code="${esc(c.code)}" style="left:${c.x}px;top:${c.y}px;width:${Math.max(0, c.w - 1)}px;height:${Math.max(0, c.h - 1)}px;background:${hmColor(c.pct || 0)};font-size:${Math.max(9, Math.min(20, Math.sqrt(c.w * c.h) / 5))}px">${mid ? `<b>${esc(state.mkt === 'tw' ? c.name : showCode(c.code))}</b>` : ''}${big ? `<span>${sign(c.pct)}${fmtP(c.pct)}%</span>` : ''}</div>`;
      });
    });
    wrap.innerHTML = html;
  },
};
$('#hmWrap').addEventListener('mousemove', (e) => {
  const c = e.target.closest('.hm-c'), tip = $('#hmTip'); if (!c) { tip.hidden = true; return; }
  const r = hmState.data[state.mkt]?.rows.find((x) => x.code === c.dataset.code); if (!r) return;
  tip.hidden = false; tip.innerHTML = `<b>${esc(r.name)}</b>　${esc(showCode(r.code))}<br>價格 ${fmtP(r.price)}　<span class="${cls(r.pct)}">${sign(r.pct)}${fmtP(r.pct)}%</span><br>市值 ${fmtVol(r.mcap)}　${esc(r.industryZh || r.industry)}`;
  const box = $('#viewHeatmap').getBoundingClientRect(); tip.style.left = Math.min(e.clientX - box.left + 14, box.width - 230) + 'px'; tip.style.top = e.clientY - box.top + 14 + 'px';
});
$('#hmWrap').addEventListener('mouseleave', () => ($('#hmTip').hidden = true));
$('#hmWrap').addEventListener('click', (e) => { const c = e.target.closest('.hm-c'); if (c) { selectCode(c.dataset.code); setView('chart'); } });
$('#hmSize').addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (!b) return; hmState.size = b.dataset.s; $$('#hmSize button').forEach((x) => x.classList.toggle('active', x === b)); PAGES.heatmap.draw(); });
window.addEventListener('resize', () => { if (state.view === 'heatmap') PAGES.heatmap.draw(); });

/* ---------- 多圖同框 ---------- */
const mtState = { layout: store.get('tw.mtLayout', 4), period: store.get('tw.mtPeriod', 'D'), charts: [], timer: null };
const mtCodes = () => { const k = 'tw.multi.' + state.mkt; let c = store.get(k, null); if (!c) c = state.watch.slice(0, 9); return c; };
const mtSave = (c) => store.set('tw.multi.' + state.mkt, c);
PAGES.multi = {
  load() {
    $$('#mtLayout button').forEach((b) => b.classList.toggle('active', +b.dataset.l === mtState.layout));
    $$('#mtPeriod button').forEach((b) => b.classList.toggle('active', b.dataset.p === mtState.period));
    this.build(); clearInterval(mtState.timer); mtState.timer = setInterval(() => this.updateAll(), 30000);
  },
  leave() { clearInterval(mtState.timer); mtState.charts.forEach((c) => { try { c.chart.remove(); } catch {} }); mtState.charts = []; },
  build() {
    this.leave(); const n = mtState.layout, codes = mtCodes(), cols = n === 4 ? 2 : 3;
    $('#mtGrid').style.gridTemplateColumns = `repeat(${cols}, 1fr)`; $('#mtGrid').style.gridTemplateRows = `repeat(${Math.ceil(n / cols)}, 1fr)`;
    $('#mtGrid').innerHTML = Array.from({ length: n }, (_, i) => `<div class="mt-cell" data-i="${i}"><div class="mt-h"><input class="tin mt-code" value="${esc(showCode(codes[i] || ''))}" placeholder="代號"><b class="mt-name"></b><span class="flex1"></span><span class="mt-q num"></span><button class="icon-btn" data-open title="開啟大圖">⤢</button></div><div class="mt-chart"></div></div>`).join('');
    $$('#mtGrid .mt-cell').forEach((cell, i) => {
      const chart = LightweightCharts.createChart(cell.querySelector('.mt-chart'), { ...chartOpts(true), rightPriceScale: { borderColor: '#262b38', minimumWidth: 56 } });
      mtState.charts[i] = { chart, code: codes[i] || null, series: [] };
      this.update(i);
    });
  },
  async update(i) {
    const m = mtState.charts[i]; if (!m) return; const cell = $$('#mtGrid .mt-cell')[i]; m.series.forEach((s) => m.chart.removeSeries(s)); m.series = [];
    if (!m.code) { cell.querySelector('.mt-name').textContent = ''; cell.querySelector('.mt-q').innerHTML = ''; return; }
    const P = { tick: ['1m', '1d'], D: ['1d', '1y'], 60: ['60m', '3mo'] }[mtState.period];
    try {
      const [d, qs] = await Promise.all([api(`/api/kline?code=${encodeURIComponent(m.code)}&interval=${P[0]}&range=${P[1]}`), api('/api/quote?codes=' + encodeURIComponent(m.code))]);
      if (mtState.charts[i] !== m) return;
      const off = d.gmtoffset ?? 8 * 3600, q = qs[m.code]; Object.assign(state.quotes, qs);
      let bars = d.bars; if (mtState.period === 'tick' && bars.length) { const day = Math.floor((bars.at(-1).t + off) / 86400); bars = bars.filter((b) => Math.floor((b.t + off) / 86400) === day); }
      const { d: ch, pct } = chgOf(q);
      cell.querySelector('.mt-name').textContent = nameOf(m.code);
      cell.querySelector('.mt-q').innerHTML = q ? `<span class="${cls(ch)}">${fmtP(q.price)}　${sign(pct)}${pct.toFixed(2)}%</span>` : '';
      if (mtState.period === 'tick') {
        const col = (q?.price ?? 0) >= (q?.prev ?? 0) ? UP : DOWN, s = m.chart.addAreaSeries({ lineColor: col, topColor: col + '33', bottomColor: col + '00', lineWidth: 1.5, priceLineVisible: false });
        s.setData(bars.map((b) => ({ time: b.t + off, value: b.c }))); if (q?.prev) s.createPriceLine({ price: q.prev, color: '#7d8494', lineStyle: 2, lineWidth: 1, axisLabelVisible: false });
        m.series.push(s);
      } else {
        const s = m.chart.addCandlestickSeries({ upColor: UP, downColor: DOWN, borderUpColor: UP, borderDownColor: DOWN, wickUpColor: UP, wickDownColor: DOWN, priceLineVisible: false });
        s.setData(bars.map((b) => ({ time: b.t + off, open: b.o, high: b.h, low: b.l, close: b.c }))); m.series.push(s);
        const c = bars.map((b) => b.c);
        [[20, '#f5a524'], [60, '#26c6da']].forEach(([n, col]) => { const v = IND.sma(c, n), l = m.chart.addLineSeries({ color: col, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }); l.setData(bars.map((b, j) => (v[j] == null ? { time: b.t + off } : { time: b.t + off, value: v[j] }))); m.series.push(l); });
      }
      m.chart.timeScale().fitContent();
    } catch (e) { cell.querySelector('.mt-q').textContent = '載入失敗'; }
  },
  updateAll() { if (state.view === 'multi') mtState.charts.forEach((_, i) => this.update(i)); },
};
$('#multiBtn').addEventListener('click', () => setView('multi'));
$('#mtBack').addEventListener('click', () => setView('chart'));
$('#mtLayout').addEventListener('click', (e) => { const b = e.target.closest('[data-l]'); if (!b) return; mtState.layout = +b.dataset.l; store.set('tw.mtLayout', mtState.layout); PAGES.multi.load(); });
$('#mtPeriod').addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (!b) return; mtState.period = b.dataset.p; store.set('tw.mtPeriod', mtState.period); PAGES.multi.load(); });
$('#mtFill').addEventListener('click', () => { mtSave(state.watch.slice(0, 9)); PAGES.multi.build(); });
$('#mtGrid').addEventListener('change', (e) => {
  if (!e.target.classList.contains('mt-code')) return;
  const i = +e.target.closest('.mt-cell').dataset.i, v = e.target.value.trim().toUpperCase(), codes = mtCodes();
  codes[i] = v ? (state.mkt === 'tw' ? v : 'US.' + v.replace(/^US\./, '')) : null; mtSave(codes);
  mtState.charts[i].code = codes[i]; PAGES.multi.update(i);
});
$('#mtGrid').addEventListener('click', (e) => { const b = e.target.closest('[data-open]'); if (!b) return; const m = mtState.charts[+b.closest('.mt-cell').dataset.i]; if (m?.code) { selectCode(m.code); setView('chart'); } });

/* ---------- 推播設定 ---------- */
async function notifyPanel() {
  const c = await api('/api/config/notify').catch(() => ({ telegram: {}, discord: {}, ntfy: {} }));
  const m = openModal('推播通知（策略訊號、價格提醒）', `
    <div class="hint" style="margin:0 0 12px">設定好之後，策略觸發或價格提醒時會推播到手機。設定只存在這台電腦的 config.json。</div>
    <div class="np"><label class="chk big"><input type="checkbox" id="npNtfyOn" ${c.ntfy.enabled ? 'checked' : ''}> <b>ntfy</b>（最簡單：手機裝 ntfy App，訂閱同一個主題名稱）</label>
      <div class="fld"><label>主題名稱</label><input id="npNtfyTopic" value="${esc(c.ntfy.topic || '')}" placeholder="例如 my-stock-${Math.random().toString(36).slice(2, 8)}"></div>
      <div class="fld"><label>伺服器</label><input id="npNtfyServer" value="${esc(c.ntfy.server || 'https://ntfy.sh')}"></div>
      <div class="hint">主題名稱等於密碼，取一個別人猜不到的。</div><button class="btn-ghost" data-test="ntfy">送出測試</button></div>
    <div class="np"><label class="chk big"><input type="checkbox" id="npTgOn" ${c.telegram.enabled ? 'checked' : ''}> <b>Telegram</b></label>
      <div class="fld"><label>Bot Token</label><input id="npTgToken" value="${esc(c.telegram.token || '')}" placeholder="跟 @BotFather 建立機器人後取得"></div>
      <div class="fld"><label>Chat ID</label><input id="npTgChat" value="${esc(c.telegram.chat_id || '')}" placeholder="先傳訊息給機器人，再查 getUpdates"></div>
      <button class="btn-ghost" data-test="telegram">送出測試</button></div>
    <div class="np"><label class="chk big"><input type="checkbox" id="npDcOn" ${c.discord.enabled ? 'checked' : ''}> <b>Discord</b></label>
      <div class="fld"><label>Webhook 網址</label><input id="npDcHook" value="${esc(c.discord.webhook || '')}" placeholder="頻道設定 → 整合 → Webhook"></div>
      <button class="btn-ghost" data-test="discord">送出測試</button></div>
    <div class="np"><b>通知內容</b>
      <div class="fld"><label>網頁網址</label><input id="npBase" value="${esc(c.base_url || '')}" placeholder="例如 https://你的電腦.ts.net:8766（點通知就會打開那一檔的圖表）"></div>
      <div class="fld"><label>推播方式</label><select id="npMode">${[['both', '盤中即時＋收盤摘要'], ['instant', '只有盤中即時'], ['summary', '只有收盤摘要（盤中不打擾）']].map(([v, n]) => `<option value="${v}" ${(c.mode || 'both') === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="hint">同一次檢查、同一個策略的訊號會合併成一則；每檔附上它自己過去的勝率與報酬。</div>
      <button class="btn-ghost" data-sum="tw">送出台股收盤摘要</button> <button class="btn-ghost" data-sum="us">送出美股收盤摘要</button></div>
    <div class="hint">LINE Notify 已於 2025 年停止服務，所以沒有提供。</div>`,
    [{ label: '取消' }, { label: '儲存', act: async (m) => { const r = await post('/api/config/notify', collect(m)); toast(r.msg); } }]);
  function collect(m) {
    return { ntfy: { enabled: m.querySelector('#npNtfyOn').checked, topic: m.querySelector('#npNtfyTopic').value, server: m.querySelector('#npNtfyServer').value },
      telegram: { enabled: m.querySelector('#npTgOn').checked, token: m.querySelector('#npTgToken').value, chat_id: m.querySelector('#npTgChat').value },
      discord: { enabled: m.querySelector('#npDcOn').checked, webhook: m.querySelector('#npDcHook').value },
      base_url: m.querySelector('#npBase').value, mode: m.querySelector('#npMode').value };
  }
  m.querySelectorAll('[data-sum]').forEach((b) => b.addEventListener('click', async () => {
    await post('/api/config/notify', collect(m));
    const r = await post('/api/notify/summary', { mkt: b.dataset.sum });
    toast(Object.keys(r.result || {}).length ? '✓ 收盤摘要已送出' : '沒有啟用中的推播管道', 4000);
  }));
  m.querySelectorAll('[data-test]').forEach((b) => b.addEventListener('click', async () => {
    await post('/api/config/notify', collect(m));
    const r = await post('/api/notify/test', { channel: b.dataset.test });
    toast(r.ok ? '✓ 測試推播已送出' : '失敗：' + Object.values(r.result || {}).join('、'), 5000);
  }));
}
