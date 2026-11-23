import ChartWorkspace from './components/ChartWorkspace';
import ControlPanel from './components/ControlPanel';
import OrderModal from './components/OrderModal';
import HistoryModal from './components/HistoryModal';
import AnalyticsModal from './components/AnalyticsModal';
import InfoModal from './components/InfoModal';
import SoundToggle from './components/SoundToggle';
import PeriodModal from './components/PeriodModal';
import GameOverModal from './components/GameOverModal';
import EquityModal from './components/EquityModal';
import CelebrationOverlay from './components/CelebrationOverlay';
import LoadingScreen from './components/LoadingScreen';
import TradeScreenshotCapture from './components/TradeScreenshotCapture';
import DataImportModal from './components/DataImportModal';
import { useStore } from './store';
import { useEffect, useRef, useState } from 'react';
import { startSoundtrack, stopSoundtrack } from './utils/audio';
import { fmtMoney } from './utils/format';
import { fetchDataCatalog, loadBundledCsvFiles } from './utils/dataCatalog';
import { getPnlMultiplier } from './utils/instrument';
import { RotateCcw, Info, Sparkles, AlertTriangle, ChevronDown, LogOut, Square, Columns2, LayoutGrid, Sun, Moon } from 'lucide-react';

function App() {
  const { 
    isPlaying, stepForward, currentIndex, rawData, replaySpeed, balance, positions, 
    musicEnabled, gameStarted,
    gameState, restartGame,
    loadingState, openInfo, openHistory, openAnalytics, theme, uiTheme, toggleUiTheme,
    sessionName, setSessionName, saveSession,
    enableFireworks, toggleFireworks,
    symbolWarning, clearSymbolWarning,
  } = useStore();
  const soundtrackStarted = useRef(false);
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false);
  const [savedSessions, setSavedSessions] = useState([]);
  const [sessionLoadingId, setSessionLoadingId] = useState(null);
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
    let cancelled = false;
    const initializeMarketData = async () => {
      const state = useStore.getState();
      if (state.allRawData?.length > 1) {
        state.setLoadingState({ isActive: false, loaded: 0, total: 0, error: null });
        state.openPeriodModal();
        return;
      }

      state.setLoadingState({ isActive: true, loaded: 0, total: 100, error: null });
      try {
        const catalog = await fetchDataCatalog();
        const bundledFiles = catalog
          .filter(file => String(file.symbol || '').toUpperCase() === 'XAUUSD')
          .sort((a, b) => Number(a.year || 0) - Number(b.year || 0) || Number(a.month || 0) - Number(b.month || 0));
        if (!bundledFiles.length) throw new Error('The bundled XAUUSD market dataset is missing.');

        const loaded = await loadBundledCsvFiles(bundledFiles, progress => {
          if (!cancelled) {
            useStore.getState().setLoadingState({
              isActive: true,
              loaded: Number(progress.percent) || 0,
              total: 100,
              error: null,
            });
          }
        });
        if (cancelled) return;

        useStore.getState().setCustomSymbolData('XAUUSD', loaded.candles, {
          contractSize: 100,
          tickSize: 0.01,
          precision: 2,
          quoteCurrency: 'USD',
          quoteToAccountRate: 1,
        });
        useStore.getState().setLoadingState({ isActive: false, loaded: 100, total: 100, error: null });
      } catch (error) {
        if (cancelled) return;
        console.error('[startup] Unable to load bundled XAUUSD data:', error);
        useStore.getState().setLoadingState({ isActive: false, loaded: 0, total: 0, error: null });
        useStore.getState().openPeriodModal();
        window.dispatchEvent(new Event('omaxfx:open-data-import'));
      }
    };

    initializeMarketData();
    return () => { cancelled = true; };
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
      const speed = Number(replaySpeed) || 1;
      // Up to 10 bars/s, advance one source minute at each interval.
      // Faster modes batch several 1m bars per 20ms tick to avoid hundreds
      // of React renders per second while preserving every source candle.
      if (speed <= 10) {
        interval = setInterval(() => { stepForward('minute', 1); }, 1000 / speed);
      } else {
        const batchSize = Math.max(1, Math.round(speed / 50));
        interval = setInterval(() => { stepForward('minute', batchSize); }, 20);
      }
    }
    return () => clearInterval(interval);
  }, [isPlaying, currentIndex, rawData, replaySpeed, stepForward, gameState.isOver]);



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

  const handleResumeSession = async (sessionId) => {
    if (sessionLoadingId) return;
    try { saveSession(); } catch (e) {}
    setSessionLoadingId(sessionId);
    try {
      const saved = useStore.getState().readSession(sessionId);
      if (!saved?.gamePeriod || !saved.symbol) throw new Error('This saved session is incomplete.');

      // Session timestamps are stored in the saved display timezone. Convert
      // the range back to the UTC+3 market calendar used by public/data.
      const offsets = { 'UTC-5': -300, 'UTC-4': -240, 'UTC-3': -180, 'UTC-2': -120, 'UTC-1': -60, UTC: 0, 'UTC+1': 60, 'UTC+2': 120, 'UTC+3': 180 };
      const savedOffset = offsets[saved.timezone || 'UTC+3'] ?? 180;
      const displayShiftSeconds = (savedOffset - 180) * 60;
      const from = Number(saved.gamePeriod.from) - displayShiftSeconds;
      const to = Number(saved.gamePeriod.to) - displayShiftSeconds;
      if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) throw new Error('The saved session has an invalid market-data date range.');

      const start = new Date((from + 10800) * 1000);
      const end = new Date((to + 10800) * 1000);
      const requiredMonths = [];
      const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
      const lastMonth = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1);
      while (cursor.getTime() <= lastMonth) {
        requiredMonths.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }

      const catalog = await fetchDataCatalog();
      const symbolFiles = catalog.filter(file => String(file.symbol).toUpperCase() === String(saved.symbol).toUpperCase());
      if (!symbolFiles.length) {
        throw new Error(`Session data is not available. No ${saved.symbol} CSV dataset was found in public/data/.`);
      }

      const selectedFiles = [];
      const years = [...new Set(requiredMonths.map(month => Number(month.slice(0, 4))))];
      for (const year of years) {
        const yearFile = symbolFiles.find(file => Number(file.year) === year);
        const monthsForYear = requiredMonths.filter(month => Number(month.slice(0, 4)) === year);
        const monthFiles = monthsForYear.map(month => (yearFile?.monthlyFiles || []).find(file => `${file.year}-${String(file.month).padStart(2, '0')}` === month));
        if (monthFiles.every(Boolean)) selectedFiles.push(...monthFiles);
        else if (yearFile) selectedFiles.push(yearFile);
        else throw new Error(`Session data is not available. The required ${saved.symbol} data for ${year} is missing from public/data/.`);
      }

      const result = await loadBundledCsvFiles(selectedFiles);
      const specs = saved.contractSpecs?.[saved.symbol] || (
        saved.symbol === 'XAUUSD' ? { contractSize: 100, tickSize: 0.01, precision: 2, quoteCurrency: 'USD', quoteToAccountRate: 1 } :
        { contractSize: 100000, tickSize: saved.symbol.includes('JPY') ? 0.001 : 0.00001, precision: saved.symbol.includes('JPY') ? 3 : 5, quoteCurrency: 'USD', quoteToAccountRate: 1 }
      );
      useStore.getState().setCustomSymbolData(saved.symbol, result.candles, specs);
      const loaded = useStore.getState().loadSavedSession(sessionId);
      if (!loaded) throw new Error('The required CSV exists, but it does not contain enough valid candles for this saved session date range.');
      setSessionMenuOpen(false);
    } catch (error) {
      window.alert(error?.message || 'Session data is not available. Check that its CSV file exists in public/data/.');
    } finally {
      setSessionLoadingId(null);
    }
  };

  const handleDeleteSession = (sessionId) => {
    const activeSessionId = useStore.getState().sessionId;
    if (sessionId === activeSessionId) {
      window.alert('The active session cannot be deleted while it is open. Start another session first, then delete it here.');
      return;
    }
    if (!window.confirm('Delete this saved session permanently? This cannot be undone.')) return;
    const remaining = useStore.getState().deleteSavedSession(sessionId);
    setSavedSessions(remaining);
  };

  const handleNewSession = () => {
    try { saveSession(); } catch (e) {}
    restartGame();
  };

  return (
    <div className="flex flex-col h-dvh overflow-hidden" style={{ backgroundColor: theme.background, color: uiTheme === 'light' ? '#172033' : '#ffffff' }}>
      {/* Hidden audio element — preloaded by the browser at page load. */}
      <audio
        id="sfx-tphit"
        src={`${import.meta.env.BASE_URL}sounds/tphit.mp3`}
        preload="auto"
        style={{ display: 'none' }}
      />

      <header className="app-header px-2 py-1 bg-[#131722] border-b border-[#2a2e39] flex-shrink-0 flex justify-between items-center gap-2">
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
                <div className="theme-menu-surface absolute right-0 top-9 z-[100] w-64 max-h-[60vh] overflow-y-auto rounded-lg border border-[#2a2e39] bg-[#1e222d] p-1 shadow-2xl">
                  <div className="px-2 py-1.5 text-[9px] uppercase tracking-wide text-gray-500">Saved sessions</div>
                  {savedSessions.length === 0 ? <div className="px-2 py-3 text-xs text-gray-500">No saved sessions yet</div> : savedSessions.map(item => {
                    const isActive = item.sessionId === useStore.getState().sessionId;
                    return (
                      <div key={item.sessionId} className="flex items-center gap-1 rounded px-1 py-1 hover:bg-[#2a2e39]">
                        <button disabled={Boolean(sessionLoadingId)} onClick={() => handleResumeSession(item.sessionId)} className="min-w-0 flex-1 rounded px-1 py-1 text-left disabled:opacity-60">
                          <div className="truncate text-xs font-bold text-white">{item.sessionName || 'Untitled session'} · {item.symbol || 'Market'}{isActive ? ' · Active' : ''}</div>
                          <div className="text-[10px] text-gray-400">{new Date(item.savedAt || Date.now()).toLocaleString()} · ${Number(item.balance || 0).toLocaleString()}</div>
                          {sessionLoadingId === item.sessionId && <div className="mt-1 text-[10px] text-blue-300">Loading market data…</div>}
                        </button>
                        <button type="button" disabled={isActive || Boolean(sessionLoadingId)} onClick={() => handleDeleteSession(item.sessionId)} title={isActive ? 'Start another session before deleting the active session' : 'Delete saved session'} className="shrink-0 rounded px-2 py-1.5 text-[10px] font-semibold text-red-300 hover:bg-red-500/15 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-30">Delete</button>
                      </div>
                    );
                  })}
                </div>
              </>}
            </div>
          )}
        </div>

        {gameStarted && <div className="hidden md:flex items-center gap-1 rounded-lg border border-[#2a2e39] bg-[#0f131c] p-0.5 flex-shrink-0" aria-label="Chart layout">
          <span className="px-1 text-[8px] font-bold uppercase tracking-wide text-gray-500">Layout</span>
          {[{ value: 1, label: 'Single', Icon: Square }, { value: 2, label: 'Two charts', Icon: Columns2 }, { value: 4, label: 'Four charts', Icon: LayoutGrid }].map(({ value, label, Icon }) => (
            <button key={value} type="button" onClick={() => useStore.getState().setChartLayout(value)} title={label} aria-label={label} aria-pressed={useStore.getState().chartLayout === value}
              className={`flex h-7 w-7 items-center justify-center rounded ${useStore.getState().chartLayout === value ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-[#2a2e39]'}`}>
              <Icon size={14}/>
            </button>
          ))}
        </div>}

        {gameStarted && <div className="hidden lg:flex items-center gap-1.5 flex-shrink-0">
          <button onClick={openHistory} className="px-2.5 py-1.5 rounded border border-[#2a2e39] bg-[#1e222d] text-[10px] font-semibold text-gray-200 hover:bg-[#2a2e39]">History</button>
          <button onClick={openAnalytics} className="px-2.5 py-1.5 rounded border border-[#2a2e39] bg-[#1e222d] text-[10px] font-semibold text-gray-200 hover:bg-[#2a2e39]">Analytics</button>
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
              className="app-header-action header-action-new-session w-7 h-7 bg-[#1e222d] border border-[#2a2e39] hover:bg-blue-900/50 rounded flex items-center justify-center"
              style={{ color: "#22d3ee" }}
              title="New session"
            >
              <RotateCcw size={13} />
            </button>
          )}
          <SoundToggle />
          
          <button
            onClick={toggleFireworks}
            className={`app-header-action w-7 h-7 border rounded flex items-center justify-center transition-colors ${
              enableFireworks
                ? 'bg-yellow-900/30 border-yellow-600/50 text-yellow-400 hover:bg-yellow-900/50'
                : 'bg-[#1e222d] border-[#2a2e39] text-gray-500 hover:text-gray-300'
            }`}
            title={enableFireworks ? 'Disable Fireworks' : 'Enable Fireworks'}
          >
            <Sparkles size={13} />
          </button>

          <button onClick={handleExitPlatform} className="app-header-action w-7 h-7 bg-[#1e222d] border border-red-900/50 hover:bg-red-900/40 text-red-400 rounded flex items-center justify-center" title="Save and exit OmaxFX">
            <LogOut size={13}/>
          </button>

          <button type="button" onClick={toggleUiTheme}
            className="app-header-action header-action-theme w-7 h-7 bg-[#1e222d] border border-[#2a2e39] hover:bg-blue-900/50 rounded flex items-center justify-center"
            style={{ color: "#f59e0b" }}
            title={uiTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label={uiTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
            {uiTheme === 'dark' ? <Sun size={13}/> : <Moon size={13}/>}
          </button>

          <button 
            onClick={openInfo}
            className="app-header-action header-action-guide w-7 h-7 bg-[#1e222d] border border-[#2a2e39] hover:bg-blue-900/50 rounded flex items-center justify-center"
            style={{ color: "#3b82f6" }}
            title="Quick guide"
          >
            <Info size={13} />
          </button>
        </div>
      </header>
      
      <main className="flex-1 relative min-h-0">
        <ChartWorkspace />
      </main>
      <TradeScreenshotCapture />
      
      <ControlPanel />
      <DataImportModal />

      <OrderModal />
      <HistoryModal />
      <AnalyticsModal />
      <InfoModal />
      <PeriodModal />
      <GameOverModal />
      <EquityModal />

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