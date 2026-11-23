const escapeHtml = value => String(value ?? '—').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const money = value => {
  const amount = Number(value) || 0;
  return (amount < 0 ? '-$' : '$') + Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const marketDate = unix => {
  const value = Number(unix);
  const seconds = Math.abs(value) > 1e12 ? value / 1000 : value;
  return new Date((seconds + 3 * 3600) * 1000);
};
const dateKey = unix => {
  const d = marketDate(unix);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};
const dateLabel = key => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
};
const timeLabel = unix => unix ? marketDate(unix).toLocaleString(undefined, { timeZone: 'UTC', month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const duration = trade => {
  const seconds = Math.max(0, Number(trade.closeTime) - Number(trade.openTime));
  if (!Number.isFinite(seconds)) return '—';
  const days = Math.floor(seconds / 86400), hours = Math.floor(seconds % 86400 / 3600), minutes = Math.floor(seconds % 3600 / 60), secs = Math.floor(seconds % 60);
  return days ? `${days}d ${hours}h ${minutes}m` : hours ? `${hours}h ${minutes}m ${secs}s` : minutes ? `${minutes}m ${secs}s` : `${secs}s`;
};
const percent = value => `${(Number(value) || 0).toFixed(2)}%`;


function buildCurveSvg(curve, benchmarkLabel = 'Buy & Hold') {
  const width=1100,height=330,left=76,right=24,top=38,bottom=52;
  const values=curve.flatMap(point=>[Number(point.pnl)||0, Number.isFinite(Number(point.benchmarkPnl))?Number(point.benchmarkPnl):null]).filter(value=>value!==null);
  if(!values.length)return '<div class="empty">No closed trades yet — the equity curve will appear after trades are closed.</div>';
  const equityValues=curve.map(point=>Number(point.pnl)||0);
  const min=Math.min(0,...values),max=Math.max(0,...values),span=Math.max(max-min,1);
  const x=i=>left+(curve.length===1?(width-left-right)/2:i/(curve.length-1)*(width-left-right));
  const y=v=>top+(max-v)/span*(height-top-bottom);
  const makePath=coords=>{
    if(!coords.length)return '';
    let path='M '+coords[0].x.toFixed(1)+' '+coords[0].y.toFixed(1);
    for(let i=0;i<coords.length-1;i++){
      const p0=coords[Math.max(0,i-1)],p1=coords[i],p2=coords[i+1],p3=coords[Math.min(coords.length-1,i+2)];
      const c1x=p1.x+(p2.x-p0.x)/6,c1y=p1.y+(p2.y-p0.y)/6,c2x=p2.x-(p3.x-p1.x)/6,c2y=p2.y-(p3.y-p1.y)/6;
      path+=' C '+c1x.toFixed(1)+' '+c1y.toFixed(1)+', '+c2x.toFixed(1)+' '+c2y.toFixed(1)+', '+p2.x.toFixed(1)+' '+p2.y.toFixed(1);
    }
    return path;
  };
  const coords=curve.map((point,i)=>({x:x(i),y:y(Number(point.pnl)||0)}));
  const linePath=makePath(coords);
  const areaBottom=height-bottom;
  const areaPath=linePath+' L '+coords[coords.length-1].x.toFixed(1)+' '+areaBottom+' L '+coords[0].x.toFixed(1)+' '+areaBottom+' Z';
  const benchmarkCoords=curve.map((point,i)=>Number.isFinite(Number(point.benchmarkPnl))?({x:x(i),y:y(Number(point.benchmarkPnl))}):null).filter(Boolean);
  const benchmarkPath=benchmarkCoords.length>1?makePath(benchmarkCoords):'';
  let peak=equityValues[0],peakIndex=0,worst=null;
  equityValues.forEach((value,index)=>{if(value>peak){peak=value;peakIndex=index;}const depth=peak-value;if(!worst||depth>worst.depth)worst={depth,peakIndex,troughIndex:index,peak};});
  let recoveryIndex=worst?.troughIndex??0;
  while(recoveryIndex<equityValues.length-1&&equityValues[recoveryIndex]<(worst?.peak??0))recoveryIndex++;
  const ddStart=worst?.peakIndex??0,ddEnd=recoveryIndex,ddPoints=coords.slice(ddStart,ddEnd+1);
  const ddRect=worst?.depth>0&&ddEnd>ddStart ? { x: coords[ddStart].x, width: Math.max(0, coords[ddEnd].x-coords[ddStart].x) } : null;
  const startTime=Number(curve[ddStart]?.timestamp||0),endTime=Number(curve[ddEnd]?.timestamp||curve[curve.length-1]?.timestamp||0),elapsedSeconds=Math.max(0,endTime-startTime);
  const elapsed=elapsedSeconds>=86400?Math.floor(elapsedSeconds/86400)+'d '+Math.floor(elapsedSeconds%86400/3600)+'h':elapsedSeconds>=3600?Math.floor(elapsedSeconds/3600)+'h '+Math.floor(elapsedSeconds%3600/60)+'m':Math.floor(elapsedSeconds/60)+'m';
  const ticks=Array.from({length:5},(_,i)=>min+(max-min)*i/4);
  const grid=ticks.map(value=>{const yy=y(value);return '<line x1="'+left+'" y1="'+yy+'" x2="'+(width-right)+'" y2="'+yy+'" stroke="#354052" stroke-dasharray="4 5"/><text x="'+(left-10)+'" y="'+(yy+4)+'" text-anchor="end" fill="#929db0" font-size="12">'+money(value)+'</text>';}).join('');
  const labels=curve.map((point,index)=>({point,index})).filter(({index})=>curve.length<=12||index%Math.ceil(curve.length/10)===0||index===curve.length-1);
  const xLabels=labels.map(({point,index})=>'<text x="'+x(index)+'" y="'+(height-18)+'" text-anchor="middle" fill="#929db0" font-size="10">'+escapeHtml(point.label||point.date?.slice(5)||'')+'</text>').join('');
  const labelX=ddRect?ddRect.x+ddRect.width/2:left+(width-left-right)/2;
  const labelY=top+(height-top-bottom)/2;
  const boxX=Math.max(left,Math.min(width-right-170,labelX-85));
  const ddAnnotation=ddRect?'<rect x="'+ddRect.x+'" y="'+top+'" width="'+ddRect.width+'" height="'+(height-top-bottom)+'" fill="url(#drawdownFill)" stroke="none"/><rect x="'+boxX+'" y="'+(labelY-11)+'" width="170" height="22" rx="5" fill="#1a2130" fill-opacity=".98" stroke="#ff6969"/><text x="'+(boxX+85)+'" y="'+(labelY+4)+'" text-anchor="middle" fill="#ff8585" font-size="11" font-weight="bold">Max DD '+money(worst.depth)+' · '+elapsed+'</text>':'';
  const legend='<g transform="translate('+(width-310)+',14)"><line x1="0" y1="0" x2="22" y2="0" stroke="#2563eb" stroke-width="3"/><text x="28" y="4" fill="#d5d9e2" font-size="10">Strategy equity</text>'+(benchmarkPath?'<line x1="142" y1="0" x2="164" y2="0" stroke="#f5b84b" stroke-width="2.5" stroke-dasharray="5 3"/><text x="170" y="4" fill="#d5d9e2" font-size="10">'+escapeHtml(benchmarkLabel)+'</text>':'')+'</g>';
  return '<svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="Trade-by-trade equity curve with buy and hold benchmark"><defs><linearGradient id="equityBlueFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2563eb" stop-opacity=".34"/><stop offset="100%" stop-color="#0b0e11" stop-opacity=".18"/></linearGradient><linearGradient id="drawdownFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#b42318" stop-opacity=".20"/><stop offset="100%" stop-color="#ff6969" stop-opacity=".18"/></linearGradient></defs>'+legend+grid+ddAnnotation+'<path d="'+areaPath+'" fill="url(#equityBlueFill)" stroke="none"/>'+(benchmarkPath?'<path d="'+benchmarkPath+'" fill="none" stroke="#f5b84b" stroke-width="2.5" stroke-dasharray="6 4" stroke-linejoin="round" stroke-linecap="round"/>':'')+'<path d="'+linePath+'" fill="none" stroke="#2563eb" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>'+coords.map(p=>'<circle cx="'+p.x+'" cy="'+p.y+'" r="2.5" fill="#2563eb"/>').join('')+xLabels+'</svg>';
}

function buildCalendar(dailyEntries) {
  if (!dailyEntries.length) return '<div class="empty">No trading days to display.</div>';
  const daily = Object.fromEntries(dailyEntries.map(([key, value]) => [key, value]));
  const first = new Date(dailyEntries[0][0] + 'T12:00:00Z');
  const last = new Date(dailyEntries[dailyEntries.length - 1][0] + 'T12:00:00Z');
  const months = [];
  const cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
  const end = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 1));
  while (cursor <= end) {
    const year = cursor.getUTCFullYear(), month = cursor.getUTCMonth();
    const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
    const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const cells = Array.from({ length: Math.ceil((firstWeekday + days) / 7) * 7 }, (_, index) => {
      const day = index - firstWeekday + 1;
      if (day < 1 || day > days) return '<td class="blank"></td>';
      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const item = daily[key];
      const pnl = item?.pnl || 0;
      const cls = !item ? 'inactive' : pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : 'flat';
      return `<td class="${cls}"><b>${day}</b>${item ? `<span>${money(pnl)}</span><small>${item.trades} trades</small>` : ''}</td>`;
    });

    const rows = [];
    const weekSummaries = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push('<tr>' + cells.slice(i, i + 7).join('') + '</tr>');
      const weekItems = Array.from({length:7}, (_,offset) => {
        const day=i+offset-firstWeekday+1;
        if(day<1||day>days)return null;
        return daily[year+'-'+String(month+1).padStart(2,'0')+'-'+String(day).padStart(2,'0')];
      }).filter(Boolean);
      const weekPnl=weekItems.reduce((sum,item)=>sum+(Number(item?.pnl)||0),0);
      const weekTrades=weekItems.reduce((sum,item)=>sum+(Number(item?.trades)||0),0);
      const weekDays=weekItems.filter(item=>Number(item?.trades)>0).length;
      weekSummaries.push('<div class="week-item"><small>Week '+(weekSummaries.length+1)+'</small><b class="'+(weekPnl>=0?'gain':'loss')+'">'+money(weekPnl)+'</b><span>'+weekTrades+' trades · '+weekDays+' days</span></div>');
    }
    const monthEntries = dailyEntries.filter(([key]) => key.startsWith(year+'-'+String(month+1).padStart(2,'0')+'-'));
    const monthPnl = monthEntries.reduce((sum, [, value]) => sum + value.pnl, 0);
    const monthTrades = monthEntries.reduce((sum, [, value]) => sum + value.trades, 0);
    months.push('<section class="month-card"><div class="month-heading"><h3>'+cursor.toLocaleDateString(undefined,{month:'long',year:'numeric',timeZone:'UTC'})+'</h3><b class="'+(monthPnl>=0?'gain':'loss')+'">'+money(monthPnl)+'</b><span>'+monthTrades+' trades</span></div><div class="month-content"><table class="calendar"><thead><tr>'+['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day=>'<th>'+day+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table><aside class="week-summary">'+weekSummaries.join('')+'</aside></div></section>');
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months.join('');
}

export function buildAnalyticsPrintHtml({ sessionName, symbol, sessionId, startBalance, balance, timezone, backtestRange, trades, metrics, dailyEntries, curve, screenshots }) {
  const generated = new Date().toLocaleString();
  const summaryCards = [
    ['Net P&L', money(metrics.netPnl), metrics.netPnl >= 0 ? 'gain' : 'loss'],
    ['Trade win rate', percent(metrics.winRate), 'blue'],
    ['Avg win/loss', Number(metrics.avgRatio || 0).toFixed(2), 'blue'],
    ['Profit factor', metrics.profitFactor === Infinity ? '∞' : Number(metrics.profitFactor || 0).toFixed(2), metrics.profitFactor >= 1 ? 'gain' : 'loss'],
    ['Average R', Number(metrics.averageR || 0).toFixed(2) + 'R', metrics.averageR >= 0 ? 'gain' : 'loss'],
    ['Closed DD', percent(metrics.maxClosedDrawdown), 'loss'],
    ['Current streak', metrics.currentStreak, 'neutral'],
  ];
  const metricTone = label => ({
    'Starting balance': 'blue', 'Final balance': 'blue', 'Net P&L': metrics.netPnl >= 0 ? 'gain' : 'loss',
    'Return': metrics.returnPct >= 0 ? 'gain' : 'loss', 'Total closed trades': 'blue', 'Wins': 'gain', 'Losses': 'loss',
    'Breakeven': 'warn', 'Win rate': 'blue', 'Gross profit': 'gain', 'Gross loss': 'loss', 'Average win': 'gain',
    'Average loss': 'loss', 'Average win/loss ratio': 'blue', 'Profit factor': metrics.profitFactor >= 1 ? 'gain' : 'loss',
    'Average R': metrics.averageR >= 0 ? 'gain' : 'loss', 'Maximum closed drawdown': 'loss', 'Largest win': 'gain',
    'Largest loss': 'loss', 'Maximum consecutive wins': 'gain', 'Maximum consecutive losses': 'loss',
    'Current streak': String(metrics.currentStreak).toLowerCase().includes('winning') ? 'gain' : String(metrics.currentStreak).toLowerCase().includes('losing') ? 'loss' : 'warn',
    'Long trades': 'gain', 'Short trades': 'warn', 'Peak closed balance': 'blue',
  })[label] || 'neutral';
  const metricRows = [
    ['Starting balance', money(startBalance)], ['Final balance', money(balance)], ['Net P&L', money(metrics.netPnl)], ['Return', percent(metrics.returnPct)],
    ['Total closed trades', metrics.totalTrades], ['Wins', metrics.wins], ['Losses', metrics.losses], ['Breakeven', metrics.breakeven],
    ['Win rate', percent(metrics.winRate)], ['Gross profit', money(metrics.grossProfit)], ['Gross loss', money(-metrics.grossLoss)],
    ['Average win', money(metrics.avgWin)], ['Average loss', money(-metrics.avgLoss)], ['Average win/loss ratio', Number(metrics.avgRatio).toFixed(2)],
    ['Profit factor', metrics.profitFactor === Infinity ? '∞' : Number(metrics.profitFactor).toFixed(2)], ['Average R', `${Number(metrics.averageR).toFixed(2)}R`],
    ['Maximum closed drawdown', percent(metrics.maxClosedDrawdown)], ['Largest win', money(metrics.largestWin)], ['Largest loss', money(metrics.largestLoss)],
    ['Maximum consecutive wins', metrics.maxWins], ['Maximum consecutive losses', metrics.maxLosses], ['Current streak', metrics.currentStreak],
    ['Long trades', `${metrics.longTrades} · ${percent(metrics.longWinRate)} win`], ['Short trades', `${metrics.shortTrades} · ${percent(metrics.shortWinRate)} win`],
    ['Peak closed balance', money(metrics.maxBalance)],
  ];
  const winningTrades = trades.filter(trade => Number(trade.pnl) > 0);
  const losingTrades = trades.filter(trade => Number(trade.pnl) < 0);
  const breakevenTrades = trades.filter(trade => Number(trade.pnl) === 0);
  const avgDuration = list => list.length ? list.reduce((sum, trade) => sum + Math.max(0, Number(trade.closeTime || 0) - Number(trade.openTime || 0)), 0) / list.length : 0;
  const durationText = seconds => {
    const mins = Math.round(seconds / 60), hours = Math.floor(mins / 60), days = Math.floor(hours / 24);
    return days ? days + 'd ' + (hours % 24) + 'h' : hours ? hours + 'h ' + (mins % 60) + 'm' : mins + 'm';
  };
  const buyTrades = trades.filter(trade => String(trade.type || '').toLowerCase() === 'buy');
  const sellTrades = trades.filter(trade => String(trade.type || '').toLowerCase() === 'sell');
  const sideStats = list => ({ total: list.length, wins: list.filter(trade => Number(trade.pnl) > 0).length, pnl: list.reduce((sum, trade) => sum + (Number(trade.pnl) || 0), 0) });
  const buyStats = sideStats(buyTrades), sellStats = sideStats(sellTrades);
  const donut = (first, second, firstColor, secondColor) => {
    const total = first + second, ratio = total ? first / total * 100 : 0;
    return '<div class="donut" style="background:conic-gradient(' + firstColor + ' 0 ' + ratio + '%, ' + secondColor + ' ' + ratio + '% 100%)"><span>' + total + '</span></div>';
  };
  const weekdayStats = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day, index) => {
    const entries = dailyEntries.filter(([key]) => new Date(key + 'T12:00:00Z').getUTCDay() === index);
    return { day, pnl: entries.reduce((sum, [, value]) => sum + (Number(value.pnl) || 0), 0), trades: entries.reduce((sum, [, value]) => sum + (Number(value.trades) || 0), 0), wins: entries.reduce((sum, [, value]) => sum + (Number(value.wins) || 0), 0) };
  });
  const maxDayAbs = Math.max(1, ...weekdayStats.map(item => Math.abs(item.pnl)));
  const dayBars = weekdayStats.map(item => {
    const width = Math.abs(item.pnl) / maxDayAbs * 48;
    const left = item.pnl < 0 ? 50 - width : 50;
    return '<div class="day-row"><span>' + item.day + '</span><div class="day-track"><i class="day-zero"></i><i class="day-bar ' + (item.pnl >= 0 ? 'gain-bar' : 'loss-bar') + '" style="left:' + left + '%;width:' + width + '%"></i></div><b>' + money(item.pnl) + '</b><small>' + (item.trades ? Math.round(item.wins / item.trades * 100) : 0) + '%</small></div>';
  }).join('');
  const monthlyStats = new Map();
  dailyEntries.forEach(([key, value]) => {
    const monthKey = key.slice(0, 7), current = monthlyStats.get(monthKey) || { pnl: 0, trades: 0 };
    current.pnl += Number(value.pnl) || 0; current.trades += Number(value.trades) || 0; monthlyStats.set(monthKey, current);
  });
  const reportYear = dailyEntries.length ? Number(dailyEntries[dailyEntries.length - 1][0].slice(0, 4)) : new Date().getFullYear();
  const yearMonthlyStats = [...monthlyStats.entries()].filter(([key]) => Number(key.slice(0, 4)) === reportYear);
  const yearPnl = yearMonthlyStats.reduce((sum, [, value]) => sum + value.pnl, 0);
  const yearTrades = yearMonthlyStats.reduce((sum, [, value]) => sum + value.trades, 0);
  const monthCells = Array.from({length:12}, (_, index) => {
    const monthKey = reportYear + '-' + String(index + 1).padStart(2, '0');
    const item = monthKey ? monthlyStats.get(monthKey) : null;
    return '<div class="month-cell"><span>' + new Date(Date.UTC(reportYear,index,1)).toLocaleDateString(undefined,{month:'short',timeZone:'UTC'}) + '</span><b class="' + (item ? item.pnl >= 0 ? 'gain' : 'loss' : 'neutral') + '">' + (item ? money(item.pnl) : '—') + '</b><small>' + (item ? item.trades + ' trades' : 'No trades') + '</small></div>';
  }).join('');
  const expectancy = trades.length ? metrics.netPnl / trades.length : 0;
  const performanceSections = `
    <section class="section"><h2>Expectancy &amp; Profit Factor</h2><div class="two-panels">
      <div class="dashboard-panel"><small>Expectancy per trade</small><h2 class="${expectancy >= 0 ? 'gain' : 'loss'}">${money(expectancy)}</h2><div class="expectancy-track"><i style="width:${Math.min(100, Math.max(0, metrics.winRate || 0))}%"></i></div><p class="muted">Average realized P&amp;L per closed trade</p></div>
      <div class="dashboard-panel"><small>Profit factor</small><h2 class="${metrics.profitFactor >= 1 ? 'gain' : 'loss'}">${metrics.profitFactor === Infinity ? '∞' : Number(metrics.profitFactor || 0).toFixed(2)}</h2><p class="muted">Gross profit divided by gross loss</p></div>
    </div></section>
    <section class="section"><h2>Winners and Losers</h2><div class="two-panels">
      <div class="dashboard-panel winner-panel"><h3>Winners</h3><div class="compact-stat"><span>Total winners</span><b>${winningTrades.length}</b></div><div class="compact-stat"><span>Best win</span><b class="gain">${money(metrics.largestWin)}</b></div><div class="compact-stat"><span>Average win</span><b class="gain">${money(metrics.avgWin)}</b></div><div class="compact-stat"><span>Average duration</span><b>${durationText(avgDuration(winningTrades))}</b></div><div class="compact-stat"><span>Max consecutive wins</span><b>${metrics.maxWins}</b></div></div>
      <div class="dashboard-panel loser-panel"><h3>Losers</h3><div class="compact-stat"><span>Total losers</span><b>${losingTrades.length}</b></div><div class="compact-stat"><span>Worst loss</span><b class="loss">-${money(metrics.largestLoss)}</b></div><div class="compact-stat"><span>Average loss</span><b class="loss">-${money(metrics.avgLoss)}</b></div><div class="compact-stat"><span>Average duration</span><b>${durationText(avgDuration(losingTrades))}</b></div><div class="compact-stat"><span>Max consecutive losses</span><b>${metrics.maxLosses}</b></div></div>
    </div></section>
    <section class="section"><h2>Performance by side</h2><div class="two-panels">
      <div class="dashboard-panel"><h3>Total trades</h3><div class="donut-row">${donut(buyStats.total,sellStats.total,'#20bd89','#2c67c5')}<div class="legend-stats"><span><i class="dot buy-dot"></i>Buy <b>${buyStats.total}</b></span><span><i class="dot sell-dot"></i>Sell <b>${sellStats.total}</b></span></div></div></div>
      <div class="dashboard-panel"><h3>Win rate</h3><div class="donut-row">${donut(buyStats.wins,sellStats.wins,'#20bd89','#2c67c5')}<div class="legend-stats"><span><i class="dot buy-dot"></i>Buy <b>${buyStats.total ? Math.round(buyStats.wins/buyStats.total*100) : 0}%</b></span><span><i class="dot sell-dot"></i>Sell <b>${sellStats.total ? Math.round(sellStats.wins/sellStats.total*100) : 0}%</b></span></div></div></div>
    </div></section>
    <section class="section"><h2>Performance by day</h2><div class="dashboard-panel day-bars">${dayBars}</div></section>
    <section class="section"><h2>Performance by month</h2><div class="dashboard-panel month-grid">${monthCells}<div class="month-cell ytd"><span>YTD ${reportYear}</span><b class="${yearPnl >= 0 ? 'gain' : 'loss'}">${money(yearPnl)}</b><small>${yearTrades} trades</small></div></div></section>
  `;
  const grouped = new Map();
  trades.forEach(trade => {
    const key = dateKey(trade.closeTime || trade.openTime);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(trade);
  });
  const tradePages = [...grouped.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([date, dayTrades]) => `
    <section class="day-section">
      <div class="section-title"><div><h2 class="journal-date">${escapeHtml(dateLabel(date))}</h2><p>${dayTrades.length} closed trades</p></div><strong class="${dayTrades.reduce((sum,t)=>sum+(Number(t.pnl)||0),0)>=0?'gain':'loss'}">${money(dayTrades.reduce((sum,t)=>sum+(Number(t.pnl)||0),0))}</strong></div>
      ${dayTrades.map((trade,index)=>{
        const pnl=Number(trade.pnl)||0, image=screenshots[String(trade.id)];
        return `<article class="trade-card">
          <div class="trade-head"><h3><span class="journal-value blue">Trade #${index+1}</span> · ${escapeHtml(trade.symbol||symbol||'Market')} · <span class="trade-side ${String(trade.type||'').toLowerCase()==='buy'?'buy':'sell'}">${escapeHtml(String(trade.type||'').toUpperCase())}</span></h3><b class="${pnl>=0?'gain':'loss'}">${money(pnl)}</b></div>
          <div class="trade-grid">
            <div><small>Result</small><b class="journal-value ${pnl>0?'gain':pnl<0?'loss':'warn'}">${pnl>0?'WIN':pnl<0?'LOSS':'BREAKEVEN'}</b></div><div><small>Entry time</small><b class="journal-value blue">${escapeHtml(timeLabel(trade.openTime))}</b></div>
            <div><small>Close time</small><b class="journal-value blue">${escapeHtml(timeLabel(trade.closeTime))}</b></div><div><small>Duration</small><b class="journal-value blue">${escapeHtml(duration(trade))}</b></div>
            <div><small>Entry</small><b class="journal-value blue">${escapeHtml(trade.entryPrice)}</b></div><div><small>Exit</small><b class="journal-value blue">${escapeHtml(trade.exitPrice)}</b></div>
            <div><small>Stop loss</small><b class="journal-value loss">${escapeHtml(trade.sl)}</b></div><div><small>Take profit</small><b class="journal-value gain">${escapeHtml(trade.tp ?? '—')}</b></div>
            <div><small>Size</small><b class="journal-value blue">${escapeHtml(trade.size)}</b></div><div><small>Risk amount</small><b class="journal-value warn">${money(trade.riskAmount)}</b></div>
            <div><small>Close reason</small><b class="journal-value warn">${escapeHtml(trade.reason||'—')}</b></div><div><small>Trade ID</small><b class="journal-value">${escapeHtml(trade.id)}</b></div>
          </div>
          ${image ? `<img class="trade-image" src="${image}" alt="Trade ${escapeHtml(trade.id)} chart screenshot"/>` : '<div class="no-image">Screenshot unavailable on this device for this trade.</div>'}
        </article>`;
      }).join('')}
    </section>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>OmaxFX Analytics - ${escapeHtml(sessionName)}</title><style>
    @page{size:A4 portrait;margin:9mm 9mm 10mm;background:#0b0e11}
    *{box-sizing:border-box}
    html{background:#0b0e11}
    body{font:9px/1.4 Arial,sans-serif;color:#d5d9e2;margin:0;background:#0b0e11;color-scheme:dark;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    h1{font-size:22px;margin:0 0 4px;color:#f3f4f6}h2{font-size:15px;margin:0;color:#e5e7eb}h3{font-size:11px;margin:0;color:#e5e7eb}
    .muted,small{color:#8993a5}
    .report-title{font-size:14px;font-weight:700;color:#dce4f2;padding:4px 0 8px;margin:0 0 9px;border-bottom:1px solid #293142}
    .cover{border-bottom:2px solid #2c67c5;padding:0 0 9px;margin-bottom:10px}
    .range-line{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px;padding:6px 8px;background:#171c27;border:1px solid #293142;border-radius:5px;color:#aeb8ca;font-size:9px}
    .range-line b{color:#e5eaf3}.range-duration{margin-left:auto;font-weight:bold;color:#72a7ff}
    .meta{display:flex;gap:14px;flex-wrap:wrap;color:#8993a5;margin-top:6px}
    .section{margin:10px 0}.section h2{margin-bottom:6px;color:#e5e7eb}
    .top-metrics{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;margin:8px 0 10px}
    .summary-card{min-width:0;background:#131923;border:1px solid #293142;border-radius:5px;padding:7px}
    .summary-card small{display:block;font-size:7px;color:#8993a5;margin-bottom:3px}
    .summary-card b{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#e5eaf3}
    .dashboard-grid{display:grid;grid-template-columns:minmax(220px,34%) minmax(0,1fr);gap:8px;align-items:stretch;margin:8px 0 12px}
    .dashboard-panel{min-width:0;border:1px solid #293142;border-radius:6px;background:#111722;padding:8px;break-inside:avoid}
    .dashboard-panel h2{margin-bottom:7px}
    .metrics{display:grid;grid-template-columns:1fr;gap:0;border-top:1px solid #293142}
    .metric{display:flex;justify-content:space-between;gap:8px;padding:3px 1px;border-bottom:1px solid #293142;font-size:8px}
    .metric b{text-align:right}.metric-label{color:#929db0;font-weight:600}
    .metric-value{font-weight:700}.metric-value.blue{color:#72a7ff}.metric-value.gain,.gain{color:#27c99a}
    .metric-value.loss,.loss{color:#ff6969}.metric-value.warn{color:#f5b84b}.metric-value.neutral{color:#c2cad7}
    .calendar-wrap{display:grid;grid-template-columns:minmax(0,1fr);gap:6px}
    .calendar-wrap.single-month{grid-template-columns:minmax(0,1fr)}
    .month-card{border:1px solid #293142;border-radius:5px;padding:6px;background:#111722;break-inside:avoid}
    .month-heading{display:flex;align-items:center;gap:8px;margin-bottom:5px}.month-heading h3{flex:1}
    .month-heading span{color:#8993a5;font-size:8px}
    .month-content{display:grid;grid-template-columns:minmax(0,1fr) 74px;gap:5px;align-items:stretch}
    .week-summary{display:flex;flex-direction:column;gap:2px;padding-top:15px}
    .week-item{flex:1;min-height:26px;border-radius:4px;background:#1a2130;border:1px solid #2b3548;padding:3px;display:flex;flex-direction:column;justify-content:center;overflow:hidden}
    .week-item small{font-size:6px}.week-item b{font-size:8px;line-height:1.2}.week-item span{font-size:6px;color:#8993a5;white-space:nowrap}
    .calendar{width:100%;border-collapse:separate;border-spacing:2px;table-layout:fixed}
    .calendar th{font-size:7px;color:#8993a5;padding:3px 0}
    .calendar td{height:37px;vertical-align:top;padding:3px;border-radius:3px;background:#1a2130;border:1px solid #252f40;color:#d5d9e2;font-size:8px}
    .calendar td b{display:block;color:#e5eaf3}.calendar td span,.calendar td small{display:block;font-size:6px;margin-top:2px}
    .calendar td.positive{background:#10372f;border-color:#176b56;color:#55d6ad}.calendar td.negative{background:#401f29;border-color:#793344;color:#ff8585}
    .calendar td.flat{background:#192e4d;border-color:#2c67c5;color:#9bc2ff}.calendar td.blank{background:transparent;border-color:transparent}
    .curve{border:1px solid #293142;border-radius:7px;padding:8px;background:#111722}
    .curve svg{display:block;width:100%;height:auto}.empty{padding:18px;text-align:center;color:#8993a5;background:#171e2b;border:1px solid #293142;border-radius:6px}
    .journal-date{color:#e5eaf3}.journal-value{color:#c2cad7}.journal-value.blue{color:#72a7ff}
    .journal-value.gain{color:#27c99a}.journal-value.loss{color:#ff6969}.journal-value.warn{color:#f5b84b}
    .trade-side.buy{color:#27c99a}.trade-side.sell{color:#ff6969}
    .day-section{margin-top:10px}.section-title{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #293142;padding-bottom:6px;margin-bottom:8px}
    .section-title p{margin:2px 0 0;color:#8993a5}
    .trade-card{border:1px solid #293142;background:#111722;border-radius:6px;padding:8px;margin:0 0 9px;break-inside:avoid}
    .trade-head{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #293142;padding-bottom:6px;margin-bottom:7px}
    .trade-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:7px}
    .trade-grid>div{background:#1a2130;border:1px solid #252f40;border-radius:4px;padding:4px}
    .trade-grid small{display:block;font-size:7px;color:#8993a5;font-weight:600}
    .trade-grid b{display:block;font-size:8px;overflow-wrap:anywhere;color:#d5d9e2}
    .trade-grid b.gain{color:#27c99a}.trade-grid b.loss{color:#ff6969}.trade-grid b.warn{color:#f5b84b}
    .trade-image{display:block;width:100%;max-height:290px;object-fit:contain;background:#111722;border:1px solid #293142;border-radius:4px}
    .no-image{padding:14px;text-align:center;color:#f5b84b;background:#292116;border:1px dashed #8a5b20;border-radius:4px}
    .two-panels{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.dashboard-panel>small{display:block;margin-bottom:5px}.dashboard-panel>h2{font-size:20px;margin:3px 0}.expectancy-track{height:7px;border-radius:9px;background:#293142;overflow:hidden;margin:9px 0}.expectancy-track i{display:block;height:100%;background:#20bd89}
    .winner-panel{border-color:#176b56}.loser-panel{border-color:#793344}.compact-stat{display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px solid #293142}.compact-stat span{color:#929db0}.compact-stat b{color:#d5d9e2}
    .donut-row{display:flex;align-items:center;justify-content:center;gap:22px;padding:10px}.donut{width:92px;height:92px;border-radius:50%;display:grid;place-items:center;position:relative}.donut:after{content:"";position:absolute;inset:13px;background:#111722;border-radius:50%}.donut span{position:relative;z-index:1;color:#d5d9e2;font-weight:bold}.legend-stats{display:grid;gap:8px}.legend-stats span{display:flex;align-items:center;gap:6px;color:#aeb8ca}.legend-stats b{margin-left:auto;color:#e5eaf3}.dot{width:7px;height:7px;border-radius:50%;display:inline-block}.buy-dot{background:#20bd89}.sell-dot{background:#2c67c5}
    .day-bars{display:grid;gap:5px}.day-row{display:grid;grid-template-columns:28px minmax(0,1fr) 76px 28px;align-items:center;gap:8px;font-size:8px}.day-row>span,.day-row small{color:#929db0}.day-row>b{text-align:right;color:#d5d9e2}.day-track{height:12px;background:#171e2b;border-radius:3px;position:relative;overflow:hidden}.day-zero{position:absolute;left:50%;top:0;bottom:0;width:1px;background:#788397}.day-bar{position:absolute;top:2px;bottom:2px;border-radius:2px}.gain-bar{background:#20bd89}.loss-bar{background:#ef6262}
    .month-grid{display:grid;grid-template-columns:repeat(13,minmax(0,1fr));gap:5px}.month-cell{min-width:0;border:1px solid #293142;background:#171e2b;border-radius:5px;padding:6px 3px;text-align:center;display:grid;gap:4px}.month-cell span{color:#aeb8ca;font-size:8px}.month-cell b{font-size:8px;overflow-wrap:anywhere}.month-cell small{font-size:6px;color:#8993a5}.month-cell.ytd{border-color:#2c67c5}
    .page-break{break-before:page}.footer{margin-top:12px;border-top:1px solid #293142;padding-top:6px;color:#8993a5;font-size:7px}
    @media print{html,body{background:#0b0e11!important;color:#d5d9e2!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}.dashboard-grid{grid-template-columns:34% 1fr}.trade-card,.month-card{break-inside:avoid}}
    @media screen{body{max-width:1400px;margin:20px auto;padding:0 20px}}</style></head><body>
    <div class="report-title">OmaxFX Simulator · Performance report</div>
    <header class="cover"><h1>${escapeHtml(sessionName||'Trading session')}</h1><div class="range-line"><b>Backtest range</b><span>${escapeHtml(backtestRange?.from || "—")}</span><span>TO</span><span>${escapeHtml(backtestRange?.to || "—")}</span><span class="range-duration">${escapeHtml(backtestRange?.elapsed || "")}</span></div><div class="meta"><span>Symbol: <b>${escapeHtml(symbol||'—')}</b></span><span>Session ID: ${escapeHtml(sessionId||'—')}</span><span>Timezone: ${escapeHtml(timezone||'UTC+3')}</span><span>Generated: ${escapeHtml(generated)}</span></div></header>
    <div class="top-metrics">${summaryCards.map(([label,value,tone])=>`<div class="summary-card"><small>${escapeHtml(label)}</small><b class="${tone}">${escapeHtml(value)}</b></div>`).join('')}</div>
    <section class="section"><h2>Profit and loss · Over time</h2><div class="curve">${buildCurveSvg(curve, 'Buy & Hold · '+(symbol||'Market'))}</div></section>
    <div class="dashboard-grid">
      <section class="dashboard-panel"><h2>Trading statistics</h2><div class="metrics">${metricRows.map(([label,value])=>`<div class="metric"><span class="metric-label">${escapeHtml(label)}</span><b class="metric-value ${metricTone(label)}">${escapeHtml(value)}</b></div>`).join('')}</div></section>
      <section class="dashboard-panel"><h2>Trading calendar · All active months</h2><p class="muted">Daily realized net P&amp;L and closed trade count · UTC+3</p><div class="calendar-wrap ${new Set(dailyEntries.map(([key])=>key.slice(0,7))).size===1?'single-month':''}">${buildCalendar(dailyEntries)}</div></section>
    </div>
    ${performanceSections}
    <section class="section"><h2>Full performance metrics</h2><div class="dashboard-panel"><div class="metrics">${metricRows.map(([label,value])=>`<div class="metric"><span class="metric-label">${escapeHtml(label)}</span><b class="metric-value ${metricTone(label)}">${escapeHtml(value)}</b></div>`).join('')}</div></div></section>
    <section class="page-break"><h2>Daily trade journal · All trades and chart screenshots</h2><p class="muted">${trades.length} closed trades across ${dailyEntries.length} active trading days.</p>${tradePages||'<div class="empty">No closed trades in this session.</div>'}</section>
    <div class="footer">OmaxFX · Report generated ${escapeHtml(generated)} · Values are based on the saved session trade history.</div>
    <script>window.addEventListener('load',()=>{const imgs=[...document.images];Promise.all(imgs.map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.onload=resolve;img.onerror=resolve}))).then(()=>setTimeout(()=>{document.querySelector('.print-hint')?.classList.add('ready')},150));});</script>
    </body></html>`;
}

export function openAnalyticsPrintWindow(html) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return false;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  return true;
}

export function writeAnalyticsPrintWindow(printWindow, html) {
  if (!printWindow || printWindow.closed) return false;
  printWindow.onload = async () => {
    const images = Array.from(printWindow.document.images);
    await Promise.all(images.map(image => image.complete ? Promise.resolve() : new Promise(resolve => {
      image.onload = resolve;
      image.onerror = resolve;
    })));
    setTimeout(() => {
      if (!printWindow.closed) {
        printWindow.focus();
        printWindow.print();
      }
    }, 300);
  };
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  return true;
}
