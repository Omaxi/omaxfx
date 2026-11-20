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

function buildCurveSvg(curve) {
  const width = 1100, height = 330, left = 76, right = 24, top = 24, bottom = 52;
  const values = curve.map(point => Number(point.pnl) || 0);
  if (!values.length) return '<div class="empty">No closed trades yet — the equity curve will appear after trades are closed.</div>';
  const min = Math.min(0, ...values), max = Math.max(0, ...values);
  const span = Math.max(max - min, 1);
  const x = index => left + (curve.length === 1 ? (width - left - right) / 2 : index / (curve.length - 1) * (width - left - right));
  const y = value => top + (max - value) / span * (height - top - bottom);
  const points = curve.map((point, index) => `${x(index).toFixed(1)},${y(Number(point.pnl) || 0).toFixed(1)}`).join(' ');
  const area = `${left},${y(0).toFixed(1)} ${points} ${x(curve.length - 1).toFixed(1)},${y(0).toFixed(1)}`;
  const ticks = Array.from({ length: 5 }, (_, i) => min + (max - min) * i / 4);
  const grid = ticks.map(value => {
    const yy = y(value);
    return `<line x1="${left}" y1="${yy}" x2="${width - right}" y2="${yy}" stroke="#d8dee8" stroke-dasharray="4 5"/><text x="${left - 10}" y="${yy + 4}" text-anchor="end" fill="#536174" font-size="12">${money(value)}</text>`;
  }).join('');
  const labels = curve.length <= 12 ? curve : curve.filter((_, index) => index % Math.ceil(curve.length / 10) === 0 || index === curve.length - 1);
  const xLabels = labels.map(point => {
    const index = curve.indexOf(point);
    return `<text x="${x(index)}" y="${height - 18}" text-anchor="middle" fill="#536174" font-size="11">${escapeHtml(point.date.slice(5))}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Cumulative realized P and L curve"><defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#16a879" stop-opacity=".28"/><stop offset="100%" stop-color="#16a879" stop-opacity=".02"/></linearGradient></defs>${grid}<polygon points="${area}" fill="url(#fill)"/><polyline points="${points}" fill="none" stroke="#079669" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>${curve.map((point,index)=>`<circle cx="${x(index)}" cy="${y(Number(point.pnl)||0)}" r="3" fill="#079669"/>`).join('')}${xLabels}</svg>`;
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
    for (let i = 0; i < cells.length; i += 7) rows.push('<tr>' + cells.slice(i, i + 7).join('') + '</tr>');
    const monthEntries = dailyEntries.filter(([key]) => key.startsWith(`${year}-${String(month + 1).padStart(2, '0')}-`));
    const monthPnl = monthEntries.reduce((sum, [, value]) => sum + value.pnl, 0);
    const monthTrades = monthEntries.reduce((sum, [, value]) => sum + value.trades, 0);
    months.push(`<section class="month-card"><div class="month-heading"><h3>${cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h3><b class="${monthPnl >= 0 ? 'gain' : 'loss'}">${money(monthPnl)}</b><span>${monthTrades} trades</span></div><table class="calendar"><thead><tr>${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day=>`<th>${day}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></section>`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months.join('');
}

export function buildAnalyticsPrintHtml({ sessionName, symbol, sessionId, startBalance, balance, timezone, trades, metrics, dailyEntries, curve, screenshots }) {
  const generated = new Date().toLocaleString();
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
  const grouped = new Map();
  trades.forEach(trade => {
    const key = dateKey(trade.closeTime || trade.openTime);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(trade);
  });
  const tradePages = [...grouped.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([date, dayTrades]) => `
    <section class="day-section">
      <div class="section-title"><div><h2>${escapeHtml(dateLabel(date))}</h2><p>${dayTrades.length} closed trades</p></div><strong class="${dayTrades.reduce((sum,t)=>sum+(Number(t.pnl)||0),0)>=0?'gain':'loss'}">${money(dayTrades.reduce((sum,t)=>sum+(Number(t.pnl)||0),0))}</strong></div>
      ${dayTrades.map((trade,index)=>{
        const pnl=Number(trade.pnl)||0, image=screenshots[String(trade.id)];
        return `<article class="trade-card">
          <div class="trade-head"><h3>Trade #${index+1} · ${escapeHtml(trade.symbol||symbol||'Market')} · ${escapeHtml(String(trade.type||'').toUpperCase())}</h3><b class="${pnl>=0?'gain':'loss'}">${money(pnl)}</b></div>
          <div class="trade-grid">
            <div><small>Result</small><b>${pnl>0?'WIN':pnl<0?'LOSS':'BREAKEVEN'}</b></div><div><small>Entry time</small><b>${escapeHtml(timeLabel(trade.openTime))}</b></div>
            <div><small>Close time</small><b>${escapeHtml(timeLabel(trade.closeTime))}</b></div><div><small>Duration</small><b>${escapeHtml(duration(trade))}</b></div>
            <div><small>Entry</small><b>${escapeHtml(trade.entryPrice)}</b></div><div><small>Exit</small><b>${escapeHtml(trade.exitPrice)}</b></div>
            <div><small>Stop loss</small><b>${escapeHtml(trade.sl)}</b></div><div><small>Take profit</small><b>${escapeHtml(trade.tp ?? '—')}</b></div>
            <div><small>Size</small><b>${escapeHtml(trade.size)}</b></div><div><small>Risk amount</small><b>${money(trade.riskAmount)}</b></div>
            <div><small>Close reason</small><b>${escapeHtml(trade.reason||'—')}</b></div><div><small>Trade ID</small><b>${escapeHtml(trade.id)}</b></div>
          </div>
          ${image ? `<img class="trade-image" src="${image}" alt="Trade ${escapeHtml(trade.id)} chart screenshot"/>` : '<div class="no-image">Screenshot unavailable on this device for this trade.</div>'}
        </article>`;
      }).join('')}
    </section>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>OmaxFX Analytics - ${escapeHtml(sessionName)}</title><style>
    @page{size:A4;margin:14mm 13mm 16mm}*{box-sizing:border-box}body{font:10px/1.45 Arial,sans-serif;color:#172033;margin:0;background:#fff}h1{font-size:25px;margin:0 0 4px}h2{font-size:17px;margin:0}h3{font-size:12px;margin:0}.muted,small{color:#64748b}.cover{border-bottom:3px solid #1767e8;padding:0 0 13px;margin-bottom:16px}.eyebrow{font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:#1767e8;font-weight:bold}.meta{display:flex;gap:18px;flex-wrap:wrap;color:#64748b;margin-top:7px}.section{margin:16px 0}.section h2{margin-bottom:9px}.curve{border:1px solid #dbe2ec;border-radius:8px;padding:10px}.curve svg{display:block;width:100%;height:auto}.empty{padding:22px;text-align:center;color:#64748b;background:#f3f6fa;border-radius:6px}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:0 20px;border-top:1px solid #dbe2ec}.metric{display:flex;justify-content:space-between;gap:12px;padding:6px 2px;border-bottom:1px solid #e7ecf2}.metric b{text-align:right}.gain{color:#07865d}.loss{color:#d14343}.calendar-wrap{display:grid;grid-template-columns:1fr 1fr;gap:12px}.month-card{border:1px solid #dbe2ec;border-radius:7px;padding:8px;break-inside:avoid}.month-heading{display:flex;align-items:center;gap:8px;margin-bottom:7px}.month-heading h3{flex:1}.month-heading span{color:#64748b;font-size:9px}.calendar{width:100%;border-collapse:separate;border-spacing:2px;table-layout:fixed}.calendar th{font-size:8px;color:#64748b;padding:4px 0}.calendar td{height:48px;vertical-align:top;padding:4px;border-radius:3px;background:#f1f4f8;font-size:9px}.calendar td b{display:block}.calendar td span,.calendar td small{display:block;font-size:7px;margin-top:3px}.calendar td.positive{background:#e3f5ed;color:#08734f}.calendar td.negative{background:#fce9e9;color:#a92e2e}.calendar td.flat{background:#e8effc;color:#2857a4}.calendar td.blank{background:transparent}.day-section{margin-top:18px}.section-title{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #dbe2ec;padding-bottom:7px;margin-bottom:10px}.section-title p{margin:2px 0 0;color:#64748b}.trade-card{border:1px solid #dbe2ec;border-radius:7px;padding:10px;margin:0 0 12px;break-inside:avoid}.trade-head{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e7ecf2;padding-bottom:7px;margin-bottom:8px}.trade-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:9px}.trade-grid>div{background:#f3f6fa;border-radius:4px;padding:5px}.trade-grid small{display:block;font-size:8px}.trade-grid b{display:block;font-size:9px;overflow-wrap:anywhere}.trade-image{display:block;width:100%;max-height:350px;object-fit:contain;background:#131722;border-radius:4px}.no-image{padding:18px;text-align:center;color:#9a5b00;background:#fff7e6;border:1px dashed #e4bd73;border-radius:4px}.page-break{break-before:page}.footer{margin-top:15px;border-top:1px solid #e7ecf2;padding-top:6px;color:#94a3b8;font-size:8px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.calendar-wrap{grid-template-columns:1fr 1fr}.trade-card,.month-card{break-inside:avoid}}@media screen{body{max-width:1000px;margin:28px auto;padding:0 24px}.print-hint{padding:10px;background:#eef4ff;border-radius:6px;margin-bottom:18px}}
    </style></head><body>
    <div class="print-hint">Use your browser's Print dialog and choose <b>Save as PDF</b>. Enable background graphics for the full report styling.</div>
    <header class="cover"><div class="eyebrow">OmaxFX · Performance report</div><h1>${escapeHtml(sessionName||'Trading session')}</h1><div class="meta"><span>Symbol: <b>${escapeHtml(symbol||'—')}</b></span><span>Session ID: ${escapeHtml(sessionId||'—')}</span><span>Timezone: ${escapeHtml(timezone||'UTC+3')}</span><span>Generated: ${escapeHtml(generated)}</span></div></header>
    <section class="section"><h2>Equity curve · Cumulative realized P&amp;L</h2><div class="curve">${buildCurveSvg(curve)}</div></section>
    <section class="section"><h2>Full performance metrics</h2><div class="metrics">${metricRows.map(([label,value])=>`<div class="metric"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join('')}</div></section>
    <section class="section page-break"><h2>Trading calendar · All active months</h2><p class="muted">Each day shows realized net P&amp;L and closed trade count. Market date uses UTC+3.</p><div class="calendar-wrap">${buildCalendar(dailyEntries)}</div></section>
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
