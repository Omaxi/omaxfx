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
  return new Date(unix * 1000).toLocaleDateString();
};

export default function EquityModal() {
  const { isEquityOpen, closeEquity, tradeHistory, balance, rules, playerName, gamePeriod } = useStore();
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
  const pnlPercent = (currentPnl / startBalance) * 100;
  const totalTrades = tradeHistory.length;
  const wins = tradeHistory.filter(t => t.pnl > 0).length;
  const losses = tradeHistory.filter(t => t.pnl < 0).length;

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const captureImage = async () => {
    if (!captureRef.current) return null;
    try {
      await new Promise(r => setTimeout(r, 100));
      const canvas = await html2canvas(captureRef.current, {
        backgroundColor: '#131722',
        scale: 2,
        logging: false,
        useCORS: true,
        allowTaint: true,
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
    a.download = `${safeName}-simulator-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const shareText = `Check out my OmaxFX Simulator report! Return: ${pnlPercent.toFixed(2)}%, Total P&L: $${fmtMoney(currentPnl)}`;

  const shareImage = async (platform) => {
    setIsCapturing(true);
    setMenuOpen(false);
    try {
      const blob = await captureImage();
      if (!blob) { showToast('Could not generate image.'); return; }
      const file = new File([blob], `${safeName}-simulator.png`, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'OmaxFX Simulator', text: shareText });
          return;
        } catch (err) {
          if (err.name === 'AbortError') return;
        }
      }

      downloadImage(blob);
      if (platform === 'email') {
        showToast('Image saved. Opening email...');
        setTimeout(() => {
          window.location.href = `mailto:?subject=${encodeURIComponent('My OmaxFX Simulator Report')}&body=${encodeURIComponent(shareText)}`;
        }, 800);
      } else {
        showToast('Image saved! Open your app and attach it.');
      }
    } finally {
      setIsCapturing(false);
    }
  };

  const handleDownload = async () => {
    setIsCapturing(true);
    setMenuOpen(false);
    try {
      const blob = await captureImage();
      if (blob) { downloadImage(blob); showToast('Image downloaded!'); }
    } finally { setIsCapturing(false); }
  };

  const PNG_WIDTH = 720;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-1" onClick={() => setMenuOpen(false)}>
      <div 
        className="bg-[#131722] rounded-lg w-full max-w-3xl border border-[#2a2e39] overflow-hidden flex flex-col max-h-[95vh] relative" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-2 py-1 border-b border-[#2a2e39] flex-shrink-0">
          <h2 className="text-sm font-bold">Performance Report</h2>
          <div className="flex items-center gap-1">
            <div className="relative">
              <button 
                onClick={() => setMenuOpen(!menuOpen)}
                disabled={isCapturing}
                className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-xs font-bold transition-colors"
              >
                <Share2 size={12} />
                {isCapturing ? 'Generating…' : 'Share'}
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl overflow-hidden z-10 min-w-[170px]">
                  <button onClick={() => shareImage('native')} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#2a2e39] text-xs text-left text-white">
                    <Smartphone size={12} className="text-purple-400" /> Share via...
                  </button>
                  <button onClick={() => shareImage('whatsapp')} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#2a2e39] text-xs text-left text-white">
                    <MessageCircle size={12} className="text-green-400" /> WhatsApp
                  </button>
                  <button onClick={() => shareImage('telegram')} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#2a2e39] text-xs text-left text-white">
                    <Send size={12} className="text-blue-400" /> Telegram
                  </button>
                  <button onClick={() => shareImage('email')} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#2a2e39] text-xs text-left text-white">
                    <Mail size={12} className="text-yellow-400" /> Email
                  </button>
                  <button onClick={handleDownload} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#2a2e39] text-xs text-left text-white border-t border-[#2a2e39]">
                    <Download size={12} className="text-gray-400" /> Download PNG
                  </button>
                </div>
              )}
            </div>
            <button onClick={closeEquity} className="p-1 hover:bg-[#2a2e39] rounded">
              <X size={16}/>
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0 p-2">
          <div 
            ref={captureRef}
            style={{
              width: `${PNG_WIDTH}px`,
              maxWidth: '100%',
              backgroundColor: '#131722',
              color: '#ffffff',
              padding: '16px',
              fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
              boxSizing: 'border-box',
              margin: '0 auto',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <div style={{ fontSize: '15px', fontWeight: 'bold' }}>
                <span style={{ color: '#3b82f6' }}>Omax</span>
                <span style={{ color: '#ffffff' }}>FX Simulator</span>
              </div>
              <div style={{ fontSize: '10px', color: '#6b7280', fontFamily: 'monospace' }}>
                {new Date().toLocaleDateString()}
              </div>
            </div>

            {/* Trader + Preset + Period */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', color: '#ffffff', fontWeight: 'bold', marginBottom: '3px' }}>
                {playerName || 'Trader'}
              </div>
              <div style={{ fontSize: '10px', color: '#9ca3af' }}>
                <span style={{ color: '#60a5fa', fontWeight: 'bold' }}>PRESET:</span> {presetName}
                <span style={{ color: '#6b7280' }}> • </span>
                <span style={{ color: '#60a5fa', fontWeight: 'bold' }}>PERIOD:</span> {fmtDate(gamePeriod?.from)} → {fmtDate(gamePeriod?.to)}
              </div>
            </div>

            {/* Stats — 5 columns */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', marginBottom: '14px' }}>
              <div style={{ backgroundColor: '#1e222d', padding: '8px 8px', borderRadius: '6px' }}>
                <div style={{ fontSize: '8px', color: '#9ca3af', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.5px' }}>Starting</div>
                <div style={{ fontSize: '12px', color: '#ffffff', fontWeight: 'bold', marginTop: '3px' }}>${fmtMoney(startBalance, 0)}</div>
              </div>
              <div style={{ backgroundColor: '#1e222d', padding: '8px 8px', borderRadius: '6px' }}>
                <div style={{ fontSize: '8px', color: '#9ca3af', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.5px' }}>Final</div>
                <div style={{ fontSize: '12px', color: '#ffffff', fontWeight: 'bold', marginTop: '3px' }}>${fmtMoney(balance, 0)}</div>
              </div>
              <div style={{ backgroundColor: '#1e222d', padding: '8px 8px', borderRadius: '6px' }}>
                <div style={{ fontSize: '8px', color: '#9ca3af', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.5px' }}>P&L</div>
                <div style={{ fontSize: '12px', color: currentPnl >= 0 ? '#22c55e' : '#ef4444', fontWeight: 'bold', marginTop: '3px' }}>
                  ${fmtMoney(currentPnl, 0)}
                </div>
              </div>
              <div style={{ backgroundColor: '#1e222d', padding: '8px 8px', borderRadius: '6px' }}>
                <div style={{ fontSize: '8px', color: '#9ca3af', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.5px' }}>Return</div>
                <div style={{ fontSize: '12px', color: pnlPercent >= 0 ? '#22c55e' : '#ef4444', fontWeight: 'bold', marginTop: '3px' }}>
                  {pnlPercent.toFixed(2)}%
                </div>
              </div>
              <div style={{ backgroundColor: '#1e222d', padding: '8px 8px', borderRadius: '6px' }}>
                <div style={{ fontSize: '8px', color: '#9ca3af', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.5px' }}>Trades</div>
                <div style={{ fontSize: '12px', color: '#ffffff', fontWeight: 'bold', marginTop: '3px' }}>
                  {totalTrades}
                  <span style={{ fontSize: '10px', fontWeight: 'bold', marginLeft: '5px' }}>
                    <span style={{ color: '#22c55e' }}>{wins}</span>
                    <span style={{ color: '#6b7280' }}>/</span>
                    <span style={{ color: '#ef4444' }}>{losses}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Chart */}
            <div style={{ width: '100%', height: '220px', backgroundColor: '#0b0e11', borderRadius: '6px', padding: '4px' }}>
              {tradeHistory.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6b7280', fontSize: '12px' }}>
                  No trades yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={equityData} margin={{ top: 10, right: 15, left: -5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e222d" />
                    <XAxis dataKey="trade" stroke="#666" tick={{ fontSize: 9, fill: '#9ca3af' }} />
                    <YAxis 
                      stroke="#666" 
                      domain={[minEquity * 0.98, maxEquity * 1.02]}
                      tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`}
                      tick={{ fontSize: 9, fill: '#9ca3af' }}
                      width={48}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1e222d', border: '1px solid #2a2e39', borderRadius: '6px', fontSize: '11px', color: '#ffffff' }}
                      itemStyle={{ color: '#ffffff' }}
                      labelStyle={{ color: '#9ca3af' }}
                      formatter={(value) => [`$${fmtMoney(value)}`, 'Balance']}
                      labelFormatter={(label) => `Trade #${label}`}
                    />
                    <ReferenceLine y={startBalance} stroke="#444" strokeDasharray="3 3" />
                    <Line 
                      type="monotone" 
                      dataKey="balance" 
                      stroke="#26a69a" 
                      strokeWidth={2} 
                      dot={false}
                      activeDot={{ r: 4, fill: '#26a69a' }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div style={{ textAlign: 'center', marginTop: '10px' }}>
              <div style={{ fontSize: '9px', color: '#6b7280' }}>
                Session Report • OmaxFX Simulator • Trading Replay Engine
              </div>
            </div>
          </div>
        </div>

        {toast && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-[#1e222d] border border-blue-500/50 px-3 py-1.5 rounded text-xs text-white shadow-2xl z-20 whitespace-nowrap">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}