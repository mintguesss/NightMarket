/* 手機版：寬度 ≤ 820px 時切換成「清單 → 個股詳情」的單欄操作 */
(() => {
  const MQ = matchMedia('(max-width: 820px)');
  const isMobile = () => MQ.matches;
  let detail = false, prevView = 'chart';

  function apply() {
    document.body.classList.toggle('mobile', isMobile());
    if (!isMobile()) { delete document.body.dataset.mpage; const b = document.querySelector('#nav [data-view="chart"] span'); if (b) b.textContent = '看盤'; return; }
    document.body.dataset.mpage = state.view === 'chart' ? (detail ? 'detail' : 'list') : 'view';
    // 頂部標題：清單頁「自選」、個股頁顯示股名、功能頁顯示頁名
    const mp = document.body.dataset.mpage;
    $('#mTitle').textContent = mp === 'list' ? '自選' : mp === 'detail' ? nameOf(state.code) : (document.querySelector(`#nav [data-view="${state.view}"] span`)?.textContent || '');
    const btn = document.querySelector('#nav [data-view="chart"] span'); if (btn) btn.textContent = '自選';
    setTimeout(() => { // 圖表在隱藏時寬度為 0，顯示後重新調整範圍
      draw.resize();
      if (state.period === 'tick' || PERIODS[state.period].line) mainChart.timeScale().fitContent();
      else { const n = state.bars.length; mainChart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 70), to: n + 3 }); }
    }, 80);
  }
  window.mobileApply = apply;

  // 包裝原本的切頁與選股：手機上選股就進入個股頁
  const _setView = setView;
  setView = function (v) { if (isMobile() && v !== 'chart') detail = false; _setView(v); apply(); };
  const _select = selectCode;
  selectCode = function (code) {
    _select(code);
    if (!isMobile()) return;
    if (!detail) prevView = state.view;
    detail = true;
    if (state.view !== 'chart') _setView('chart');
    apply(); document.querySelector('.app').scrollTop = 0;
  };

  // 底部「自選」= 回到清單
  $('#nav').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || !isMobile()) return;
    if (b.dataset.view === 'chart') detail = false;
    if (b.dataset.act === 'more') { e.stopPropagation(); document.body.classList.contains('sheet-open') ? closeSheet() : openSheet(); return; }
    closeSheet();
  }, true);

  // 「更多」底部面板：功能用圖示格子排列，外觀／語言用切換鈕，只蓋住下半部
  const icon = (sel) => document.querySelector(`#nav ${sel} svg`)?.outerHTML || '';
  const SVG = {
    alert: '<svg viewBox="0 0 24 24"><path d="M6 9a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8M10 21h4"/></svg>',
    fs: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
    globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></svg>',
    theme: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 000 18z" fill="currentColor"/></svg>',
    index: '<svg viewBox="0 0 24 24"><path d="M3 17l5-6 4 3 6-8 3 3"/></svg>',
    multi: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>',
  };
  const sheet = document.createElement('div'); sheet.className = 'msheet';
  const bd = document.createElement('div'); bd.className = 'msheet-bd';
  document.body.append(bd, sheet);
  function renderSheet() {
    const tiles = [['ai', 'AI 選股'], ['heatmap', '熱力圖'], ['screener', '選股'], ['strategy', '策略回測'], ['options', '期權'], ['news', '資訊'], ['calendar', '日曆'], ['rank', '排行']]
      .map(([v, n]) => `<button class="mtile" data-sv="${v}"><span class="ico">${icon(`[data-view="${v}"]`)}</span>${n}</button>`).join('') +
      `<button class="mtile" data-sv="multi"><span class="ico">${SVG.multi}</span>多圖</button>` +
      `<button class="mtile" data-sa="index"><span class="ico">${SVG.index}</span>大盤走勢</button>`;
    const light = curTheme() === 'light';
    sheet.innerHTML = `<div class="grab"></div><div class="msheet-h">功能</div><div class="msheet-grid">${tiles}</div>
      <div class="msheet-h">偏好設定</div><div class="msheet-list">
        <button class="mrow" data-sa="theme"><span class="ico">${SVG.theme}</span>外觀<span class="seg2"><b class="${light ? '' : 'on'}">深色</b><b class="${light ? 'on' : ''}">淺色</b></span></button>
        <button class="mrow" data-sa="lang"><span class="ico">${SVG.globe}</span>語言<span class="seg2"><b class="${LANG === 'en' ? '' : 'on'}">中文</b><b class="${LANG === 'en' ? 'on' : ''}">EN</b></span></button>
        <button class="mrow" data-sa="alerts"><span class="ico">${SVG.alert}</span>價格提醒<span class="val">›</span></button>
        <button class="mrow" data-sa="fs"><span class="ico">${SVG.fs}</span>全螢幕<span class="val">›</span></button>
        <button class="mrow" data-sa="settings"><span class="ico">${SVG.gear}</span>其他設定<span class="val">›</span></button></div>`;
  }
  function openSheet() { renderSheet(); document.body.classList.add('sheet-open'); document.querySelector('#nav [data-act="more"]')?.classList.add('open'); }
  function closeSheet() { document.body.classList.remove('sheet-open'); document.querySelector('#nav [data-act="more"]')?.classList.remove('open'); }
  bd.addEventListener('click', closeSheet);
  sheet.addEventListener('click', (e) => {
    const t = e.target.closest('[data-sv], [data-sa]'); if (!t) return;
    if (t.dataset.sv) { closeSheet(); setView(t.dataset.sv); return; }
    const a = t.dataset.sa;
    if (a === 'theme') { toggleTheme(); renderSheet(); return; } // 外觀切換後面板留著，直接看到效果
    if (a === 'lang') { setLang(LANG === 'en' ? 'zh' : 'en'); return; }
    closeSheet();
    if (a === 'index') selectCode(MKT_INDEX[state.mkt]);
    if (a === 'alerts') alertsPanel();
    if (a === 'fs') toggleFullscreen(document.documentElement);
    if (a === 'settings') settingsPanel();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

  // 搜尋：平常只顯示放大鏡，點了才展開搜尋框
  const openSearch = () => { document.body.classList.add('search-open'); setTimeout(() => $('#searchInput').focus(), 30); };
  const closeSearch = () => { document.body.classList.remove('search-open'); $('#searchInput').value = ''; $('#searchDrop').classList.remove('open'); $('#searchInput').blur(); };
  $('#mSearchBtn').addEventListener('click', openSearch);
  $('#mSearchCancel').addEventListener('click', closeSearch);
  $('#searchDrop').addEventListener('click', () => setTimeout(closeSearch, 50));
  $('#searchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') setTimeout(closeSearch, 80); if (e.key === 'Escape') closeSearch(); });

  // 返回鍵
  $('#mBack').addEventListener('click', () => {
    detail = false;
    if (prevView !== 'chart') _setView(prevView);
    apply();
  });

  // 長按自選股 = 右鍵選單（iOS 不會觸發 contextmenu）
  let lpTimer = null, lpFired = false;
  $('#watchList').addEventListener('touchstart', (e) => {
    const row = e.target.closest('.wrow'); if (!row) return;
    lpFired = false; const t = e.touches[0];
    lpTimer = setTimeout(() => { lpFired = true; stockMenu(row.dataset.code, t.clientX, t.clientY, true); }, 550);
  }, { passive: true });
  ['touchend', 'touchmove', 'touchcancel'].forEach((ev) => $('#watchList').addEventListener(ev, () => clearTimeout(lpTimer), { passive: true }));
  $('#watchList').addEventListener('click', (e) => { if (lpFired) { e.stopImmediatePropagation(); lpFired = false; } }, true);
  $('#watchList').addEventListener('contextmenu', (e) => { if (lpFired) e.preventDefault(); }, true);

  MQ.addEventListener('change', apply);
  apply();
})();
