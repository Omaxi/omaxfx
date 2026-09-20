import { useState, useRef } from 'react';
import { useStore, INITIAL_BALANCE } from '../store';
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

  if (!isEquityOpen) return null;

  const startBalance = rules?.startingBalance ?? INITIAL_BALANCE;
  const safeName = sanitizeName(playerName);

  const equityData = [{ trade: 0, balance: startBalance, pnl: 0 }];
  let running = startBalance;
  tradeHistory.forEach((trade, i) => {
    running += trade.pnl;
    equityData.push({ 
      trade: i + 1, 
      balance: Number(running.toFixed(2)), 
      pnl: Number(trade.pnl.toFixed(2)) 
    });
  });

  const maxEquity = Math.max(...equityData.map(d => d.balance), startBalance);
  const minEquity = Math.min(...equityData.map(d => d.balance), startBalance);
  const currentPnl = running - startBalance;
  const pnlPercent = (currentPnl / startBalance) * 100;

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  const captureImage = async () => {
    if (!captureRef.current) return null;
    try {
      const canvas = await html2canvas(captureRef.current, {
        backgroundColor: '#131722',
        scale: 2,
        logging: false,
        useCORS: true,
        allowTaint: true,
      });
      return new Promise(resolve => {
        canvas.toBlob(blob => resolve(blob), 'image/png', 0.95);
      });
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

  const shareText = `Check out my OmaxFX Game performance! Return: ${pnlPercent.toFixed(2)}%, Total P&L: $${currentPnl.toFixed(2)}`;

  const handleNativeShare = async () => {
    setIsCapturing(true);
    setMenuOpen(false);
    try {
      const blob = await captureImage();
      if (!blob) return;
      const file = new File([blob], `${safeName}-equity.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'OmaxFX Game - Equity Curve',
          text: shareText,
        });
      } else {
        downloadImage(blob);
        showToast('Image downloaded! Share it with your friends.');
      }
    } catch (e) {
      if (e.name !== 'AbortError') console.error(e);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleDownload = async () => {
    setIsCapturing(true);
    setMenuOpen(false);
    try {
      const blob = await captureImage();
      if (blob) {
        downloadImage(blob);
        showToast('Image downloaded!');
      }
    } finally {
      setIsCapturing(false);
    }
  };

  const handleWhatsApp = async () => {
    setIsCapturing(true);
    setMenuOpen(false);
    try {
      const blob = await captureImage();
      if (blob) {
        downloadImage(blob);
        showToast('Image downloaded! Attach it in WhatsApp.');
        setTimeout(() => {
          window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
        }, 700);
      }
    } finally {
      setIsCapturing(false);
    }
  };

  const handleTelegram = async () => {
    setIsCapturing(true);
    setMenuOpen(false);
    try {
      const blob = await captureImage();
      if (blob) {
        downloadImage(blob);
        showToast('Image downloaded! Attach it in Telegram.');
        setTimeout(() => {
          window.open(`https://t.me/share/url?url=${encodeURIComponent('https://omaxfx.game')}&text=${encodeURIComponent(shareText)}`, '_blank');
        }, 700);
      }
    } finally {
      setIsCapturing(false);
    }
  };

  const handleEmail = async () => {
    setIsCapturing(true);
    setMenuOpen(false);
    try {
      const blob = await captureImage();
      if (blob) {
        downloadImage(blob);
        showToast('Image downloaded! Attach it in your email.');
        setTimeout(() => {
          window.location.href = `mailto:?subject=${encodeURIComponent('My OmaxFX Game Performance')}&body=${encodeURIComponent(shareText)}`;
        }, 700);
      }
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4" onClick={() => setMenuOpen(false)}>
      <div 
        className="bg-[#131722] rounded-2xl w-full max-w-4xl border border-[#2a2e39] overflow-hidden flex flex-col max-h-[90vh] relative" 
        onClick={(e) => e.stopPropagation()}
      >
        
        <div className="flex justify-between items-center p-4 border-b border-[#2a2e39]">
          <h2 className="text-xl font-bold">Equity Curve</h2>
          <div className="flex items-center gap-2">
            
            <div className="relative">
              <button 
                onClick={() => setMenuOpen(!menuOpen)}
                disabled={isCapturing}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-wait rounded-lg font-bold text-sm transition-colors"
              >
                <Share2 size={16} />
                {isCapturing ? 'Generating…' : 'Share'}
              </button>
              
              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl overflow-hidden z-10 min-w-[200px]">
                  <button 
                    onClick={handleNativeShare} 
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#2a2e39] text-sm text-left text-white transition-colors"
                  >
                    <Smartphone size={16} className="text-purple-400" />
                    Share via...
                  </button>
                  <button 
                    onClick={handleWhatsApp} 
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#2a2e39] text-sm text-left text-white transition-colors"
                  >
                    <MessageCircle size={16} className="text-green-400" />
                    WhatsApp
                  </button>
                  <button 
                    onClick={handleTelegram} 
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#2a2e39] text-sm text-left text-white transition-colors"
                  >
                    <Send size={16} className="text-blue-400" />
                    Telegram
                  </button>
                  <button 
                    onClick={handleEmail} 
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#2a2e39] text-sm text-left text-white transition-colors"
                  >
                    <Mail size={16} className="text-yellow-400" />
                    Email
                  </button>
                  <button 
                    onClick={handleDownload} 
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#2a2e39] text-sm text-left text-white transition-colors border-t border-[#2a2e39]"
                  >
                    <Download size={16} className="text-gray-400" />
                    Download Image
                  </button>
                </div>
              )}
            </div>
            
            <button onClick={closeEquity} className="p-2 hover:bg-[#2a2e39] rounded-lg transition-colors">
              <X size={20}/>
            </button>
          </div>
        </div>

        <div ref={captureRef} className="bg-[#131722] overflow-y-auto flex-1">
          
          <div className="px-5 pt-4 flex justify-between items-center">
            <span className="text-base font-bold">
              <span className="text-blue-500">Omax</span>
              <span className="text-white">FX Game</span>
            </span>
            <span className="text-[10px] text-gray-500 font-mono">{new Date().toLocaleDateString()}</span>
          </div>

          {/* Player name */}
          <div className="px-5 pt-2">
            <span className="text-sm text-gray-300 font-bold">{playerName || 'Player'}</span>
          </div>

          <div className="grid grid-cols-4 gap-3 p-5">
            <div className="bg-[#1e222d] p-3 rounded-lg">
              <p className="text-[10px] text-gray-400 uppercase font-bold">Starting Balance</p>
              <p className="text-base font-bold mt-1">${startBalance.toLocaleString()}</p>
            </div>
            <div className="bg-[#1e222d] p-3 rounded-lg">
              <p className="text-[10px] text-gray-400 uppercase font-bold">Current Equity</p>
              <p className="text-base font-bold mt-1">${balance.toFixed(2)}</p>
            </div>
            <div className="bg-[#1e222d] p-3 rounded-lg">
              <p className="text-[10px] text-gray-400 uppercase font-bold">Total PnL</p>
              <p className={`text-base font-bold mt-1 ${currentPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ${currentPnl.toFixed(2)}
              </p>
            </div>
            <div className="bg-[#1e222d] p-3 rounded-lg">
              <p className="text-[10px] text-gray-400 uppercase font-bold">Return %</p>
              <p className={`text-base font-bold mt-1 ${pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {pnlPercent.toFixed(2)}%
              </p>
            </div>
          </div>

          <div className="px-5 pb-5" style={{ minHeight: '340px' }}>
            {tradeHistory.length === 0 ? (
              <div className="flex items-center justify-center h-[320px] text-gray-500">
                No trades yet. Close a trade to see your equity curve!
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={equityData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e222d" />
                  <XAxis 
                    dataKey="trade" 
                    stroke="#666" 
                    label={{ value: 'Trade #', position: 'insideBottom', offset: -5, fill: '#888', fontSize: 11 }}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis 
                    stroke="#666" 
                    domain={[minEquity * 0.98, maxEquity * 1.02]}
                    tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e222d', border: '1px solid #2a2e39', borderRadius: '8px' }}
                    formatter={(value) => [`$${value.toFixed(2)}`, 'Balance']}
                    labelFormatter={(label) => `Trade #${label}`}
                  />
                  <ReferenceLine y={startBalance} stroke="#444" strokeDasharray="3 3" />
                  <Line 
                    type="monotone" 
                    dataKey="balance" 
                    stroke="#26a69a" 
                    strokeWidth={2} 
                    dot={false}
                    activeDot={{ r: 5, fill: '#26a69a' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="px-5 pb-4 text-center">
            <span className="text-[10px] text-gray-500">Trading Performance Report • OmaxFX Game</span>
          </div>
        </div>

        {toast && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[#1e222d] border border-blue-500/50 px-4 py-2.5 rounded-lg text-sm text-white shadow-2xl z-20 whitespace-nowrap animate-pulse">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}