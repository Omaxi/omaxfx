import ChartWorkspace from './components/ChartWorkspace';
import ControlPanel from './components/ControlPanel';
import OrderModal from './components/OrderModal';
import HistoryModal from './components/HistoryModal';
import AnalyticsModal from './components/AnalyticsModal';
import InfoModal from './components/InfoModal';
import SoundToggle from './components/SoundToggle';
import SettingsModal from './components/SettingsModal';
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
import { Info, Sparkles, AlertTriangle, LogOut, Square, Columns2, CheckCircle2, TrendingUp, X, Settings, Plus, ChevronDown, CandlestickChart } from 'lucide-react';

function ThreeChartLayoutIcon({ size = 14 }) { return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="1" y="1" width="5.5" height="14" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="9.5" y="1" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="9.5" y="9.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.5"/></svg>; }

function startWithHistoricalContext(state) {
  const data = state.allRawDataBySymbol?.[state.symbol] || state.allRawData || [];
  if (!Array.isArray(data) || data.length < 2) {
    state.openPeriodModal();
    return;
  }
  const days = new Map();
  for (const candle of data) {
    const time = Number(candle.time);
    if (!Number.isFinite(time)) continue;
    const dayStart = Math.floor((time + 3 * 3600) / 86400) * 86400 - 3 * 3600;
    const bucket = days.get(dayStart) || { first: time, last: time, count: 0 };
    bucket.first = Math.min(bucket.first, time);
    bucket.last = Math.max(bucket.last, time);
    bucket.count += 1;
    days.set(dayStart, bucket);
  }
  const ordered = [...days.entries()].filter(([, bucket]) => bucket.count >= 2).sort((a, b) => a[0] - b[0]);
  if (!ordered.length) {
    state.openPeriodModal();
    return;
  }
  const [from, selected] = ordered[ordered.length - 1];
  const previous = ordered.length > 1 ? ordered[ordered.length - 2] : null;
  state.startGame(from, selected.last, state.rules, {
    contextFrom: previous?.[0],
    contextTo: previous?.[1]?.last,
    startAtEnd: !previous,
  });
}

function App() {
  const { 
    isPlaying, stepForward, currentIndex, rawData, replaySpeed, balance, positions, 
    musicEnabled, gameStarted,
    gameState,
    loadingState, isInfoOpen, openInfo, openHistory, openAnalytics, theme,
    timeframe, setTimeframe, chartType, setChartType,
    enableFireworks, toggleFireworks,
    symbolWarning, clearSymbolWarning, tradeNotifications, dismissTradeNotification,
  } = useStore();
  const soundtrackStarted = useRef(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Disable native browser hover tooltips across the entire application.
  // Watch the DOM so title attributes added by dynamically rendered controls are removed too.
  useEffect(() => {
    const stripTooltips = (root) => {
      if (root?.nodeType === 1 && root.hasAttribute?.('title')) root.removeAttribute('title');
      root?.querySelectorAll?.('[title]').forEach((element) => element.removeAttribute('title'));
    };
    stripTooltips(document.documentElement);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'title') {
          mutation.target.removeAttribute('title');
        } else {
          mutation.addedNodes.forEach(stripTooltips);
        }
      }
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['title'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const key = 'tradepast-appearance-v2';
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      useStore.setState(state => ({
        ...(saved.theme && typeof saved.theme === 'object' ? { theme: { ...state.theme, ...saved.theme } } : {}),
        ...(saved.chartOptions && typeof saved.chartOptions === 'object' ? { chartOptions: { ...state.chartOptions, ...saved.chartOptions } } : {}),
        ...(saved.drawingStyles && typeof saved.drawingStyles === 'object' ? {
          drawingStyles: Object.fromEntries(Object.entries({ ...state.drawingStyles, ...saved.drawingStyles }).map(([name, style]) => [name, { ...(state.drawingStyles[name] || {}), ...style }]))
        } : {}),
        ...(saved.sessionColors && typeof saved.sessionColors === 'object' ? { sessionColors: { ...state.sessionColors, ...saved.sessionColors } } : {}),
        ...(saved.sessionTimes && typeof saved.sessionTimes === 'object' ? { sessionTimes: { ...state.sessionTimes, ...saved.sessionTimes } } : {}),
        ...(saved.sessionEndTimes && typeof saved.sessionEndTimes === 'object' ? { sessionEndTimes: { ...state.sessionEndTimes, ...saved.sessionEndTimes } } : {}),
        ...(typeof saved.sessionLabelsVisible === 'boolean' ? { sessionLabelsVisible: saved.sessionLabelsVisible } : {}),
        ...(saved.chartType ? { chartType: saved.chartType } : {}),
      }));
    } catch {}
    document.documentElement.dataset.uiTheme = 'dark';
    document.documentElement.style.colorScheme = 'dark';
    const unsubscribe = useStore.subscribe((state, previous) => {
      if (state.theme !== previous.theme ||
          state.chartOptions !== previous.chartOptions ||
          state.drawingStyles !== previous.drawingStyles ||
          state.sessionColors !== previous.sessionColors ||
          state.sessionTimes !== previous.sessionTimes ||
          state.sessionEndTimes !== previous.sessionEndTimes ||
          state.sessionLabelsVisible !== previous.sessionLabelsVisible ||
          state.chartType !== previous.chartType) {
        try {
          localStorage.setItem(key, JSON.stringify({
            theme: state.theme,
            chartOptions: state.chartOptions,
            drawingStyles: state.drawingStyles,
            sessionColors: state.sessionColors,
            sessionTimes: state.sessionTimes,
            sessionEndTimes: state.sessionEndTimes,
            sessionLabelsVisible: state.sessionLabelsVisible,
            chartType: state.chartType,
          }));
        } catch {}
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!symbolWarning) return;
    const t = setTimeout(() => clearSymbolWarning(), 5000);
    return () => clearTimeout(t);
  }, [symbolWarning, clearSymbolWarning]);

  // Keep trade-management confirmations visible long enough to read, then dismiss.
  useEffect(() => {
    if (!tradeNotifications.length) return undefined;
    const timers = tradeNotifications.map(({ id }) =>
      window.setTimeout(() => dismissTradeNotification(id), 5500)
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [tradeNotifications, dismissTradeNotification]);

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
        startWithHistoricalContext(state);
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
        startWithHistoricalContext(useStore.getState());
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
      if (!window.closed) window.alert('Please close this browser tab to exit the application.');
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

      <header className="app-header px-2 py-1 bg-[#131722] border-b border-[#2a2e39] flex-shrink-0 flex items-center gap-4">
        <div className="flex min-w-0 items-center gap-2 flex-shrink-0 justify-self-start">
          <h1 className="flex items-center gap-2 whitespace-nowrap">
            <img
              src={`${import.meta.env.BASE_URL}tradepast-logo.svg?v=3`}
              alt="TradePast"
              className="h-9 w-12 object-contain"
              draggable="false"
            />
            <span className="hidden sm:inline text-sm font-bold tracking-wider"><span className="text-gray-400/45">Trade</span><span className="text-white font-extrabold drop-shadow-[0_0_5px_rgba(255,255,255,0.4)]">Past</span></span>
          </h1>
        </div>

        {gameStarted && <div className="header-main-controls flex min-w-0 flex-1 items-center justify-between gap-4">
          <div className="header-primary-controls flex min-w-0 flex-1 items-center justify-start gap-5"><div className="hidden lg:flex items-center gap-1.5 flex-shrink-0">
            <button onClick={() => setSettingsOpen(true)} className="header-utility-action px-2.5 py-1.5 rounded border border-[#2a2e39] bg-[#1e222d] text-[10px] font-semibold text-gray-200 hover:bg-[#2a2e39] flex items-center gap-1.5">
              <Settings size={12}/> Settings
            </button>
            <button onClick={openHistory} className="header-utility-action px-2.5 py-1.5 rounded border border-[#2a2e39] bg-[#1e222d] text-[10px] font-semibold text-gray-200 hover:bg-[#2a2e39]">History</button>
            <button onClick={openAnalytics} className="header-utility-action px-2.5 py-1.5 rounded border border-[#2a2e39] bg-[#1e222d] text-[10px] font-semibold text-gray-200 hover:bg-[#2a2e39]">Analytics</button>
            <button onClick={() => window.dispatchEvent(new Event('omaxfx:reset-chart'))} className="header-utility-action px-2.5 py-1.5 rounded border border-[#2a2e39] bg-[#1e222d] text-[10px] font-semibold text-gray-200 hover:bg-[#2a2e39]">Reset Chart</button>
          </div>
          <div className="header-chart-tools flex items-center gap-3 flex-shrink-0">
            <span className="h-7 w-px bg-[#343b49]" aria-hidden="true" />
            <label className="header-select-wrap flex items-center gap-1 text-[11px] text-gray-400">
              <select aria-label="Chart timeframe" value={timeframe} onChange={e => setTimeframe(Number(e.target.value))} className="header-select">
                {[{label:"1m",value:1},{label:"5m",value:5},{label:"15m",value:15},{label:"30m",value:30},{label:"1h",value:60},{label:"4h",value:240},{label:"1D",value:1440},{label:"1W",value:10080}].map(tf => <option key={tf.value} value={tf.value}>{tf.label}</option>)}
              </select><ChevronDown size={12}/>
            </label>
            <button type="button" className="header-chart-type" onClick={() => setChartType(chartType === "candle" ? "line" : "candle")} title={`Chart type: ${chartType === "candle" ? "Candles" : "Line"}`} aria-label="Toggle chart type"><CandlestickChart size={18}/></button>
          </div>
          <div className="hidden md:flex items-center gap-1 flex-shrink-0" aria-label="Chart layout">
            {[{ value: 1, label: 'Single chart', Icon: Square }, { value: 2, label: 'Two charts', Icon: Columns2 }, { value: 3, label: 'Three charts', Icon: ThreeChartLayoutIcon }].map(({ value, label, Icon }) => (
              <button key={value} type="button" onClick={() => useStore.getState().setChartLayout(value)} title={label} aria-label={label} aria-pressed={useStore.getState().chartLayout === value}
                className={'flex h-7 w-7 items-center justify-center rounded ' + (useStore.getState().chartLayout === value ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-[#2a2e39]')}>
                <Icon size={14}/>
              </button>
            ))}
          </div>
          </div>
        </div>}
        <div className="header-status-controls flex items-center gap-2 text-[11px] flex-shrink-0 whitespace-nowrap tabular-nums">
          <div className="flex items-baseline gap-1">
            <span className="text-gray-400">Bal:</span>
            <span className="inline-block w-[84px] text-right text-green-400 font-bold tabular-nums">${fmtMoney(balance, 0)}</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-gray-400 hidden sm:inline">PnL:</span>
            <span className={`inline-block w-[104px] text-right font-bold tabular-nums ${unrealisedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              ${fmtMoney(unrealisedPnl)}
            </span>
          </div>
          <button type="button" onClick={() => useStore.getState().openPeriodModal()} className="app-header-action header-action-new-session h-7 px-2 rounded border border-cyan-900/50 bg-[#1e222d] text-cyan-400 hover:bg-cyan-900/30 flex items-center justify-center gap-1" title="New backtest" aria-label="Start a new backtest"><Plus size={14}/><span className="hidden xl:inline text-[10px] font-semibold">New Backtest</span></button>
          <SoundToggle />
          <button onClick={toggleFireworks}
            className={`app-header-action w-7 h-7 border rounded flex items-center justify-center transition-colors ${
              enableFireworks
                ? 'bg-yellow-900/30 border-yellow-600/50 text-yellow-400 hover:bg-yellow-900/50'
                : 'bg-[#1e222d] border-[#2a2e39] text-gray-500 hover:text-gray-300'
            }`}
            title={enableFireworks ? 'Disable Fireworks' : 'Enable Fireworks'}>
            <Sparkles size={13} />
          </button>
          <button onClick={handleExitPlatform} className="app-header-action w-7 h-7 bg-[#1e222d] border border-red-900/50 hover:bg-red-900/40 text-red-400 rounded flex items-center justify-center" title="Exit application">
            <LogOut size={13}/>
          </button>
          <button onClick={openInfo} className="app-header-action header-action-guide w-7 h-7 bg-[#1e222d] border border-[#2a2e39] hover:bg-blue-900/50 rounded flex items-center justify-center" style={{ color: "#3b82f6" }} title="Quick guide">
            <Info size={13} />
          </button>
        </div>
      </header>
      
      <main className="flex-1 relative min-h-0">
        {gameStarted && <ChartWorkspace />}
      </main>
      <TradeScreenshotCapture />

      {tradeNotifications.length > 0 && (
        <div className="fixed top-[68px] right-4 z-[300] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2 pointer-events-none" aria-live="polite" aria-atomic="false">
          {tradeNotifications.map((notification) => {
            const isPartial = notification.type === 'partial';
            const Icon = isPartial ? TrendingUp : CheckCircle2;
            const amount = Number(notification.amount) || 0;
            return (
              <div
                key={notification.id}
                role="status"
                className="pointer-events-auto flex items-start gap-3 rounded-xl border border-emerald-500/40 bg-[#111923]/[.98] px-4 py-3 shadow-2xl shadow-black/50 backdrop-blur-md animate-in slide-in-from-top-2"
              >
                <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                  <Icon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-emerald-300">
                    {isPartial ? 'Partial profit taken' : 'Breakeven set successfully'}
                  </p>
                  {isPartial ? (
                    <p className="mt-1 text-sm font-semibold text-white">
                      {amount < 0 ? '-' : '+'}${fmtMoney(Math.abs(amount))} <span className="font-normal text-gray-300">profit · {Number(notification.closePercent).toLocaleString(undefined, { maximumFractionDigits: 2 })}% of position closed</span>
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-gray-300">Stop loss moved to entry price.</p>
                  )}
                  {notification.symbol && <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-gray-500">{notification.symbol}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => dismissTradeNotification(notification.id)}
                  className="rounded p-1 text-gray-500 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label="Dismiss notification"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      
      <ControlPanel />
      <DataImportModal />

      <OrderModal />
      <HistoryModal />
      <AnalyticsModal />
      <InfoModal />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
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