/* 手機版：寬度 ≤ 820px 時切換成「清單 → 個股詳情」的單欄操作 */
(() => {
  const MQ = matchMedia('(max-width: 820px)');
  const isMobile = () => MQ.matches;
  let detail = false, prevView = 'chart';

  function apply() {
    document.body.classList.toggle('mobile', isMobile());
    if (!isMobile()) { delete document.body.dataset.mpage; const b = document.querySelector('#nav [data-view="chart"] span'); if (b) b.textContent = '看盤'; return; }
    document.body.dataset.mpage = state.view === 'chart' ? (detail ? 'detail' : 'list') : 'view';
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
    if (b.dataset.act === 'more') {
      e.stopPropagation();
      const r = b.getBoundingClientRect();
      openMenu(r.left - 120, r.top - 250, [
        { label: '熱力圖', icon: '▤', act: () => setView('heatmap') },
        { label: '選股', icon: '⚲', act: () => setView('screener') },
        { label: '策略與回測', icon: '↗', act: () => setView('strategy') },
        { label: '期權', icon: '▦', act: () => setView('options') },
        { label: '資訊（新聞、財報）', icon: '◉', act: () => setView('news') },
        { label: '日曆', icon: '▣', act: () => setView('calendar') },
        { label: '大盤走勢', icon: '↗', act: () => selectCode(MKT_INDEX[state.mkt]) },
        'sep',
        { label: '價格提醒', icon: '🔔', act: alertsPanel },
        { label: '全螢幕', icon: '⛶', act: () => toggleFullscreen(document.documentElement) },
        { label: '設定', icon: '⚙', act: settingsPanel },
        { label: LANG === 'en' ? '中文' : 'English', icon: '🌐', act: () => setLang(LANG === 'en' ? 'zh' : 'en') },
      ]);
    }
  }, true);

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
