/* 介面語言：繁體中文（原文）／English。
   做法：保留中文原文，英文模式時把畫面上的介面文字依對照表替換（股票名稱、新聞等資料不翻）。 */
const LANG = (() => {
  const q = new URLSearchParams(location.search).get('lang'); // 網址參數 ?lang=en / ?lang=zh（不會記住）
  if (q === 'en' || q === 'zh') return q;
  try { const v = localStorage.getItem('tw.lang'); if (v) return JSON.parse(v); } catch {}
  return /^zh/i.test(navigator.language || '') ? 'zh' : 'en';
})();
document.documentElement.lang = LANG === 'en' ? 'en' : 'zh-Hant';

const I18N_EN = {
  // 導覽
  '看盤': 'Chart', '自選': 'Watchlist', '市場': 'Markets', '熱力圖': 'Heatmap', '排行': 'Movers', '選股': 'Screener', '策略': 'Strategies',
  '期權': 'Options', '資訊': 'Info', '日曆': 'Calendar', '模擬倉': 'Paper', '大盤': 'Index', '提醒': 'Alerts', '設定': 'Settings', '更多': 'More',
  '台股': 'TW', '美股': 'US', '台': 'TW', '美': 'US', '行情': 'Quote', '籌碼': 'Chips', '下單': 'Trade', '筆記': 'Notes',
  // 自選
  '自選股': 'Watchlist', '全部': 'All', '上市': 'TWSE', '上櫃': 'TPEx', '個股': 'Stocks', '名稱代碼': 'Symbol', '走勢': 'Trend',
  '成交價': 'Last', '漲跌幅': 'Chg %', '漲跌': 'Chg', '盤後': 'Post', '盤前': 'Pre', '收合': 'Collapse', '清單選項': 'List options',
  '設定提醒': 'Set alert', '交易（模擬）': 'Trade (paper)', '編輯備註': 'Edit note', '個股筆記': 'Notes', '移到最前': 'Move to top', '移到最後': 'Move to bottom',
  '置頂': 'Pin', '取消置頂': 'Unpin', '自選管理': 'Manage watchlist', '編輯自選分組': 'Groups', '刪除自選': 'Remove', '添加特別關注': 'Star', '取消特別關注': 'Unstar',
  '清除失效股票': 'Remove invalid', '導出列表數據': 'Export CSV', '顯示設定': 'Display', '排序': 'Sort', '漲跌幅色塊': 'Colored change', '盤前盤後價': 'Extended hours',
  '迷你走勢圖': 'Sparklines', '自訂順序': 'Custom order', '漲跌幅 高→低': 'Change ↓', '漲跌幅 低→高': 'Change ↑', '成交價 高→低': 'Price ↓', '名稱': 'Name',
  '新增分組…': 'New group…', '新增分組': 'New group', '加入自選': 'Add to watchlist', '重新命名': 'Rename', '刪除分組': 'Delete group', '刪除': 'Delete', '取消': 'Cancel',
  '確定': 'OK', '儲存': 'Save', '關閉': 'Close', '完成': 'Done', '套用': 'Apply', '還原預設': 'Reset',
  // 圖表
  '分時': '1D', '5日': '5D', '日K': 'Daily', '週K': 'Weekly', '月K': 'Monthly', '季K': 'Quarterly', '年K': 'Yearly', '1分': '1m', '2分': '2m', '3分': '3m', '5分': '5m',
  '10分': '10m', '15分': '15m', '30分': '30m', '60分': '60m', '90分': '90m', '2小時': '2h', '4小時': '4h', '更多 ▾': 'More ▾', '分鐘': 'Minutes', '小時': 'Hours', '長週期': 'Long',
  '盤前盤後': 'Ext. hours', '副圖': 'Panes', '最多 2 個副圖，點兩下關閉': 'Up to 2 panes', '無': 'None', '包絡線': 'Envelope', '唐奇安': 'Donchian',
  '價': 'Price', '開': 'O', '高': 'H', '低': 'L', '收': 'C', '均價': 'VWAP', '昨收': 'Prev', '量(張)': 'Vol (lots)', '量': 'Vol',
  '游標': 'Cursor', '趨勢線': 'Trend line', '射線': 'Ray', '延長線': 'Extended line', '水平線': 'Horizontal line', '水平射線': 'Horizontal ray', '垂直線': 'Vertical line',
  '平行通道': 'Parallel channel', '矩形': 'Rectangle', '黃金分割': 'Fibonacci', '測量': 'Measure', '文字': 'Text', '線條顏色': 'Line color',
  '磁吸（貼齊開高低收）': 'Magnet (snap to OHLC)', '隱藏/顯示畫線': 'Hide/show drawings', '刪除選取的線（Delete）': 'Delete selected (Del)', '清除這檔所有畫線': 'Clear all drawings',
  '多圖': 'Multi', '⊞ 多圖': '⊞ Multi', '多圖同框': 'Multi-chart', '回單圖': 'Single chart', '用自選股填滿': 'Fill from watchlist', '開啟大圖': 'Open chart', '代號': 'Symbol',
  '此週期沒有資料': 'No data for this period', '載入中…': 'Loading…',
  // 右側
  '交易中': 'Open', '已收盤': 'Closed', '盤前交易中': 'Pre-market', '盤後交易中': 'After hours', '夜盤時段（無免費報價）': 'Overnight (no free data)',
  '最高': 'High', '最低': 'Low', '開盤': 'Open', '漲停': 'Limit up', '跌停': 'Limit down', '成交量': 'Volume', '振幅': 'Range', '52週高': '52W high', '52週低': '52W low',
  '成交額': 'Turnover', '五檔': 'Book', '法人': 'Institutions', '模擬下單': 'Paper trade', '新聞': 'News', '公告': 'Filings', '營收': 'Revenue', '評級': 'Ratings', '日程': 'Events',
  '委買': 'Bids', '委賣': 'Asks', '點五檔價格可以帶入模擬下單': 'Click a price to use it in the order', '買進': 'Buy', '賣出': 'Sell', '類型': 'Type', '限價': 'Limit',
  '市價': 'Market', '價格': 'Price', '數量': 'Qty', '張': 'Lots', '股': 'Shares', '股數': 'Shares', '預估金額': 'Est. amount', '手續費': 'Fee', '手續費＋稅': 'Fee + tax',
  '預估付出': 'Est. cost', '預估收入': 'Est. proceeds', '可用現金': 'Cash', '庫存': 'Position', '市價成交': 'At market',
  '外資': 'Foreign', '投信': 'Trust', '自營商': 'Dealers', '自營': 'Dealers', '合計': 'Total', '日期': 'Date',
  '籌碼分布': 'Cost distribution', '獲利比例': 'Profitable', '平均成本': 'Avg cost', '90% 成本': '90% cost', '70% 成本': '70% cost',
  '獲利籌碼（成本低於現價）': 'In profit (cost below price)', '套牢籌碼': 'Underwater', '說明': 'Help',
  '備註（顯示在清單）': 'Note (shown in list)', '自動儲存在這台電腦': 'Saved on this computer', '編輯中…': 'Editing…',
  // 頁面標題
  '全球市場': 'Global markets', '點卡片可以開走勢圖': 'Click a card to open its chart', '台股大盤': 'Taiwan indices', '權值股': 'Heavyweights', '亞洲股市': 'Asia',
  '匯率': 'FX', '美股指數': 'US indices', '指數期貨': 'Index futures', '類股 ETF': 'Sector ETFs', '債券・匯率': 'Bonds & FX', '商品・加密貨幣': 'Commodities & crypto',
  '漲幅': 'Gainers', '跌幅': 'Losers', '成交值': 'Turnover', '含 ETF': 'Incl. ETF', '重新整理': 'Refresh', '+ 自選': '+ Watch', '♥ 已自選': '♥ Watching',
  '市場熱力圖': 'Market heatmap', '依市值': 'By market cap', '依成交值': 'By turnover',
  '台指選擇權': 'TAIEX options', '美股選擇權': 'US options', '價平 ±10 檔': 'ATM ±10', '價平 ±20 檔': 'ATM ±20', '買權 CALL': 'CALLS', '賣權 PUT': 'PUTS', '履約價': 'Strike',
  '未平倉': 'OI', '成交價 ': 'Last', '買價': 'Bid', '賣價': 'Ask', '標的': 'Underlying',
  '個股資訊': 'Company info', '關鍵數據': 'Key stats', '月營收': 'Monthly revenue', '分析師目標價': 'Analyst targets', '重要日期': 'Key dates',
  '每季 EPS（實際 vs 預估）': 'Quarterly EPS (actual vs est.)', '股利歷史（現金，每年合計）': 'Dividends (cash, yearly)', '重大訊息（近期）': 'Material filings (recent)',
  '公司資料': 'Company profile', '主要經營團隊': 'Officers', '業務簡介': 'Business summary', '市場快訊': 'Market news', '本益比': 'P/E', '殖利率': 'Yield', '股價淨值比': 'P/B', '現價': 'Price',
  '當月營收': 'Revenue', '月增率': 'MoM', '年增率': 'YoY', '今年累計': 'YTD', '累計年增': 'YTD YoY', '去年同月': 'Last year', '平均目標價': 'Mean target', '距現價': 'Upside',
  '評等': 'Rating', '分析師人數': 'Analysts', '下次財報': 'Next earnings', '除息日': 'Ex-dividend', '配息日': 'Pay date', '除息日 ': 'Ex-date', '每股股利': 'Dividend',
  '本週焦點': 'Highlights', '業績': 'Earnings', '財經': 'Economy', '權息': 'Dividends', '休市': 'Holidays', '回到本週': 'This week', '焦點篩選': 'Filters',
  '業績、權息只看自選': 'Only my watchlist', '財經數據國家': 'Countries', '週日': 'Sun', '週一': 'Mon', '週二': 'Tue', '週三': 'Wed', '週四': 'Thu', '週五': 'Fri', '週六': 'Sat', '沒有事件': 'No events',
  '美國': 'US', '中國': 'China', '日本': 'Japan', '歐元區': 'Eurozone', '英國': 'UK', '德國': 'Germany', '南韓': 'Korea', '澳洲': 'Australia', '加拿大': 'Canada',
  '虛擬資金，不會真的下單。台股含手續費 0.1425%（最低 20 元）與證交稅；美股以零手續費計。': 'Virtual money only. TW includes 0.1425% fee (min NT$20) and transaction tax; US is commission-free.',
  '重設帳戶': 'Reset account', '持倉': 'Positions', '委託中': 'Open orders', '交易紀錄': 'History', '數量(股)': 'Qty', '均價 ': 'Avg', '市值': 'Mkt value', '今日': 'Today',
  '未實現損益': 'Unrealized P/L', '報酬率': 'Return', '今日損益（持股）': "Today's P/L", '已成交': 'Filled', '已取消': 'Cancelled', '失敗': 'Rejected', '買賣': 'Side', '損益': 'P/L', '狀態': 'Status', '時間': 'Time',
  '還沒有持股。在右側「模擬下單」買進看看。': 'No positions yet. Try buying from the Trade panel.', '沒有委託中的單': 'No open orders', '還沒有交易紀錄': 'No trades yet', '買': 'B', '賣': 'S',
  // 選股
  '快速範本': 'Presets', '基本條件': 'Filters', '產業': 'Sector', '技術條件': 'Technical conditions', '開始選股': 'Run screen', '選股結果': 'Results',
  '用這些股票建立策略': 'Create strategy from results', '全部加入自選': 'Add all to watchlist', '設定條件後按「開始選股」': 'Set filters and click “Run screen”',
  '股價': 'Price', '漲跌幅 %': 'Change %', '成交量（張）': 'Volume (lots)', '成交量（股）': 'Volume', '殖利率 %': 'Yield %', '市值 ≥': 'Mkt cap ≥', '億元': '100M NT$', '十億美元': 'B US$',
  '排除 ETF': 'Exclude ETFs', '高殖利率低本益比': 'High yield, low P/E', '強勢股': 'Momentum', '突破 20 日新高': '20-day breakout', 'RSI 超賣': 'RSI oversold',
  '大型股強勢': 'Large-cap uptrend', '今日大漲且量大': 'Big movers today',
  // 策略
  '我的策略': 'My strategies', '＋ 新增': '+ New', '從範本建立': 'Templates', '最近訊號': 'Recent signals', '監控中': 'Live', '暫停': 'Paused', '立即檢查': 'Check now',
  '股票池': 'Universe', '加入': 'Add', '使用自選股': 'Use watchlist', '清空': 'Clear', '進場條件': 'Entry', '出場條件': 'Exit', '風險控管與資金': 'Risk & sizing',
  '停損 %': 'Stop loss %', '停利 %': 'Take profit %', '最長持有天數': 'Max holding days', '每次投入資金 %': 'Position size %', '監控與執行': 'Monitoring & execution',
  '歷史回測': 'Backtest', '開始回測': 'Run backtest', '1 年': '1Y', '2 年': '2Y', '3 年': '3Y', '5 年': '5Y', '10 年': '10Y', '總報酬': 'Total return', '買進持有': 'Buy & hold',
  '年化報酬': 'CAGR', '最大回撤': 'Max drawdown', '夏普值': 'Sharpe', '交易次數': 'Trades', '勝率': 'Win rate', '獲利因子': 'Profit factor', '平均每筆': 'Avg trade', '平均持有': 'Avg hold',
  '各股表現': 'Per symbol', '股票': 'Symbol', '報酬': 'Return', '交易': 'Trades', '買進日': 'Entry', '賣出日': 'Exit', '買價 ': 'Entry px', '賣價 ': 'Exit px', '天數': 'Days', '原因': 'Reason',
  '停損': 'Stop loss', '停利': 'Take profit', '持有天數到期': 'Max days', '策略報酬勝過買進持有': 'Beat buy & hold', '策略報酬輸給買進持有': 'Lagged buy & hold',
  '符合': 'Match', '全部條件': 'all conditions', '任一條件': 'any condition', '＋ 新增條件': '+ Add condition', '還沒有條件': 'No conditions yet', '刪除條件': 'Remove',
  '向上穿越': 'crosses above', '向下穿越': 'crosses below', '收盤價': 'Close', '開盤價': 'Open', '最高價': 'High', '最低價': 'Low', '當日漲跌幅(%)': 'Change %', 'MA 均線': 'SMA', 'EMA 均線': 'EMA',
  'MACD 柱': 'MACD hist', 'KD K 值': 'Stoch %K', 'KD D 值': 'Stoch %D', '布林上軌': 'BB upper', '布林中軌': 'BB middle', '布林下軌': 'BB lower', '前 N 日最高價': 'N-day high', '前 N 日最低價': 'N-day low',
  'N 日均量': 'Volume SMA', '量比（量 ÷ N 日均量）': 'Volume ratio', '數值': 'Value', '進場': 'Entry', '出場': 'Exit',
  '均線黃金交叉': 'SMA golden cross', 'RSI 超賣反彈': 'RSI rebound', '布林下軌反彈': 'Bollinger rebound', '量增突破 20 日高': 'Volume breakout', 'MACD 黃金交叉': 'MACD cross', 'KD 低檔黃金交叉': 'Stochastic cross',
  '海龜通道突破': 'Turtle breakout', '收盤突破 55 日高點進場，跌破 20 日低點出場': 'Buy a close above the 55-day high, sell below the 20-day low',
  '均線多頭排列': 'Bullish MA stack', 'MA5 > MA20 > MA60 且收盤站上 MA5 進場，跌破 MA20 出場': 'MA5 > MA20 > MA60 and close crosses above MA5; sell below MA20',
  '趨勢跟隨＋移動停損': 'Trend follow + trailing stop', 'ADX > 25 且 +DI 上穿 -DI 進場，從高點回落 8% 出場': '+DI crosses above -DI with ADX > 25; exit on an 8% pullback from the high',
  '負乖離過大反彈': 'Oversold bias rebound', '收盤低於 MA20 超過 10% 進場，回到 MA20 出場': 'Buy 10% below MA20, sell back at MA20',
  '布林收斂後突破': 'Bollinger squeeze breakout', '布林帶寬 < 10% 且收盤突破上軌進場，跌破中軌出場': 'Band width < 10% and close breaks the upper band; sell below the middle band',
  '跳空上漲續強': 'Gap-up momentum', '跳空上漲 > 2% 且量比 > 2 進場，持有 10 天或跌破 MA10 出場': 'Gap up > 2% on 2× volume; hold 10 days or until below MA10',
  '連跌後反彈': 'Losing-streak rebound', '連續下跌 5 天且 RSI < 30 進場，上漲 8% 或持有 10 天出場': '5 down days and RSI < 30; take 8% profit or exit after 10 days',
  '接近 52 週新高': 'Near 52-week high', '距 250 日高點不到 3% 且站上 MA50 進場，移動停損 10%': 'Within 3% of the 250-day high and above MA50; 10% trailing stop',
  'SAR 翻多': 'SAR flip', '收盤由下往上穿越 SAR 進場，跌破 SAR 出場': 'Close crosses above SAR; sell when it crosses below',
  'MFI 超賣＋OBV 轉強': 'MFI oversold + OBV', 'MFI < 20 且 OBV 站上均線進場，MFI > 80 出場': 'MFI < 20 and OBV above its average; sell when MFI > 80',
  '移動停損 %': 'Trailing stop %', '移動停損': 'Trailing stop', '從進場後的最高價回落這麼多 % 就賣出，讓獲利奔跑': 'Sell when price falls this % from its high since entry',
  'ATR 停損（倍）': 'ATR stop (×)', '最短持有天數': 'Min holding days', '停損後冷卻天數': 'Cooldown after stop (days)', '比較大盤': 'Benchmark',
  '0050（預設）': '0050 (default)', '加權指數': 'TAIEX', 'SPY 標普 500（預設）': 'SPY S&P 500 (default)', '歷史訊號統計': 'Signal history', '全部合併': 'All stocks',
  '任意一天進場（對照）': 'Any day (baseline)', '次數': 'Count', '多賺': 'Edge', '市場環境：': 'Market regime: ', '修正': 'Correction', '多頭平穩': 'Uptrend',
  '通知內容': 'Message', '網頁網址': 'App URL', '推播方式': 'Delivery', '盤中即時＋收盤摘要': 'Instant + close summary', '只有盤中即時': 'Instant only',
  '只有收盤摘要（盤中不打擾）': 'Close summary only', '送出台股收盤摘要': 'Send TW summary', '送出美股收盤摘要': 'Send US summary',
  '當日漲跌 − 大盤(%)': 'Day change vs benchmark %', 'N 日報酬 − 大盤(%)': 'N-day return vs benchmark %', '大盤當日漲跌(%)': 'Benchmark change %',
  '大盤距 N 日均線(%)': 'Benchmark vs SMA %', '市場環境（1=多頭平穩，0=修正）': 'Market regime (1 = uptrend, 0 = correction)',
  '★ 台股逢低（只在大盤修正時）': '★ TW dip (only in corrections)', '★ 美股強勢突破（類股站穩時）': '★ US breakout (sector uptrend)', '★ 台股強勢突破': '★ TW breakout',
  '外觀': 'Appearance', '深色': 'Dark', '淺色': 'Light', '跟隨系統': 'System', '功能': 'Features', '偏好設定': 'Preferences', '其他設定': 'More settings',
  '策略回測': 'Strategies', '切換深色／淺色': 'Toggle dark / light', '切換成深色': 'Switch to dark', '切換成淺色': 'Switch to light',
  '全螢幕': 'Full screen', '⛶ 全螢幕': '⛶ Full screen', '⤡ 離開全螢幕': '⤡ Exit full screen', '離開': 'Exit',
  '全螢幕（Esc 離開）': 'Full screen (Esc to exit)', '只有圖表全螢幕（Esc 離開）': 'Chart full screen (Esc to exit)',
  '英文原文': 'Original', '翻譯': 'Translate', '回到最新 K 棒': 'Go to latest bar', '重設圖表（重新載入）': 'Reset chart (reload)', '重新載入圖表': 'Reload chart',
  // 設定、對話框
  '漲跌顏色': 'Up/down colors', '紅漲綠跌（台灣習慣）': 'Red up / green down (Asia)', '綠漲紅跌（歐美習慣）': 'Green up / red down (Western)', '盤中更新頻率': 'Refresh rate',
  '推播通知': 'Push notifications', '版面': 'Layout', '重設左右欄寬度': 'Reset panels', '資料': 'Data', '匯出設定與自選': 'Export settings', '匯入': 'Import', '語言': 'Language',
  '價格提醒': 'Price alerts', '啟用中': 'Active', '最近觸發': 'Recent', '清空紀錄': 'Clear log', '清除提醒': 'Clear alert', '價格漲到 ≥': 'Price ≥', '價格跌到 ≤': 'Price ≤',
  '當日漲幅 ≥ (%)': 'Day gain ≥ (%)', '當日跌幅 ≥ (%)': 'Day loss ≥ (%)', '刪除自選': 'Remove', '送出測試': 'Send test', '主題名稱': 'Topic', '伺服器': 'Server',
  '加入主畫面': 'Add to Home Screen', '大盤走勢': 'Index chart', '策略與回測': 'Strategies', '資訊（新聞、財報）': 'Info',
  '加權': 'TAIEX', '櫃買': 'TPEx', '台指期': 'TX fut.', '道瓊': 'Dow', '那斯達克': 'Nasdaq', '標普500': 'S&P 500', '費半': 'SOX', '美元/台幣': 'USD/TWD', '標普期': 'ES', '那指期': 'NQ',
  '台股交易中': 'TW open', '台股收盤': 'TW closed', '美股交易中': 'US open', '美股收盤': 'US closed', '美股盤前交易': 'US pre-market', '美股盤後交易': 'US after hours', '美股夜盤時段': 'US overnight',
  '台北': 'Taipei', '紐約': 'New York',
  // 整句（策略頁、選股、資訊、對話框）
  '最多 20 檔回測、30 檔監控': 'up to 20 for backtests, 30 for monitoring', '收盤時判斷，隔天開盤買進': 'checked at close, buy next open',
  '任一觸發就賣出（可留空，只用停損停利）': 'sell when any triggers (optional)', '0 代表不使用。回測時資金平均分給股票池每一檔。': '0 = off. Backtest splits capital equally across the universe.',
  '啟用策略（交易時段每分鐘檢查一次，網頁關掉也會繼續）': 'Enable (checked every minute during market hours, even with the page closed)',
  '觸發時推播提醒（Telegram／Discord／ntfy，到「設定」開啟）': 'Push a notification on signals (Telegram / Discord / ntfy — see Settings)',
  '自動在模擬倉下單（進場買進、出場賣出，用模擬資金）': 'Auto-trade in the paper account (buy on entry, sell on exit)',
  '初始資金': 'Capital', '台幣': 'TWD', '美元': 'USD', '還沒有台股策略': 'No Taiwan strategies yet', '還沒有美股策略': 'No US strategies yet',
  '還沒有訊號。啟用策略後，盤中每分鐘檢查一次。': 'No signals yet. Enabled strategies are checked every minute during market hours.',
  '選擇左邊的策略、從範本建立，或按「＋ 新增」': 'Pick a strategy, start from a template, or click “+ New”',
  '回測使用日 K：收盤判斷訊號、隔天開盤成交，含手續費與證交稅。過去績效不代表未來。': 'Daily bars: signals at close, fills at next open, fees and taxes included. Past performance is not indicative of future results.',
  '回測使用日 K：收盤判斷訊號、隔天開盤成交，含手續費。過去績效不代表未來。': 'Daily bars: signals at close, fills at next open, fees included. Past performance is not indicative of future results.',
  '回測中…（抓歷史資料需要幾秒）': 'Backtesting… (fetching history takes a few seconds)', '已套用範本，可以先按「開始回測」看看': 'Template applied — try “Run backtest”',
  '買進持有（同資金）': 'Buy & hold (same capital)', '輸入代號，例如 2330': 'Symbol, e.g. 2330', '輸入代號，例如 AAPL': 'Symbol, e.g. AAPL',
  'MA20 上穿 MA60 進場，下穿出場': 'Buy when SMA20 crosses above SMA60, sell on cross below', 'RSI 由下往上穿越 30 進場，大於 70 出場': 'Buy when RSI crosses above 30, sell above 70',
  '收盤由下往上穿越布林下軌進場，碰上軌出場': 'Buy when close crosses above the lower band, sell at the upper band',
  '收盤創 20 日新高且量比 > 1.5 進場，跌破 MA10 出場': 'Buy on a 20-day high with volume ratio > 1.5, sell below SMA10',
  'DIF 上穿 DEA 進場，下穿出場': 'Buy when MACD crosses above signal, sell on cross below', 'K 上穿 D 且 K < 30 進場，K 下穿 D 出場': 'Buy when %K crosses above %D below 30, sell on cross below',
  '（需要抓歷史資料，最多掃描 150 檔）': '(needs price history, scans up to 150)', '掃描前': 'Scan top', '檔': 'stocks',
  '選股中…（有技術條件時要抓歷史資料，約需 10–30 秒）': 'Screening… (technical conditions take 10–30 s)', '沒有符合條件的股票，試著放寬條件': 'No matches — try loosening the filters',
  '我的策略': 'My strategies', '最近訊號': 'Recent signals', '從範本建立': 'Templates',
  '公司資料、營收、EPS、股利、公告與新聞': 'Profile, revenue, EPS, dividends, filings and news', '請先在自選清單選一檔個股': 'Pick a stock from the watchlist first',
  '期貨、商品、加密貨幣等為 Yahoo Finance 資料，部分可能延遲。': 'Futures, commodities and crypto from Yahoo Finance; some may be delayed.',
  '時間一律為台北時間。經濟數據來源 Nasdaq、台股權息與休市來源證交所。': 'All times are Taipei time. Economic data from Nasdaq; Taiwan dividends and holidays from TWSE.',
  '時間為台北時間；美國數據排前面': 'Taipei time; US releases first', '台北時間': 'Taipei time',

  '半導體': 'Semiconductors', '電子零組件': 'Components', '電腦週邊': 'Computers', '光電': 'Optoelectronics', '通信網路': 'Networking', '其他電子': 'Other electronics', '金融保險': 'Financials',
  '航運': 'Shipping', '生技醫療': 'Biotech', '電機機械': 'Machinery', '鋼鐵': 'Steel', '塑膠': 'Plastics', '建材營造': 'Construction', '食品': 'Food', '綠能環保': 'Green energy', '電子通路': 'Distribution',
  '資訊服務': 'IT services', '汽車': 'Autos', '紡織纖維': 'Textiles', '化學': 'Chemicals', '水泥': 'Cement', '貿易百貨': 'Retail', '油電燃氣': 'Utilities', '觀光餐旅': 'Tourism', '其他': 'Other', '數位雲端': 'Cloud',
  '居家生活': 'Home', '運動休閒': 'Leisure', '玻璃陶瓷': 'Glass', '造紙': 'Paper', '橡膠': 'Rubber', '電器電纜': 'Cables',
};
// 動態文字：正規表達式規則
const I18N_RULES = [
  [/^(\d+) 檔$/, '$1 stocks'], [/^期間 ([\d.]+) 年，最終資產 (.+)$/, 'Period $1 yrs · final equity $2'], [/^賣(\d)$/, 'Ask $1'], [/^買(\d)$/, 'Bid $1'], [/^([\d.,]+[KMBT]?)張$/, '$1 lots'], [/^([\d.,]+[KMBT]?)股$/, '$1 sh'], [/^(\d+) 分鐘前$/, '$1m ago'], [/^(\d+) 小時前$/, '$1h ago'], [/^昨天 (\d\d:\d\d)$/, 'Yesterday $1'],
  [/^更新於 (.+)$/, 'Updated $1'], [/^(\d+) 則$/, '$1 items'], [/^(\d+) 筆$/, '$1'], [/^(\d+) 天$/, '$1 days'], [/^(\d+) 口$/, '$1 contracts'],
  [/^除權息 (\d+)$/, '$1 ex-div'], [/^還有 (\d+) 筆/, '+$1 more'], [/^已加入自選：(.+)$/, 'Added to watchlist: $1'], [/^已刪除自選：(.+)$/, 'Removed: $1'],
  [/^目前是(台股|美股)，點一下切換到(台股|美股)$/, (m, a, b) => `Now ${a === '台股' ? 'Taiwan' : 'US'} — click to switch to ${b === '台股' ? 'Taiwan' : 'US'}`],
  [/^已切換到(台股|美股)$/, (m, a) => `Switched to ${a === '台股' ? 'Taiwan' : 'US'} stocks`],
  [/^(台股|美股)代號或名稱：(.+)$/, (m, a, b) => `${a === '台股' ? 'Taiwan' : 'US'} symbol or name: ${b}`],
];
// AI 選股
Object.assign(I18N_EN, {
  'AI 選股': 'AI Picks', 'AI 模擬倉': 'AI paper account', '重新計算': 'Recompute', '立即調倉': 'Rebalance now', '重新研究': 'Re-run research',
  '規則評分＋回測驗證挑出的策略，並用 AI 自己的模擬倉實際驗證。僅供研究，不構成投資建議。': 'Rule-based scoring with a backtest-selected strategy, forward-tested in the AI\'s own paper account. Research only, not investment advice.',
  '目前策略': 'Current strategy', '參數': 'Parameters', '資料日期・股票池': 'Data date · universe', '自動交易中': 'Auto-trading', '已暫停': 'Paused',
  '開盤後第一次建倉': 'First buys at the next open', '查看帳戶 ›': 'View account ›', '使用策略': 'Strategy', '今日建議': 'Today\'s picks', '驗證結果': 'Validation',
  '滾動樣本外測試': 'Walk-forward (out-of-sample) test', 'AI 動作紀錄': 'AI activity log', '名次': 'Rank', '收盤': 'Close', '現價': 'Last', '近一月': '1M', '半年': '6M',
  '入選理由': 'Why it was picked', '持有': 'Held', '策略（各自最佳參數）': 'Strategy (best parameters)', '近 3 月': '3M', '近 6 月': '6M', '近 12 月': '12M', '近 3 年': '3Y',
  '近 12 月夏普': '12M Sharpe', '3 年最大回撤': '3Y max drawdown', '等權重全買股票池': 'Equal-weight universe', '選策略的日期': 'Selection date', '當時選中': 'Picked then',
  '下一季': 'Next quarter', '等權重': 'Equal-weight', '台股市值前': 'Top Taiwan stocks by market cap:', '美股市值前': 'Top US stocks by market cap:', ' 檔': '',
  '我的': 'Mine', '台指期近月': 'TAIEX Futures (front month)', '小台指近月': 'Mini TAIEX Futures (front month)', '期貨': 'Futures', '指數': 'Index', '完整期貨報價請到「期權」頁': 'Full futures quotes are on the Options page', '分享給朋友': 'Share with a friend', '取得分享連結': 'Get share link', '複製網址': 'Copy link', '重設連結（舊連結會失效）': 'Reset link (old link stops working)', '已複製': 'Copied', '關閉': 'Close', '價格軸：漲跌百分比': 'Price axis: % change', '價格軸：價格': 'Price axis: price', '價格軸改回價格': 'Price axis: show price', '價格軸改成百分比': 'Price axis: show %', 'Minervini 趨勢模板（均線多頭排列、200 日線上升、離低點遠、近高點），挑相對強度最高': 'Minervini trend template (stacked MAs, rising 200-day, far above the low, near the high), highest relative strength', '大盤跌破 200 日線就空手': 'Cash below the 200-day MA', '市場廣度不足就空手': 'Cash when breadth is weak', '跌破 200 日線空手、出現追蹤日提早進場': 'Cash below the 200-day MA, re-enter early on a follow-through day', '股票池站上 50、200 日線的比例平均低於 40% 就空手': 'Cash when under 40% of the universe is above its 50/200-day MAs', '大盤跌破 200 日線就空手，但出現追蹤日（底部確認）就提早進場': 'Cash below the 200-day MA, but re-enter early on a follow-through day', '大盤狀態': 'Market', '市場廣度': 'Breadth', '建議事後追蹤': 'Pick follow-up', '實盤': 'Live', '回填': 'Backfill', '空手': 'Cash', '持股': 'Invested', '來源': 'Source', '大盤濾網': 'Market filter', '5 日後': '+5d', '20 日後': '+20d', '通過壓力測試': 'Passed stress tests', '第二階段趨勢模板': 'Stage 2 trend template', '追蹤日濾網': 'FTD filter', '廣度濾網': 'Breadth filter', '200 日線濾網': '200-day MA filter', '前半段 vs 等權重': '1st half vs EW', '後半段 vs 等權重': '2nd half vs EW', '選法穩定': 'Stable method', '選法不穩定': 'Unstable method', '近 1 月': '1M', '選策略方式比較': 'Selection methods compared', '看哪些期間': 'Lookback', '多久重選': 'Re-select', '累積報酬': 'Cumulative', '最大回撤': 'Max drawdown', '贏等權重的次數': 'Periods beating equal-weight', '每月': 'Monthly', '每季': 'Quarterly', '採用': 'In use', '交易所時間': 'exchange time', '夜盤交易中': 'Overnight', '還沒有動作。開盤時 AI 會自動建倉，之後依調倉週期換股。': 'No activity yet. The AI buys at the next open and rotates on its rebalance schedule.',
  'AI 還沒有持股：開盤時會依「AI 選股」頁的策略自動買進。': 'No AI holdings yet — it buys at the next open using the strategy on the AI Picks page.',
  '策略與每日建議在「AI 選股」頁': 'Strategy and daily picks are on the AI Picks page', 'AI 自動管理，點一列切到該股票': 'Managed by the AI · click a row to open the chart',
  // 策略名稱與說明
  '半年動能': '6-month momentum', '12-1 動能': '12-1 momentum', '多頭排列＋季動能': 'Uptrend + 3M momentum', '一年新高突破': '52-week high breakout', '低波動動能': 'Low-vol momentum',
  '多頭拉回': 'Uptrend pullback', '短線反轉': 'Short-term reversal', '量增轉強': 'Volume surge', '貼近新高': 'Near 52-week high', '綜合評分': 'Composite score',
  '離一年高點最近、且在多頭排列': 'Closest to the 52-week high while in an uptrend', '近 5 天跌最多（均值回歸）': 'Biggest 5-day losers (mean reversion)',
  '過去 120 天漲最多': 'Biggest 120-day gainers', '過去一年（扣掉最近一個月）漲最多': 'Biggest 12-month gainers, skipping the last month',
  '股價 > 季線 > 半年線，挑近 60 天最強': 'Price > 60MA > 120MA, strongest over 60 days', '距一年高點 3% 內且量增，挑近 20 天最強': 'Within 3% of the 52-week high on rising volume, strongest over 20 days',
  '半年報酬 ÷ 波動度，漲得穩的優先': '6-month return ÷ volatility', '長期多頭中 RSI 跌到 45 以下，挑短線跌最多': 'RSI below 45 inside a long-term uptrend',
  '5 日均量 > 60 日均量 1.5 倍且上漲，挑近 20 天最強': '5-day volume > 1.5× 60-day volume and rising', '半年動能 + 月動能 + 多頭排列 − 波動度（各自排名後加總）': 'Ranks of 6M + 1M momentum + uptrend − volatility',
  // 入選理由
  '多頭排列（股價 > 季線 > 半年線）': 'Uptrend (price > 60MA > 120MA)', '、': ', ', '半年 ': '6M ', '近一月 ': '1M ', '貼近一年新高': 'near 52-week high', '量能放大 ': 'volume ', ' 倍': '×', '年化波動 ': 'ann. vol ',
  // 參數
  '持股 ': 'Hold ', '・每 ': ' · rebalance every ', ' 個交易日調倉': ' trading days', '・停損 ': ' · stop loss ', '・不設停損': ' · no stop loss', '・大盤跌破 200 日線就空手': ' · go to cash below the 200-day MA', '・不看大盤': ' · no market filter',
  '自動：用研究第一名': 'Auto: research winner', '・': ' · ', ' 日': 'd', '無停損': 'no stop', '停損 ': 'stop ', '看大盤': 'market filter', '不看大盤': 'no market filter',
});
I18N_RULES.push(
  [/^大盤（(\S+) ([\d.,]+)）在 200 日均線 ([\d.,]+) 之下，策略設定為空手，下次調倉會全部出場。$/, 'The market ($1 $2) is below its 200-day MA ($3), so the strategy goes to cash at the next rebalance.'],
  [/^以 (\S+) 收盤資料評分，前 (\d+) 名為買進名單；排名掉出前 (\d+) 名才賣，減少換手$/, 'Scored on the $1 close · top $2 are bought · a holding is sold only after it drops out of the top $3'],
  [/^研究於 (.+?)・(\d+) 檔・(\d+) 組設定(.*)$/, 'Research run $1 · $2 stocks · $3 configurations'],
  [/^：只用當時以前的資料選策略、再看下一季的真實表現，串接 (\d+) 季累積$/, ': choosing the strategy with only the data available at the time, then holding it for the next quarter, compounded over $1 quarters: '],
  [/^，贏過等權重全買 (\S+) 和大盤 (\S+)。$/, ', beating equal-weight $1 and the index $2.'],
  [/^：串接 (\d+) 季累積 (\S+)，等權重全買 (\S+)、大盤 (\S+)。這個市場的選股優勢不明顯，建議只當參考。$/, ': compounded over $1 quarters $2 vs. equal-weight $3 and index $4. No clear edge in this market — treat the picks as reference only.'],
  [/^上次調倉 (\S+)・已過 (\d+) 個交易日$/, 'Last rebalance $1 · $2 trading days ago'],
  [/^理由：(.+)$/, (m, a) => 'Reason: ' + a],
);
Object.assign(I18N_EN, {
  '樣本外有效': 'Works out of sample', '樣本外沒有贏': 'Does not win out of sample',
  '選策略的方式：依近 6 個月與 12 個月的夏普值排名（滾動測試中比加入 3 個月或 3 年的版本好）；多數時段輸給等權重全買、或回撤超過 35% 的會被扣分。股票池用的是目前的大型股，回測報酬會偏高（倖存者偏差），所以重點看「有沒有贏等權重全買」。':
    'How the strategy is chosen: ranked by Sharpe ratio over the last 6 and 12 months (this beat versions that also weigh 3 months or 3 years in the walk-forward test); configurations that lose to equal-weight in most windows or draw down more than 35% are penalized. The universe is today\'s large caps, so backtest returns are inflated by survivorship bias — what matters is whether it beats the equal-weight universe.',
  '每一季只用當時以前的資料選出第一名，持有下一季': 'Each quarter, pick the winner using only past data, then hold it for the next quarter',
  '數字顏色：贏等權重全買為紅（漲色），輸為綠（跌色）。滑鼠移到數字上可看超額報酬。': 'Colors: beats equal-weight in the up color, loses in the down color. Hover a number for the excess return.',
});
I18N_RULES.push(
  [/^修正中：反彈嘗試第 (\d+) 天，等待追蹤日（第 4～10 天大漲 1.25% 以上且量增）$/, 'Correction: rally attempt day $1, waiting for a follow-through day (day 4–10, up 1.25%+ on higher volume)'],
  [/^修正中，但已出現追蹤日（第 (\d+) 天），底部確認$/, 'Correction, but a follow-through day appeared (day $1) — bottom confirmed'],
  [/^目前的大盤濾網（(.+)）判定空手，下次調倉會全部出場；名單仍照常列出供參考。$/, (m, a) => `The market filter (${I18N_EN[a] || a}) says cash: everything is sold at the next rebalance. Picks are still listed for reference.`],
  [/^成本加重（每邊滑價 0.3%）後，近 3 年仍贏等權重全買 (\S+)$/, 'With costs raised (0.3% slippage per side) it still beats equal-weight over 3 years by $1'],
  [/^逐年有一半以上贏等權重全買：(\d+) \/ (\d+) 年（(.+)）$/, 'Beats equal-weight in at least half the years: $1 / $2 ($3)'],
  [/^近 3 年 (\d+) 筆出場交易（至少 30 筆才有統計意義）$/, '$1 closed trades in 3 years (30+ needed to be meaningful)'],
  [/^(\d+) 個交易日後：平均$/, '+$1 trading days: average'],
  [/^，大盤 (\S+)；(\d+) 天中 (\S+) 贏大盤$/, ', index $1; beat the index on $3 of $2 days'],
  [/^實盤紀錄 (\d+) 天（從開始使用後每天累積）.*$/, 'Live record: $1 days (accumulates daily). The rest is backfill: picks made with the data available each day (no look-ahead) but with today\'s strategy settings. Picks are listed even when the market filter is in cash.'],
);
Object.assign(I18N_EN, {
  '修正中：大盤在 200 日線之下，還沒有反彈嘗試': 'Correction: below the 200-day MA, no rally attempt yet', '多頭：大盤在 200 日線之上': 'Uptrend: above the 200-day MA',
  '股票池站上 50 日線': 'Universe above the 50-day MA', '、站上 200 日線': ', above the 200-day MA',
  '（找「最不容易壞」的策略，而不是紙上賺最多的）': '(the strategy least likely to break, not the best on paper)',
  '參數小改（持股數、調倉頻率、停損）成績差不多，不是剛好的尖峰': 'Small parameter changes (holdings, rebalance, stop) perform similarly — a plateau, not a lucky spike',
  '沒有策略通過全部壓力測試，採用通過最多項的': 'No strategy passed every stress test; using the one that passed the most',
  '每天的買進名單（等權重）之後 5、20 個交易日的實際漲跌': 'How each day\'s buy list (equal-weight) actually did 5 and 20 trading days later',
});
const I18N_SKIP = '.wname b, .nm b, .side-name, .news-item, .hm-c b, .mt-name, #topQuote b, .ann summary .t, .ev .tt, .sitem .n, .uchip, .st-ev b, .kv td, .summary, .hm-tip b, .wnote, .side-note, .st-item b, .tbl td.l .nm';
const I18N_KEYS = Object.keys(I18N_EN).filter((k) => k.length >= 2).sort((a, b) => b.length - a.length);
const CJK = /[\u4e00-\u9fff]/;
function trText(s) {
  const t = s.trim(); if (!t || !CJK.test(t)) return s;
  if (I18N_EN[t] !== undefined) return s.replace(t, I18N_EN[t]);
  for (const [re, rep] of I18N_RULES) if (re.test(t)) return s.replace(t, t.replace(re, rep));
  let out = t; // 片語替換（長的先換）；換完還有中文就保留原文，避免中英夾雜
  for (const k of I18N_KEYS) if (out.includes(k)) out = out.split(k).join(I18N_EN[k]);
  return CJK.test(out) ? s : s.replace(t, out);
}
function i18nApply(root) {
  if (LANG !== 'en' || !root) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
  for (const n of nodes) {
    const p = n.parentElement; if (!p || p.closest('script,style,textarea') || p.closest(I18N_SKIP)) continue;
    if (!CJK.test(n.nodeValue)) continue;
    const v = trText(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v;
  }
  (root.querySelectorAll ? root.querySelectorAll('[placeholder],[title]') : []).forEach((el) => {
    ['placeholder', 'title'].forEach((a) => { const v = el.getAttribute(a); if (v && CJK.test(v)) el.setAttribute(a, trText(v)); });
  });
}
if (LANG === 'en') {
  let pending = new Set(), raf = 0;
  const mo = new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === 'characterData') pending.add(m.target.parentElement);
      else m.addedNodes.forEach((n) => pending.add(n.nodeType === 3 ? n.parentElement : n));
      if (m.type === 'attributes') pending.add(m.target);
    }
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; const list = [...pending]; pending = new Set(); list.forEach((el) => el && i18nApply(el)); });
  });
  document.addEventListener('DOMContentLoaded', () => {
    document.title = 'NightMarket';
    i18nApply(document.body);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title'] });
  });
}
function setLang(l) { try { localStorage.setItem('tw.lang', JSON.stringify(l)); } catch {} location.reload(); }
