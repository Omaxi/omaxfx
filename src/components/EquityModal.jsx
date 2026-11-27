import { useState, useRef, useEffect } from 'react';
import { useStore, INITIAL_BALANCE } from '../store';
import { fmtMoney } from '../utils/format';
import { X, Share2, Download, MessageCircle, Send, Mail, Smartphone } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import html2canvas from 'html2canvas-pro';

const sanitizeName = (name) => {
  if (!name) return 'trader';
  return name.trim().replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase() || 'trader';
};

const fmtDate = (unix) => {
  if (!unix) return '—';
  const d = new Date(unix * 1000);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
};

export default function EquityModal() {
  const { isEquityOpen, closeEquity, tradeHistory, balance, rules, playerName, gamePeriod, uiMode } = useStore();
  const isDark = uiMode === 'dark';
  const reportTheme = isDark ? {
    surface: '#131722', panel: '#1e222d', text: '#e5e7eb', secondary: '#cbd5e1', muted: '#9ca3af',
    border: '#2a2e39', grid: '#374151', axis: '#64748b', pill: '#1e3a8a', pillBorder: '#1d4ed8', pillText: '#dbeafe',
  } : {
    surface: '#ffffff', panel: '#f8fafc', text: '#172033', secondary: '#334155', muted: '#64748b',
    border: '#e2e8f0', grid: '#cbd5e1', axis: '#94a3b8', pill: '#eff6ff', pillBorder: '#dbeafe', pillText: '#1e40af',
  };
  const captureRef = useRef(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!isEquityOpen) { setMenuOpen(false); setToast(''); }
  }, [isEquityOpen]);

  if (!isEquityOpen) return null;

  const startBalance = rules?.startingBalance ?? INITIAL_BALANCE;
  const presetName = rules?.presetName || 'Custom';
  const safeName = sanitizeName(playerName);
  const equityData = [{ trade: 0, balance: startBalance, pnl: 0 }];
  let running = startBalance;
  tradeHistory.forEach((trade, i) => {
    running += trade.pnl;
    equityData.push({ trade: i + 1, balance: Number(running.toFixed(2)), pnl: Number(trade.pnl.toFixed(2)) });
  });

  const maxEquity = Math.max(...equityData.map(d => d.balance), startBalance);
  const minEquity = Math.min(...equityData.map(d => d.balance), startBalance);
  const currentPnl = running - startBalance;
  const pnlPercent = startBalance ? (currentPnl / startBalance) * 100 : 0;
  const totalTrades = tradeHistory.length;
  const wins = tradeHistory.filter(t => t.pnl > 0).length;
  const losses = tradeHistory.filter(t => t.pnl < 0).length;
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const captureImage = async () => {
    if (!captureRef.current) return null;
    try {
      await new Promise(r => setTimeout(r, 100));
      const canvas = await html2canvas(captureRef.current, {
        backgroundColor: reportTheme.surface, scale: 2, logging: false, useCORS: true, allowTaint: true,
      });
      return new Promise(resolve => canvas.toBlob(blob => resolve(blob), 'image/png', 0.95));
    } catch (err) {
      console.error('html2canvas error:', err);
      showToast('Error generating image. Try again.');
      return null;
    }
  };

  const downloadImage = (blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}-tradepast-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const shareText = `Check out my TradePast performance report! Return: ${pnlPercent.toFixed(2)}%, Total P&L: $${fmtMoney(currentPnl)}`;

  const shareImage = async (platform) => {
    setIsCapturing(true);
    setMenuOpen(false);
    try {
      const blob = await captureImage();
      if (!blob) { showToast('Could not generate image.'); return; }
      const file = new File([blob], `${safeName}-tradepast.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'TradePast Performance Report', text: shareText });
          return;
        } catch (err) { if (err.name === 'AbortError') return; }
      }
      downloadImage(blob);
      if (platform === 'email') {
        showToast('Image saved. Opening email...');
        setTimeout(() => {
          window.location.href = `mailto:?subject=${encodeURIComponent('My TradePast Performance Report')}&body=${encodeURIComponent(shareText)}`;
        }, 800);
      } else {
        showToast('Image saved! Open your app and attach it.');
      }
    } finally { setIsCapturing(false); }
  };

  const handleDownload = async () => {
    setIsCapturing(true);
    setMenuOpen(false);
    try {
      const blob = await captureImage();
      if (blob) { downloadImage(blob); showToast('Image downloaded!'); }
    } finally { setIsCapturing(false); }
  };

  const PNG_WIDTH = 900;
  const pnlColor = currentPnl >= 0 ? '#059669' : '#dc2626';

  return (
    <div className={`fixed inset-0 ${isDark ? 'bg-slate-950/80' : 'bg-slate-950/55'} backdrop-blur-[2px] flex items-center justify-center z-[60] p-3 sm:p-5`} onClick={() => setMenuOpen(false)}>
      <div
        className={`rounded-2xl w-full max-w-5xl border shadow-2xl overflow-hidden flex flex-col max-h-[94dvh] relative ${isDark ? 'bg-[#131722] text-slate-100 border-[#2a2e39]' : 'bg-white text-slate-800 border-slate-200'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex justify-between items-center px-5 py-3 border-b flex-shrink-0 ${isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-slate-200 bg-white'}`}>
          <div className="flex items-center gap-2.5">
            <div className="grid place-items-center size-8 rounded-lg bg-blue-600 text-white"><Share2 size={16}/></div>
            <div>
              <h2 className={`text-base font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Performance Report</h2>
              <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>A shareable summary of this backtest</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                disabled={isCapturing}
                className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 rounded-lg text-xs font-semibold transition-colors shadow-sm"
              >
                <Share2 size={14}/>
                {isCapturing ? 'Generating…' : 'Share'}
              </button>
              {menuOpen && (
                <div className={`absolute right-0 top-full mt-2 border rounded-xl shadow-xl overflow-hidden z-[100] min-w-[190px] py-1 ${isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-white border-slate-200'}`}>
                  <button onClick={() => shareImage('native')} className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-left ${isDark ? 'hover:bg-[#2a2e39] text-slate-200' : 'hover:bg-slate-50 text-slate-700'}`}>
                    <Smartphone size={14} className="text-violet-600"/> Share via...
                  </button>
                  <button onClick={() => shareImage('whatsapp')} className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 ${isDark ? 'hover:bg-[#2a2e39] text-slate-200' : 'hover:bg-slate-50 text-slate-700'}`}>
                    <MessageCircle size={14} className="text-green-600"/> WhatsApp
                  </button>
                  <button onClick={() => shareImage('telegram')} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-slate-50 text-xs text-left text-slate-700">
                    <Send size={14} className="text-blue-600"/> Telegram
                  </button>
                  <button onClick={() => shareImage('email')} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-slate-50 text-xs text-left text-slate-700">
                    <Mail size={14} className="text-amber-600"/> Email
                  </button>
                  <div className={`my-1 border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`}/>
                  <button onClick={handleDownload} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-slate-50 text-xs text-left text-slate-700">
                    <Download size={14} className={isDark ? 'text-slate-400' : 'text-slate-500'}/> Download PNG
                  </button>
                </div>
              )}
            </div>
            <button onClick={closeEquity} className={`p-2 rounded-lg ${isDark ? 'text-slate-400 hover:text-white hover:bg-[#2a2e39]' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`} aria-label="Close report">
              <X size={18}/>
            </button>
          </div>
        </div>

        <div className={`overflow-auto flex-1 min-h-0 p-4 sm:p-6 ${isDark ? 'bg-[#0b0e11]' : 'bg-slate-50'}`}>
          <div
            ref={captureRef}
            className="equity-report-capture"
            style={{
              width: `${PNG_WIDTH}px`,
              maxWidth: '100%',
              backgroundColor: reportTheme.surface,
              color: reportTheme.text,
              colorScheme: isDark ? 'dark' : 'light',
              isolation: 'isolate',
              padding: '30px',
              fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
              boxSizing: 'border-box',
              margin: '0 auto',
              border: `1px solid ${reportTheme.border}`,
              borderTop: '5px solid #2563eb',
              borderRadius: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', paddingBottom: '18px', borderBottom: `1px solid ${reportTheme.border}` }}>
              <div>
                <div style={{ fontSize: '23px', lineHeight: 1.15, fontWeight: 800, letterSpacing: '-0.6px', color: reportTheme.text }}>TradePast</div>
                <div style={{ fontSize: '11px', color: reportTheme.muted, marginTop: '4px', letterSpacing: '0.2px' }}>TRADING PERFORMANCE REPORT</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '10px', color: reportTheme.muted, textTransform: 'uppercase', letterSpacing: '0.7px', fontWeight: 700 }}>Generated</div>
                <div style={{ fontSize: '12px', color: reportTheme.secondary, fontWeight: 600, marginTop: '4px' }}>{new Date().toLocaleDateString()}</div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '18px', flexWrap: 'wrap', padding: '20px 0 18px' }}>
              <div>
                <div style={{ fontSize: '10px', color: reportTheme.muted, textTransform: 'uppercase', letterSpacing: '0.7px', fontWeight: 700, marginBottom: '5px' }}>Prepared for</div>
                <div style={{ fontSize: '20px', lineHeight: 1.2, color: reportTheme.text, fontWeight: 750 }}>{playerName || 'Trader'}</div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <MetaPill label="Challenge" value={presetName} theme={reportTheme}/>
                <MetaPill label="Period" value={`${fmtDate(gamePeriod?.from)} → ${fmtDate(gamePeriod?.to)}`} theme={reportTheme}/>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px', marginBottom: '18px' }}>
              <StatCard label="Starting balance" value={`${fmtMoney(startBalance, 0)}`} theme={reportTheme}/>
              <StatCard label="Final balance" value={`${fmtMoney(balance, 0)}`} theme={reportTheme}/>
              <StatCard label="Net P&L" value={`${currentPnl >= 0 ? '+' : '−'}$${fmtMoney(currentPnl, 0)}`} color={pnlColor} theme={reportTheme}/>
              <StatCard label="Total return" value={`${currentPnl >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%`} color={pnlColor}/>
              <StatCard label="Closed trades" value={totalTrades.toLocaleString()} theme={reportTheme}/>
              <StatCard label="Win rate" value={`${totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : '0.0'}%`} detail={`${wins} wins · ${losses} losses`} theme={reportTheme}/>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '9px' }}>
              <div style={{ fontSize: '14px', fontWeight: 750, color: '#172033' }}>Account equity</div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: pnlColor }}>{currentPnl >= 0 ? '+' : '−'}${fmtMoney(currentPnl, 2)} <span style={{ color: '#64748b', fontWeight: 500 }}>({pnlPercent.toFixed(2)}%)</span></div>
            </div>
            <div className="equity-report-chart" style={{ height: '290px', backgroundColor: reportTheme.panel, color: reportTheme.secondary, colorScheme: isDark ? 'dark' : 'light', border: `1px solid ${reportTheme.border}`, borderRadius: '10px', padding: '14px 12px 8px', minWidth: 0 }}>
              {tradeHistory.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b', fontSize: '13px' }}>
                  No trades yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={equityData} margin={{ top: 10, right: 16, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 4" stroke={reportTheme.grid} vertical={false}/>
                    <XAxis dataKey="trade" stroke={reportTheme.axis} tick={{ fontSize: 10, fill: reportTheme.muted }} tickLine={false} axisLine={{ stroke: reportTheme.grid }}/>
                    <YAxis
                      stroke={reportTheme.axis}
                      domain={[minEquity * 0.98, maxEquity * 1.02]}
                      tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`}
                      tick={{ fontSize: 10, fill: reportTheme.muted }}
                      tickLine={false}
                      axisLine={false}
                      width={54}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: reportTheme.surface, border: `1px solid ${reportTheme.grid}`, borderRadius: '8px', fontSize: '11px', color: reportTheme.text, boxShadow: '0 4px 12px rgba(15,23,42,.08)' }}
                      itemStyle={{ color: '#60a5fa', fontWeight: 700 }}
                      labelStyle={{ color: '#64748b' }}
                      formatter={(value) => [`$${fmtMoney(value)}`, 'Account balance']}
                      labelFormatter={(label) => `Trade #${label}`}
                    />
                    <ReferenceLine y={startBalance} stroke="#94a3b8" strokeDasharray="4 4"/>
                    <Line type="monotone" dataKey="balance" stroke="#2563eb" strokeWidth={3} dot={false} activeDot={{ r: 5, fill: '#2563eb', stroke: reportTheme.surface, strokeWidth: 2 }} isAnimationActive={false}/>
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', borderTop: `1px solid ${reportTheme.border}`, marginTop: '18px', paddingTop: '12px' }}>
              <div style={{ fontSize: '10px', color: '#64748b' }}>TradePast · Trading Performance</div>
              <div style={{ fontSize: '10px', color: reportTheme.axis }}>Generated with TradePast</div>
            </div>
          </div>
        </div>

        {toast && (
          <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 border px-4 py-2 rounded-lg text-xs shadow-xl z-[100] whitespace-nowrap ${isDark ? 'bg-[#1e222d] border-[#2a2e39] text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}>
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

function MetaPill({ label, value, theme }) {
  return (
    <div style={{ backgroundColor: theme.pill, border: `1px solid ${theme.pillBorder}`, borderRadius: '7px', padding: '7px 10px' }}>
      <span style={{ display: 'block', fontSize: '8px', color: theme.muted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>{label}</span>
      <span style={{ display: 'block', fontSize: '10px', color: theme.pillText, fontWeight: 700, marginTop: '2px' }}>{value}</span>
    </div>
  );
}

function StatCard({ label, value, color = '#172033', detail, theme }) {
  return (
    <div style={{ backgroundColor: theme.panel, border: `1px solid ${theme.border}`, padding: '11px 13px', borderRadius: '9px', minWidth: 0 }}>
      <div style={{ fontSize: '9px', color: theme.muted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.55px' }}>{label}</div>
      <div style={{ fontSize: '17px', color, fontWeight: 800, letterSpacing: '-0.3px', marginTop: '5px', overflowWrap: 'anywhere' }}>{value}</div>
      {detail && <div style={{ fontSize: '9px', color: theme.muted, marginTop: '3px' }}>{detail}</div>}
    </div>
  );
}
