import Chart from './components/Chart';
import ControlPanel from './components/ControlPanel';
import OrderModal from './components/OrderModal';
import HistoryModal from './components/HistoryModal';
import AnalyticsModal from './components/AnalyticsModal';
import ChartThemeModal from './components/ChartThemeModal';
import InfoModal from './components/InfoModal';
import SoundToggle from './components/SoundToggle';
import PeriodModal from './components/PeriodModal';
import GameOverModal from './components/GameOverModal';
import CelebrationOverlay from './components/CelebrationOverlay';
import LoadingScreen from './components/LoadingScreen';
import TradeScreenshotCapture from './components/TradeScreenshotCapture';
import DataImportModal from './components/DataImportModal';
import PreviousSessionsModal from './components/PreviousSessionsModal';
import { useStore } from './store';
import { useEffect, useRef, useState } from 'react';
import { startSoundtrack, stopSoundtrack } from './utils/audio';
import { fmtMoney } from './utils/format';
import { getPnlMultiplier } from './utils/instrument';
import { RotateCcw, Info, Sparkles, AlertTriangle, ChevronDown, LogOut, Sun, Moon } from 'lucide-react';

function App() {
  const { 
    isPlaying, stepForward, currentIndex, rawData, balance, positions, 
    musicEnabled, gameStarted,
    gameState, restartGame,
    loadingState, openInfo, openHistory, openAnalytics, openTheme, theme,
    sessionName, setSessionName, saveSession,
    enableFireworks, toggleFireworks,
    symbolWarning, clearSymbolWarning,
  } = useStore();
  const soundtrackStarted = useRef(false);
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false);
  const [savedSessions, setSavedSessions] = useState([]);
  const [uiTheme, setUiTheme] = useState(() => {
    try { return localStorage.getItem('omaxfx-ui-theme') === 'light' ? 'light' : 'dark'; }
    catch { return 'dark'; }
  });

  useEffect(() => {
    document.documentElement.dataset.uiTheme = uiTheme;
    window.dispatchEvent(new CustomEvent('omaxfx-ui-theme-change', { detail: uiTheme }));
    try { localStorage.setItem('omaxfx-ui-theme', uiTheme); } catch {}
  }, [uiTheme]);

  useEffect(() => {
    if (!symbolWarning) return;
    const t = setTimeout(() => clearSymbolWarning(), 5000);
    return () => clearTimeout(t);
  }, [symbolWarning, clearSymbolWarning]);

  useEffect(() => {
    if (!loadingState.isActive) {
      const t1 = setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
      const t2 = setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [loadingState.isActive]);

  useEffect(() => {
    useStore.getState().setLoadingState({ isActive: false, loaded: 0, total: 0, error: null });
    useStore.getState().openPeriodModal();
  }, []);

  // ============================================================
  // AUTO-SAVE
  // ============================================================
  useEffect(() => {
    let t = null;
    const periodicSave = setInterval(() => {
      if (useStore.getState().gameStarted) useStore.getState().saveSession();
    }, 5000);
    const flushSave = () => {
      if (useStore.getState().gameStarted) useStore.getState().saveSession();
    };
    window.addEventListener('pagehide', flushSave);
    window.addEventListener('beforeunload', flushSave);
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
        state.pencilStrokes.length,
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
    return () => {
      unsub(); if (t) clearTimeout(t); clearInterval(periodicSave);
      window.removeEventListener('pagehide', flushSave);
      window.removeEventListener('beforeunload', flushSave);
    };
  }, []);

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
    return sum + priceDiff * getPnlMultiplier(pos.symbol || useStore.getState().symbol, useStore.getState().contractSpecs) * pos.size;
  }, 0);

  const handleExitPlatform = () => {
    try { useStore.getState().saveSession(); } catch (e) {}
    useStore.setState({ isPlaying: false });
    stopSoundtrack();
    setSessionMenuOpen(false);
    window.close();
    window.setTimeout(() => {
      if (!window.closed) window.alert('Your session has been saved. Please close this browser tab to exit OmaxFX.');
    }, 80);
  };

  const toggleSessionMenu = () => {
    if (!sessionMenuOpen) {
      try { saveSession(); } catch (e) {}
      setSavedSessions(useStore.getState().readSessions());
    }
    setSessionMenuOpen(value => !value);
  };

  const handleResumeSession = (sessionId) => {
    try { saveSession(); } catch (e) {}
    const loaded = useStore.getState().loadSavedSession(sessionId);
    if (!loaded) window.alert('This session could not be resumed. Its market data may not be loaded.');
    setSessionMenuOpen(false);
  };

  const handleNewSession = () => {
    try { saveSession(); } catch (e) {}
    restartGame();
  };

  return (
    <div className="flex flex-col h-dvh overflow-hidden" style={{ backgroundColor: uiTheme === 'light' ? '#f4f6fa' : theme.background, color: uiTheme === 'light' ? '#172033' : '#ffffff' }}>
      {/* Hidden audio element — preloaded by the browser at page load. */}
      <audio
        id="sfx-tphit"
        src={`${import.meta.env.BASE_URL}sounds/tphit.mp3`}
        preload="auto"
        style={{ display: 'none' }}
      />

      <header className="px-2 py-1 bg-[#131722] border-b border-[#2a2e39] flex-shrink-0 flex justify-between items-center gap-2">
        <div className="flex items-center gap-2 flex-shrink-0">
          <h1 className="text-sm font-bold tracking-wider whitespace-nowrap">
            <span className="text-blue-500">Omax</span>
            <span className="text-white">FX</span>
            <span className="hidden sm:inline text-gray-400 ml-1">Simulator</span>
          </h1>
          {gameStarted && (
            <>
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
          {gameStarted && (
            <div className="relative">
              <button onClick={toggleSessionMenu} className="h-7 px-2 bg-[#1e222d] border border-[#2a2e39] hover:bg-[#2a2e39] rounded flex items-center gap-1 text-[10px] text-gray-200" title="Switch to a previous saved session">
                Sessions <ChevronDown size={11}/>
              </button>
              {sessionMenuOpen && <>
                <button aria-label="Close sessions menu" className="fixed inset-0 z-[90] cursor-default" onClick={() => setSessionMenuOpen(false)}/>
                <div className="absolute right-0 top-9 z-[100] w-64 max-h-[60vh] overflow-y-auto rounded-lg border border-[#2a2e39] bg-[#1e222d] p-1 shadow-2xl">
                  <div className="px-2 py-1.5 text-[9px] uppercase tracking-wide text-gray-500">Saved sessions</div>
                  {savedSessions.length === 0 ? <div className="px-2 py-3 text-xs text-gray-500">No saved sessions yet</div> : savedSessions.map(item => (
                    <button key={item.sessionId} onClick={() => handleResumeSession(item.sessionId)} className="w-full rounded px-2 py-2 text-left hover:bg-[#2a2e39]">
                      <div className="text-xs font-bold text-white">{item.sessionName || 'Untitled session'} · {item.symbol || 'Market'}</div>
                      <div className="text-[10px] text-gray-400">{new Date(item.savedAt || Date.now()).toLocaleString()} · ${Number(item.balance || 0).toLocaleString()}</div>
                    </button>
                  ))}
                </div>
              </>}
            </div>
          )}
        </div>

        {gameStarted && <div className="hidden lg:flex items-center gap-1.5 flex-shrink-0">
          <button onClick={openHistory} className="px-2.5 py-1.5 rounded border border-[#2a2e39] bg-[#1e222d] text-[10px] font-semibold text-gray-200 hover:bg-[#2a2e39]">History</button>
          <button onClick={openAnalytics} className="px-2.5 py-1.5 rounded border border-[#2a2e39] bg-[#1e222d] text-[10px] font-semibold text-gray-200 hover:bg-[#2a2e39]">Analytics</button>
          <button onClick={openTheme} className="px-2.5 py-1.5 rounded border border-[#2a2e39] bg-[#1e222d] text-[10px] font-semibold text-gray-200 hover:bg-[#2a2e39]">Theme</button>
          <button onClick={() => window.dispatchEvent(new Event('omaxfx:reset-chart'))} className="px-2.5 py-1.5 rounded border border-[#2a2e39] bg-[#1e222d] text-[10px] font-semibold text-gray-200 hover:bg-[#2a2e39]">Reset Chart</button>
        </div>}

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
            onClick={toggleFireworks}
            className={`w-7 h-7 border rounded flex items-center justify-center transition-colors ${
              enableFireworks
                ? 'bg-yellow-900/30 border-yellow-600/50 text-yellow-400 hover:bg-yellow-900/50'
                : 'bg-[#1e222d] border-[#2a2e39] text-gray-500 hover:text-gray-300'
            }`}
            title={enableFireworks ? 'Disable Fireworks' : 'Enable Fireworks'}
          >
            <Sparkles size={13} />
          </button>

          <button onClick={() => setUiTheme(value => value === 'dark' ? 'light' : 'dark')} className="w-7 h-7 bg-[#1e222d] border border-[#2a2e39] hover:bg-[#2a2e39] text-gray-300 rounded flex items-center justify-center" title={uiTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} aria-label="Toggle light and dark theme">
            {uiTheme === 'dark' ? <Sun size={13}/> : <Moon size={13}/>}
          </button>

          <button onClick={handleExitPlatform} className="w-7 h-7 bg-[#1e222d] border border-red-900/50 hover:bg-red-900/40 text-red-400 rounded flex items-center justify-center" title="Save and exit OmaxFX">
            <LogOut size={13}/>
          </button>

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
      <TradeScreenshotCapture />
      
      <ControlPanel />
      <DataImportModal />
      <PreviousSessionsModal />

      <OrderModal />
      <HistoryModal />
      <AnalyticsModal />
      <ChartThemeModal />
      <InfoModal />
      <PeriodModal />
      <GameOverModal />

      <CelebrationOverlay />

      {symbolWarning && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-[200] pointer-events-none"
          style={{ top: '56px' }}
        >
          <div className="flex items-center gap-2 px-4 py-2.5 bg-[#1e222d]/98 backdrop-blur border border-amber-500/60 rounded-lg shadow-2xl shadow-black/60">
            <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wide">
                Symbol unavailable at this time
              </span>
              <span className="text-xs text-white font-mono">
                {symbolWarning.message}
              </span>
            </div>
          </div>
        </div>
      )}

      {loadingState.isActive && <LoadingScreen />}
    </div>
  );
}

export default App;