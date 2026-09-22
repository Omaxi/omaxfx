import Chart from './components/Chart';
import ControlPanel from './components/ControlPanel';
import OrderModal from './components/OrderModal';
import HistoryModal from './components/HistoryModal';
import EquityModal from './components/EquityModal';
import AnalyticsModal from './components/AnalyticsModal';
import ChartThemeModal from './components/ChartThemeModal';
import InfoModal from './components/InfoModal';
import SoundToggle from './components/SoundToggle';
import PeriodModal from './components/PeriodModal';
import GameOverModal from './components/GameOverModal';
import { useStore, INITIAL_BALANCE } from './store';
import { aggregateData } from './utils/timeframe';
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
    loadingState, openInfo, theme, allRawData,
    sessionName, setSessionName, saveSession
  } = useStore();
  const soundtrackStarted = useRef(false);
  const restoredRef = useRef(false);

  useEffect(() => {
    if (!loadingState.isActive) {
      const t1 = setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
      const t2 = setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [loadingState.isActive]);

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
                const isoString = `${year}-${month}-${day}T${paddedTime}+03:00`;
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

  // AUTO-RESTORE saved session on first load
  useEffect(() => {
    if (allRawData.length === 0) return;
    if (restoredRef.current) return;
    restoredRef.current = true;

    const saved = useStore.getState().readSession();
    if (!saved || !saved.gameStarted || !saved.gamePeriod) {
      useStore.getState().openPeriodModal();
      return;
    }

    // Use the store's built-in loader
    const ok = useStore.getState().loadSavedSession();
    if (!ok) useStore.getState().openPeriodModal();
  }, [allRawData]);

  // AUTOSAVE debounced
  useEffect(() => {
    let t = null;
    const unsub = useStore.subscribe((state) => {
      if (!state.gameStarted) return;
      const key = [
        state.currentIndex,
        state.balance.toFixed(2),
        state.positions.length,
        state.tradeHistory.length,
        state.pendingOrders.length,
        state.drawings.length,
        state.drawingsPast.length,
        state.timeframe,
        state.symbol,
        state.timezone,
        state.sessionName,
      ].join('|');
      if (key === App._lastSaveKey) return;
      App._lastSaveKey = key;
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        try { useStore.getState().saveSession(); } catch (e) {}
      }, 800);
    });
    return () => { unsub(); if (t) clearTimeout(t); };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (tag === 'BUTTON') return;
      
      const state = useStore.getState();

      if (e.code === 'Space') {
        e.preventDefault();
        state.togglePlay();
        return;
      }
      if (e.code === 'ArrowRight') {
        e.preventDefault();
        state.stepForward();
        return;
      }
      if (e.code === 'KeyM') {
        e.preventDefault();
        state.toggleMusic();
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    let interval;
    if (isPlaying && currentIndex < rawData.length - 1 && !gameState.isOver) {
      interval = setInterval(() => { stepForward(); }, 250);
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

  const handleNewSession = () => {
    try { saveSession(); } catch (e) {}
    restartGame();
  };

  const percent = loadingState.total > 0
    ? Math.min(100, Math.round((loadingState.loaded / loadingState.total) * 100))
    : 0;

  return (
    <div className="flex flex-col h-dvh overflow-hidden" style={{ backgroundColor: theme.background }}>
      <header className="px-2 py-1 bg-[#131722] border-b border-[#2a2e39] flex-shrink-0 flex justify-between items-center gap-2">
        <div className="flex items-center gap-2 flex-shrink-0">
          <h1 className="text-sm font-bold tracking-wider whitespace-nowrap">
            <span className="text-blue-500">Omax</span>
            <span className="text-white">FX</span>
            <span className="hidden sm:inline text-gray-400 ml-1">Simulator</span>
          </h1>
          {gameStarted && (
            <>
              <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded font-mono font-bold text-[11px] border ${timeBoxClass}`}>
                <Clock size={10} />
                <span>{formatTime(timeRemaining)}</span>
              </div>
              <input
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                onBlur={() => { try { saveSession(); } catch (e) {} }}
                maxLength={30}
                title="Session name — click to rename"
                className="hidden md:block bg-transparent text-gray-400 hover:text-white focus:text-white text-[11px] font-bold outline-none border border-transparent hover:border-[#2a2e39] focus:border-blue-500 rounded px-1.5 py-0.5 w-32 transition-colors"
              />
            </>
          )}
          {positions.length > 0 && (
            <span className="bg-green-900/50 text-green-400 px-1.5 py-0.5 rounded text-[10px] font-bold hidden md:inline">
              {positions.length}
            </span>
          )}
        </div>

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
              onClick={handleNewSession}
              className="w-7 h-7 bg-[#1e222d] border border-[#2a2e39] hover:bg-blue-900/50 hover:text-blue-400 rounded flex items-center justify-center"
              title="New session"
            >
              <RotateCcw size={13} />
            </button>
          )}
          <SoundToggle />
          <button 
            onClick={openInfo}
            className="w-7 h-7 bg-[#1e222d] border border-[#2a2e39] hover:bg-blue-900/50 hover:text-blue-400 rounded flex items-center justify-center"
            title="Quick guide"
          >
            <Info size={13} />
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
      <AnalyticsModal />
      <ChartThemeModal />
      <InfoModal />
      <PeriodModal />
      <GameOverModal />

      {loadingState.isActive && (
        <div className="fixed inset-0 bg-[#0b0e11] z-[100] flex items-center justify-center">
          <div className="w-80 max-w-[90vw] space-y-4">
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-wider mb-1">
                <span className="text-blue-500">Omax</span>
                <span className="text-white">FX Simulator</span>
              </h1>
              <p className="text-xs text-gray-500 italic">Trading Replay Engine</p>
              <p className="text-[10px] text-gray-600 mt-2">
                {loadingState.error ? 'Failed to load data' : 'Loading market data…'}
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