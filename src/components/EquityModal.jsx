import { useState, useRef, useEffect } from 'react';
import { useStore, INITIAL_BALANCE } from '../store';
import { fmtMoney } from '../utils/format';
import { X, Share2, Download, MessageCircle, Send, Mail, Smartphone } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import html2canvas from 'html2canvas-pro';

const sanitizeName = (name) => {
  if (!name) return 'player';
  return name.trim().replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase() || 'player';
};

export default function EquityModal() {
  const { isEquityOpen, closeEquity, tradeHistory, balance, rules, playerName } = useStore();
  const captureRef = useRef(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!isEquityOpen) { setMenuOpen(false); setToast(''); }
  }, [isEquityOpen]);

  if (!isEquityOpen) return null;

  const startBalance = rules?.startingBalance ?? INITIAL_BALANCE;
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

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const captureImage = async () => {
    if (!captureRef.current) return null;
    try {
      await new Promise(r => setTimeout(r, 80));
      const canvas = await html2canvas(captureRef.current, {
        backgroundColor: '#131722',
        scale: 2,
        logging: false,
        useCORS: true,
        allowTaint: true,
        foreignObjectRendering: false,
        imageTimeout: 3000,
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
    a.download = `${safeName}-equity-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const shareText = `Check out my OmaxFX Game performance! Return: ${pnlPercent.toFixed(2)}%, Total P&L: $${fmtMoney(currentPnl)}`;

  // Core: try native file share first, fall back to download
  const shareWithImage = async (forceDownloadOnly = false) => {
    setIsCapturing(true);
    setMenuOpen(false);
    try {
      const blob = await captureImage();
      if (!blob) { showToast('Could not generate image.'); return; }
      const file = new File([blob], `${safeName}-equity.png`, { type: 'image/png' });

      if (!forceDownloadOnly && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'OmaxFX Game', text: shareText });
          return;
        } catch (err) {
          if (err.name === 'AbortError') return;
        }
      }
      downloadImage(blob);
      showToast('Image saved! Attach it wherever you want.');
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

  const handleWhatsApp = async () => {
    setIsCapturing(true);
    setMenuOpen(false);
    try {
      const blob = await captureImage();
      if (!blob) return;
      const file = new File([blob], `${safeName}-equity.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'OmaxFX', text: shareText }); return; }
        catch (err) { if (err.name === 'AbortError') return; }
      }
      downloadImage(blob);
      showToast('Saved! Open WhatsApp and attach it.');
    } finally { setIsCapturing(false); }
  };

  const handleTelegram = async () => {
    setIsCapturing(true);
    setMenuOpen(false);
    try {
      const blob = await captureImage();
      if (!blob) return;
      const file = new File([blob], `${safeName}-equity.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'OmaxFX', text: shareText }); return; }
        catch (err) { if (err.name === 'AbortError') return; }
      }
      downloadImage(blob);
      showToast('Saved! Open Telegram and attach it.');
    } finally { setIsCapturing(false); }
  };

  const handleEmail = async () => {
    setIsCapturing(true);
    setMenuOpen(false);
    try {
      const blob = await captureImage();
      if (blob) {
        downloadImage(blob);
        showToast('Image saved! Attach it to your email.');
        setTimeout(() => {
          window.location.href = `mailto:?subject=${encodeURIComponent('My OmaxFX Game Performance')}&body=${encodeURIComponent(shareText)}`;
        }, 800);
      }
    } finally { setIsCapturing(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-1" onClick={() => setMenuOpen(false)}>
      <div 
        className="bg-[#131722] rounded-lg w-full max-w-2xl border border-[#2a2e39] overflow-hidden flex flex-col max-h-[95vh] relative" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-2 py-1 border-b border-[#2a2e39] flex-shrink-0">
          <h2 className="text-sm font-bold">Equity Curve</h2>
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
                  <button onClick={() => shareWithImage(false)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#2a2e39] text-xs text-left text-white">
                    <Smartphone size={12} className="text-purple-400" /> Share via...
                  </button>
                  <button onClick={handleWhatsApp} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#2a2e39] text-xs text-left text-white">
                    <MessageCircle size={12} className="text-green-400" /> WhatsApp
                  </button>
                  <button onClick={handleTelegram} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#2a2e39] text-xs text-left text-white">
                    <Send size={12} className="text-blue-400" /> Telegram
                  </button>
                  <button onClick={handleEmail} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#2a2e39] text-xs text-left text-white">
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

        {/* Capture area */}
        <div ref={captureRef} className="bg-[#131722] overflow-y-auto flex-1 min-h-0 p-2">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-bold">
              <span className="text-blue-500">Omax</span><span className="text-white">FX Game</span>
            </span>
            <span className="text-[9px] text-gray-500 font-mono">{new Date().toLocaleDateString()}</span>
          </div>
          <div className="mb-2">
            <span className="text-[11px] text-gray-300 font-bold">{playerName || 'Player'}</span>
          </div>

          <div className="grid grid-cols-4 gap-1 mb-2">
            <div className="bg-[#1e222d] px-2 py-1.5 rounded">
              <p className="text-[8px] text-gray-400 uppercase font-bold">Starting</p>
              <p className="text-xs font-bold">${fmtMoney(startBalance, 0)}</p>
            </div>
            <div className="bg-[#1e222d] px-2 py-1.5 rounded">
              <p className="text-[8px] text-gray-400 uppercase font-bold">Equity</p>
              <p className="text-xs font-bold">${fmtMoney(balance, 0)}</p>
            </div>
            <div className="bg-[#1e222d] px-2 py-1.5 rounded">
              <p className="text-[8px] text-gray-400 uppercase font-bold">P&L</p>
              <p className={`text-xs font-bold ${currentPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ${fmtMoney(currentPnl, 0)}
              </p>
            </div>
            <div className="bg-[#1e222d] px-2 py-1.5 rounded">
              <p className="text-[8px] text-gray-400 uppercase font-bold">Return</p>
              <p className={`text-xs font-bold ${pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {pnlPercent.toFixed(2)}%
              </p>
            </div>
          </div>

          {/* FIXED HEIGHT for ResponsiveContainer */}
          <div style={{ width: '100%', height: '240px' }}>
            {tradeHistory.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-500 text-xs">
                No trades yet. Close a trade to see your equity curve!
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={equityData} margin={{ top: 10, right: 15, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e222d" />
                  <XAxis dataKey="trade" stroke="#666" tick={{ fontSize: 9 }} />
                  <YAxis 
                    stroke="#666" 
                    domain={[minEquity * 0.98, maxEquity * 1.02]}
                    tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`}
                    tick={{ fontSize: 9 }}
                    width={45}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e222d', border: '1px solid #2a2e39', borderRadius: '6px', fontSize: '11px' }}
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
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="text-center mt-2">
            <span className="text-[8px] text-gray-500">Trading Performance Report • OmaxFX Game</span>
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