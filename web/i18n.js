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
