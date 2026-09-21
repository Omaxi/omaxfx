import Chart from './components/Chart';
import ControlPanel from './components/ControlPanel';
import OrderModal from './components/OrderModal';
import HistoryModal from './components/HistoryModal';
import EquityModal from './components/EquityModal';
import InfoModal from './components/InfoModal';
import SoundToggle from './components/SoundToggle';
import PeriodModal from './components/PeriodModal';
import GameOverModal from './components/GameOverModal';
import { useStore } from './store';
import { useEffect, useRef } from 'react';
import { startSoundtrack, stopSoundtrack } from './utils/audio';
import { fmtMoney, fmtMB } from './utils/format';
import Papa from 'papaparse';
import { Clock, RotateCcw, Info } from 'lucide-react';

const formatTime = (sec) => {
  if (sec == null) return '∞';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

function App() {
  const { 
    isPlaying, stepForward, currentIndex, rawData, balance, positions, 
    musicEnabled, setAllData, gameStarted, gamePeriod,
    gameState, rules, updateTimeRemaining, endGame, restartGame,
    loadingState, openInfo
  } = useStore();
  const soundtrackStarted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const setLoadingState = useStore.getState().setLoadingState;
    const csvUrl = `${import.meta.env.BASE_URL}data/xauusd.csv`;

    const loadCSV = async () => {
      try {
        setLoadingState({ isActive: true, loaded: 0, total: 0, error: null });
        const response = await fetch(csvUrl);
        if (!response.ok) throw new Error(`Failed to fetch CSV: ${response.status}`);
        const contentLength = response.headers.get('Content-Length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;
        let loaded = 0, csvText = '';
        if (response.body && response.body.getReader) {
          const reader = response.body.getReader();
          const chunks = [];
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (cancelled) return;
            chunks.push(value);
            loaded += value.length;
            setLoadingState({ loaded, total });
          }
          const allChunks = new Uint8Array(loaded);
          let position = 0;
          for (const chunk of chunks) { allChunks.set(chunk, position); position += chunk.length; }
          csvText = new TextDecoder('utf-8').decode(allChunks);
        } else {
          csvText = await response.text();
          loaded = csvText.length;
          setLoadingState({ loaded, total: loaded });
        }
        Papa.parse(csvText, {
          header: true, dynamicTyping: true,
          complete: (results) => {
            const formattedData = results.data
              .filter(row => row.date && row.close)
              .map(row => {
                const dateStr = row.date.toString();
                const year = dateStr.substring(0, 4);
                const month = dateStr.substring(4, 6);
                const day = dateStr.substring(6, 8);
                const timeStr = row.time;
                const paddedTime = timeStr.length === 7 ? `0${timeStr}` : timeStr;
                const isoString = `${year}-${month}-${day}T${paddedTime}`;
                return {
                  time: new Date(isoString).getTime() / 1000,
                  open: row.open, high: row.high, low: row.low, close: row.close,
                  volume: Number(row.volume) || 0,
                };
              })
              .filter(row => !isNaN(row.time))
              .sort((a, b) => a.time - b.time);
            setAllData(formattedData);
            setLoadingState({ isActive: false });
          },
          error: (err) => setLoadingState({ isActive: false, error: err.message }),
        });
      } catch (err) {
        console.error('CSV load error:', err);
        setLoadingState({ isActive: false, error: err.message });
      }
    };
    loadCSV();
    return () => { cancelled = true; };
  }, [setAllData]);

  useEffect(() => {
    let interval;
    if (isPlaying && currentIndex < rawData.length - 1 && !gameState.isOver) {
      interval = setInterval(() => { stepForward(); }, 500);
    }
    return () => clearInterval(interval);
  }, [isPlaying, currentIndex, rawData, stepForward, gameState.isOver]);

  useEffect(() => {
    if (!gameStarted || gameState.isOver || !rules.countdownMinutes) return;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - gameState.startTime) / 1000;
      const total = rules.countdownMinutes * 60;
      const remaining = Math.max(0, total - elapsed);
      if (remaining <= 0) {
        endGame('countdown', `Time's up! Your ${rules.countdownMinutes}-minute session ended.`);
        clearInterval(interval);
      } else {
        updateTimeRemaining(remaining);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [gameStarted, gameState.isOver, gameState.startTime, rules.countdownMinutes, endGame, updateTimeRemaining]);

  useEffect(() => {
    const startAudio = () => {
      if (!soundtrackStarted.current && musicEnabled) {
        startSoundtrack();
        soundtrackStarted.current = true;
      }
    };
    window.addEventListener('click', startAudio, { once: true });
    window.addEventListener('keydown', startAudio, { once: true });
    return () => {
      window.removeEventListener('click', startAudio);
      window.removeEventListener('keydown', startAudio);
    };
  }, [musicEnabled]);

  useEffect(() => {
    if (musicEnabled && soundtrackStarted.current) startSoundtrack();
    else if (!musicEnabled) stopSoundtrack();
  }, [musicEnabled]);

  const currentPrice = rawData[currentIndex]?.close || 0;
  const unrealisedPnl = positions.reduce((sum, pos) => {
    const isBuy = pos.type === 'buy';
    const priceDiff = isBuy ? currentPrice - pos.entryPrice : pos.entryPrice - currentPrice;
    return sum + priceDiff * 100 * pos.size;
  }, 0);

  const timeRemaining = gameState.timeRemaining;
  const timeBoxClass = timeRemaining == null 
    ? 'text-gray-500 border-gray-700 bg-gray-900/20'
    : timeRemaining < 60 
      ? 'text-red-400 border-red-600 bg-red-900/40 animate-pulse' 
      : timeRemaining < 300 
        ? 'text-yellow-400 border-yellow-600 bg-yellow-900/30' 
        : 'text-blue-400 border-blue-600 bg-blue-900/30';

  const handleRestart = () => {
    if (window.confirm('Restart game? All progress will be lost.')) restartGame();
  };

  const percent = loadingState.total > 0
    ? Math.min(100, Math.round((loadingState.loaded / loadingState.total) * 100))
    : 0;

  return (
    <div className="flex flex-col h-dvh overflow-hidden">
      {/* HEADER: Logo + Countdown | Stats + Controls */}
      <header className="px-2 py-1 bg-[#131722] border-b border-[#2a2e39] flex-shrink-0 flex justify-between items-center gap-2">
        
        {/* Left */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <h1 className="text-sm font-bold tracking-wider whitespace-nowrap">
            <span className="text-blue-500">Omax</span>
            <span className="text-white">FX</span>
          </h1>
          {gameStarted && (
            <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded font-mono font-bold text-[11px] border ${timeBoxClass}`}>
              <Clock size={10} />
              <span>{formatTime(timeRemaining)}</span>
            </div>
          )}
          {positions.length > 0 && (
            <span className="bg-green-900/50 text-green-400 px-1.5 py-0.5 rounded text-[10px] font-bold hidden md:inline">
              {positions.length}
            </span>
          )}
        </div>

        {/* Right */}
        <div className="flex items-center gap-2 text-[11px] flex-shrink-0">
          <div className="flex items-baseline gap-1">
            <span className="text-gray-400">Bal:</span>
            <span className="text-green-400 font-bold">${fmtMoney(balance, 0)}</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-gray-400 hidden sm:inline">PnL:</span>
            <span className={`font-bold ${unrealisedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              ${fmtMoney(unrealisedPnl)}
            </span>
          </div>
          {gameStarted && (
            <button 
              onClick={handleRestart}
              className="p-1 bg-[#1e222d] hover:bg-red-900/50 hover:text-red-400 rounded border border-[#2a2e39]"
            >
              <RotateCcw size={11} />
            </button>
          )}
          <SoundToggle />
          <button 
            onClick={openInfo}
            className="p-1 bg-[#1e222d] hover:bg-blue-900/50 hover:text-blue-400 rounded border border-[#2a2e39]"
            title="Quick guide"
          >
            <Info size={11} />
          </button>
        </div>
      </header>
      
      <main className="flex-1 relative min-h-0">
        <Chart />
      </main>
      
      <ControlPanel />

      <OrderModal />
      <HistoryModal />
      <EquityModal />
      <InfoModal />
      <PeriodModal />
      <GameOverModal />

      {loadingState.isActive && (
        <div className="fixed inset-0 bg-[#0b0e11] z-[100] flex items-center justify-center">
          <div className="w-80 max-w-[90vw] space-y-4">
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-wider mb-1">
                <span className="text-blue-500">Omax</span>
                <span className="text-white">FX Game</span>
              </h1>
              <p className="text-xs text-gray-500">
                {loadingState.error ? 'Failed to load data' : 'Downloading market data…'}
              </p>
            </div>
            {loadingState.error ? (
              <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-400 text-xs">
                {loadingState.error}
              </div>
            ) : (
              <>
                <div className="h-2 bg-[#1e222d] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-200"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-500 font-mono">
                  <span>{fmtMB(loadingState.loaded)} / {loadingState.total > 0 ? fmtMB(loadingState.total) : '…'}</span>
                  <span>{loadingState.total > 0 ? `${percent}%` : '…'}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;