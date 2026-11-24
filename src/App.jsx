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
import { useEffect, useRef } from 'react';
import { startSoundtrack, stopSoundtrack } from './utils/audio';
import { fmtMoney } from './utils/format';
import { fetchDataCatalog, loadBundledCsvFiles } from './utils/dataCatalog';
import { getPnlMultiplier } from './utils/instrument';
import { Info, Sparkles, AlertTriangle, LogOut, Square, Columns2 } from 'lucide-react';

function ThreeChartLayoutIcon({ size = 14 }) { return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="1" y="1" width="5.5" height="14" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="9.5" y="1" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="9.5" y="9.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.5"/></svg>; }

function App() {
  const { 
    isPlaying, stepForward, currentIndex, rawData, replaySpeed, balance, positions, 
    musicEnabled, gameStarted,
    gameState,
    loadingState, isInfoOpen, openInfo, openHistory, openAnalytics, theme,
    enableFireworks, toggleFireworks,
    symbolWarning, clearSymbolWarning,
  } = useStore();
  const soundtrackStarted = useRef(false);
  useEffect(() => {
    document.documentElement.dataset.uiTheme = 'dark';
    window.dispatchEvent(new CustomEvent('omaxfx-ui-theme-change', { detail: 'dark' }));
    try { localStorage.removeItem('omaxfx-ui-theme'); } catch {}
  }, []);

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
    useStore.setState({ isPlaying: false });
    stopSoundtrack();
    window.close();
    window.setTimeout(() => {
      if (!window.closed) window.alert('Please close this browser tab to exit OmaxFX.');
    }, 80);
  };

  return (
    <div className={`flex flex-col h-dvh overflow-hidden ${isInfoOpen ? 'quick-guide-open' : ''}`} style={{ backgroundColor: theme.background, color: '#ffffff' }}>
      {/* Hidden audio element — preloaded by the browser at page load. */}
      <audio
        id="sfx-tphit"
        src={`${import.meta.env.BASE_URL}sounds/tphit.mp3`}
        preload="auto"
        style={{ display: 'none' }}
      />

      <header className="app-header px-2 py-1 bg-[#131722] border-b border-[#2a2e39] flex-shrink-0 flex justify-between items-center gap-2">
        <div className="flex items-center gap-2 flex-shrink-0">
          <h1 className="flex items-center gap-2 whitespace-nowrap">
            <img
              src={`${import.meta.env.BASE_URL}omaxfx-logo.svg`}
              alt="OmaxFX"
              className="h-8 w-8 object-contain"
              draggable="false"
            />
            <span className="hidden sm:inline text-sm font-bold tracking-wider text-gray-400">Simulator</span>
          </h1>
          {positions.length > 0 && (
            <span className="bg-green-900/50 text-green-400 px-1.5 py-0.5 rounded text-[10px] font-bold hidden md:inline">
              {positions.length}
            </span>
          )}

        </div>

        {gameStarted && <div className="hidden md:flex items-center gap-1 rounded-lg border border-[#2a2e39] bg-[#0f131c] p-0.5 flex-shrink-0" aria-label="Chart layout">
          <span className="px-1 text-[8px] font-bold uppercase tracking-wide text-gray-500">Layout</span>
          {[{ value: 1, label: 'Single chart', Icon: Square }, { value: 2, label: 'Two charts', Icon: Columns2 }, { value: 3, label: 'Three charts', Icon: ThreeChartLayoutIcon }].map(({ value, label, Icon }) => (
            <button key={value} type="button" onClick={() => useStore.getState().setChartLayout(value)} title={label} aria-label={label} aria-pressed={useStore.getState().chartLayout === value}
              className={`flex h-7 w-7 items-center justify-center rounded ${useStore.getState().chartLayout === value ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-[#2a2e39]'}`}>
              <Icon size={14}/>
            </button>
          ))}
        </div>}

        {gameStarted && <div className="hidden lg:flex items-center gap-1.5 flex-shrink-0">
          <button onClick={openHistory} className="header-utility-action px-2.5 py-1.5 rounded border border-[#2a2e39] bg-[#1e222d] text-[10px] font-semibold text-gray-200 hover:bg-[#2a2e39]">History</button>
          <button onClick={openAnalytics} className="header-utility-action px-2.5 py-1.5 rounded border border-[#2a2e39] bg-[#1e222d] text-[10px] font-semibold text-gray-200 hover:bg-[#2a2e39]">Analytics</button>
          <button onClick={() => window.dispatchEvent(new Event('omaxfx:reset-chart'))} className="header-utility-action px-2.5 py-1.5 rounded border border-[#2a2e39] bg-[#1e222d] text-[10px] font-semibold text-gray-200 hover:bg-[#2a2e39]">Reset Chart</button>
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
        {gameStarted && <ChartWorkspace />}
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