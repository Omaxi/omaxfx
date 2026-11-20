import { create } from 'zustand';
import { aggregateData, getExecutionCandle } from './utils/timeframe.js';
import { getPnlMultiplier, calculateIntrabarUnrealizedPnl, calculateUnrealizedPnlAtPrice, calculateFavorableIntrabarPnl } from './utils/instrument.js';
import { getPendingOrderFillPrice, getStopLossFillPrice, getTakeProfitFillPrice } from './utils/orderExecution.js';
export { getContractSize, getPnlMultiplier } from './utils/instrument.js';
import { 
  playOrderPlaced, playPositionClosed, playTPHit, playSLHit, playPendingTriggered, playRestart
} from './utils/audio.js';

export const INITIAL_BALANCE = 100000;
const EPSILON = 0.001;
const SESSION_KEY = 'omaxfx-session-v1';
const SESSION_LIST_KEY = 'omaxfx-sessions-v2';

const TZ_OFFSETS = {
  'UTC-5': -300, 'UTC-4': -240, 'UTC-3': -180, 'UTC-2': -120, 'UTC-1': -60,
  'UTC': 0,
  'UTC+1': 60, 'UTC+2': 120, 'UTC+3': 180,
};


const getDayKey = (unixSeconds) => {
  const d = new Date((unixSeconds + 3 * 3600) * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
};


const formatRangeDate = (unixSeconds) => {
  const d = new Date((unixSeconds + 3 * 3600) * 1000);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}.${mm}.${yyyy}`;
};

const checkRuleViolations = (state, newBalance, newPeak, newDailyLoss) => {
  if (state.rules?.propFirmEnabled === false) return null;
  if (state.rules.maxDailyLoss && newDailyLoss.dayStartBalance > 0) {
    const dailyLossAmt = newDailyLoss.dayStartBalance - newBalance;
    const dailyLossPct = dailyLossAmt > 0 ? (dailyLossAmt / newDailyLoss.dayStartBalance) * 100 : 0;
    if (dailyLossPct >= state.rules.maxDailyLoss - EPSILON) {
      return { reason: 'daily_loss', message: `Daily loss limit hit: -${dailyLossPct.toFixed(2)}% (max ${state.rules.maxDailyLoss}%).` };
    }
  }
  if (newPeak > 0) {
    const dd = ((newPeak - newBalance) / newPeak) * 100;
    if (dd >= state.rules.maxDrawdown - EPSILON) {
      return { reason: 'drawdown', message: `Max drawdown hit: -${dd.toFixed(2)}% (max ${state.rules.maxDrawdown}%).` };
    }
  }
  return null;
};

const cloneDrawings = (drawings) => drawings.map(d => ({
  ...d,
  points: d.points.map(p => ({ ...p })),
}));

const DEFAULT_THEME = {
  background: '#131722',
  upBody: '#26a69a',
  downBody: '#ef5350',
  upWick: '#26a69a',
  downWick: '#ef5350',
};
const DEFAULT_SESSION_COLORS = { asia: '#f59e0b', london: '#38bdf8', newyork: '#fb7185' };
const DEFAULT_DRAWING_STYLES = {
  vertical: { color: '#f59e0b', lineWidth: 1 },
  horizontal: { color: '#f59e0b', lineWidth: 1 },
};

const DEFAULT_RULES = {
  startingBalance: INITIAL_BALANCE,
  maxRiskPerTrade: 1,
  maxDailyLoss: 5,
  maxDrawdown: 10,
  propFirmEnabled: true,
  presetName: 'Custom',
};

export const useStore = create((set, get) => ({
  // ============================================================
  // MULTI-SYMBOL DATA CACHE
  // ============================================================
  allRawDataBySymbol: {},
  contractSpecs: {},
  allRawData: [],
  rawData: [],        
  displayData: [],    
  timeframe: 1,
  currentIndex: 0,    
  isPlaying: false,   
  recenterToken: 0,

  symbol: 'XAUUSD',
  timezone: 'UTC+3',

  symbolWarning: null,
  clearSymbolWarning: () => set({ symbolWarning: null }),

  sessionTimes: { asian: 1, london: 11, newyork: 16 },
  sessionColors: { ...DEFAULT_SESSION_COLORS },
  setSessionColor: (key, color) => set((state) => ({
    sessionColors: { ...state.sessionColors, [key]: color },
  })),
  drawingStyles: {
    vertical: { ...DEFAULT_DRAWING_STYLES.vertical },
    horizontal: { ...DEFAULT_DRAWING_STYLES.horizontal },
  },
  setDrawingStyle: (key, patch) => set((state) => ({
    drawingStyles: { ...state.drawingStyles, [key]: { ...state.drawingStyles[key], ...patch } },
    drawings: state.drawings.map(d => d.type === key ? {
      ...d,
      ...(patch.color ? { color: patch.color, borderColor: patch.color } : {}),
      ...(patch.lineWidth != null ? { lineWidth: patch.lineWidth } : {}),
    } : d),
  })),

  setSessionTime: (key, hour) => set((state) => ({
    sessionTimes: { ...state.sessionTimes, [key]: Math.max(0, Math.min(23, Number(hour) || 0)) }
  })),

  setAllData: (data) => set((state) => {
    const symbol = state.symbol;
    return {
      allRawDataBySymbol: { ...state.allRawDataBySymbol, [symbol]: data },
      allRawData: data,
    };
  }),

  setCustomSymbolData: (symbol, data, spec = {}) => set((state) => {
    const code = String(symbol || '').trim().toUpperCase().replace(/[^A-Z0-9._-]/g, '').slice(0, 20);
    if (!code || !Array.isArray(data) || data.length === 0) return state;
    const currentOffset = TZ_OFFSETS[state.timezone || 'UTC+3'] ?? 180;
    const displayShift = (currentOffset - 180) * 60;
    const displayData = displayShift === 0 ? data : data.map(candle => ({ ...candle, time: candle.time + displayShift }));
    const nextCache = { ...state.allRawDataBySymbol, [code]: displayData };
    const contractSpecs = {
      ...state.contractSpecs,
      [code]: {
        contractSize: Number(spec.contractSize) > 0 ? Number(spec.contractSize) : 1,
        tickSize: Number(spec.tickSize) > 0 ? Number(spec.tickSize) : 0.01,
        precision: Number.isInteger(Number(spec.precision)) ? Math.max(0, Math.min(10, Number(spec.precision))) : 2,
        quoteCurrency: String(spec.quoteCurrency || 'USD').toUpperCase(),
        quoteToAccountRate: Number(spec.quoteToAccountRate) > 0 ? Number(spec.quoteToAccountRate) : 1,
      },
    };
    return {
      symbol: code, contractSpecs, allRawDataBySymbol: nextCache, allRawData: displayData,
      rawData: displayData, displayData: aggregateData(displayData, state.timeframe), currentIndex: 0,
      isPlaying: false, gameStarted: false, isPeriodModalOpen: true,
      gamePeriod: null, positions: [], pendingOrders: [], tradeHistory: [],
      drawings: [], drawingsPast: [], drawingsFuture: [], pencilStrokes: [],
      balance: INITIAL_BALANCE, peakBalance: INITIAL_BALANCE,
      gameState: { isOver: false, reason: null, message: '', startTime: null },
      symbolWarning: null, sessionId: null, recenterToken: state.recenterToken + 1,
    };
  }),

  setAllDataForSymbol: (symbol, data) => set((state) => {
    const nextCache = { ...state.allRawDataBySymbol, [symbol]: data };
    if (state.symbol === symbol) {
      return { allRawDataBySymbol: nextCache, allRawData: data };
    }
    return { allRawDataBySymbol: nextCache };
  }),

  setSymbol: (code) => set((state) => {
    if (code === state.symbol) return state;

    const newData = state.allRawDataBySymbol[code];
    if (!newData || newData.length === 0) {
      return { symbolWarning: { code, message: `${code} data is not available` } };
    }

    const oldData = state.rawData;
    const currentCandle = oldData[state.currentIndex];
    const currentTime = currentCandle ? currentCandle.time : null;

    const firstTime = newData[0].time;
    const lastTime = newData[newData.length - 1].time;

    if (currentTime != null && (currentTime < firstTime || currentTime > lastTime)) {
      return {
        symbolWarning: {
          code,
          from: firstTime,
          to: lastTime,
          message: `${code} data range: ${formatRangeDate(firstTime)} - ${formatRangeDate(lastTime)}`,
        },
      };
    }

    let newIndex = 0;
    if (currentTime != null) {
      for (let i = 0; i < newData.length; i++) {
        if (newData[i].time > currentTime) break;
        newIndex = i;
      }
    }

    return {
      symbol: code,
      allRawData: newData,
      rawData: newData,
      displayData: aggregateData(newData, state.timeframe),
      currentIndex: newIndex,
      recenterToken: state.recenterToken + 1,
      symbolWarning: null,
    };
  }),

  setTimezone: (newTz) => set((state) => {
    if (newTz === state.timezone) return state;
    const oldOffset = TZ_OFFSETS[state.timezone] ?? -300;
    const newOffset = TZ_OFFSETS[newTz] ?? -300;
    const shiftSec = (newOffset - oldOffset) * 60;
    if (shiftSec === 0) return { timezone: newTz };
    const shift = (t) => t == null ? t : t + shiftSec;

    const shiftedCache = {};
    for (const [k, arr] of Object.entries(state.allRawDataBySymbol)) {
      shiftedCache[k] = arr.map(c => ({ ...c, time: shift(c.time) }));
    }

    return {
      timezone: newTz,
      allRawDataBySymbol: shiftedCache,
      allRawData: state.allRawData.map(c => ({ ...c, time: shift(c.time) })),
      rawData: state.rawData.map(c => ({ ...c, time: shift(c.time) })),
      displayData: state.displayData.map(c => ({ ...c, time: shift(c.time) })),
      drawings: state.drawings.map(d => ({ ...d, points: d.points.map(p => ({ ...p, time: shift(p.time) })) })),
      drawingsPast: state.drawingsPast.map(group => group.map(d => ({ ...d, points: d.points.map(p => ({ ...p, time: shift(p.time) })) }))),
      drawingsFuture: state.drawingsFuture.map(group => group.map(d => ({ ...d, points: d.points.map(p => ({ ...p, time: shift(p.time) })) }))),
      pencilStrokes: state.pencilStrokes.map(stroke => ({ ...stroke, points: stroke.points.map(p => Number.isFinite(p.time) ? { ...p, time: shift(p.time) } : p) })),
      tradeHistory: state.tradeHistory.map(t => ({ ...t, openTime: shift(t.openTime), closeTime: shift(t.closeTime) })),
      positions: state.positions.map(p => ({ ...p, openTime: shift(p.openTime) })),
      pendingOrders: state.pendingOrders.map(o => ({ ...o, openTime: shift(o.openTime) })),
      gamePeriod: state.gamePeriod ? { from: shift(state.gamePeriod.from), to: shift(state.gamePeriod.to) } : null,
    };
  }),

  gameStarted: false,
  gamePeriod: null,
  isPeriodModalOpen: false,
  openPeriodModal: () => set({ isPeriodModalOpen: true }),
  closePeriodModal: () => set({ isPeriodModalOpen: false }),
  
  sessionId: null,
  sessionName: 'Session 1',
  setSessionName: (name) => set({ sessionName: name }),

  saveSession: () => {
    const s = get();
    if (!s.gameStarted || !s.gamePeriod) return;
    try {
      const sessionId = s.sessionId || (globalThis.crypto?.randomUUID?.() ?? `session-${Date.now()}-${Math.random().toString(36).slice(2,8)}`);
      const payload = {
        version: 2, sessionId, savedAt: Date.now(),
        sessionName: s.sessionName, playerName: s.playerName,
        gamePeriod: s.gamePeriod, rules: { ...s.rules },
        currentIndex: s.currentIndex, timeframe: s.timeframe,
        symbol: s.symbol, contractSpecs: s.contractSpecs, timezone: s.timezone || 'UTC+3', chartType: s.chartType,
        balance: s.balance, peakBalance: s.peakBalance,
        positions: s.positions, tradeHistory: s.tradeHistory,
        pendingOrders: s.pendingOrders, drawings: s.drawings,
        drawingsPast: s.drawingsPast, drawingsFuture: s.drawingsFuture,
        pencilStrokes: s.pencilStrokes, dailyLoss: s.dailyLoss,
        gameState: { isOver: s.gameState.isOver, reason: s.gameState.reason, message: s.gameState.message, startTime: s.gameState.startTime },
        theme: s.theme, sessionTimes: s.sessionTimes,
        sessionColors: s.sessionColors, drawingStyles: s.drawingStyles,
        enableFireworks: s.enableFireworks,
      };
      const sessions = s.readSessions();
      const next = [payload, ...sessions.filter(item => item.sessionId !== sessionId)]
        .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      localStorage.setItem(SESSION_LIST_KEY, JSON.stringify(next));
      localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
      if (s.sessionId !== sessionId) set({ sessionId });
      return true;
    } catch (e) {
      console.warn('Failed to save session:', e);
      return false;
    }
  },

  readSessions: () => {
    try {
      const stored = JSON.parse(localStorage.getItem(SESSION_LIST_KEY) || '[]');
      if (Array.isArray(stored) && stored.length) return stored;
      const legacy = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      return legacy?.gamePeriod ? [{ ...legacy, sessionId: legacy.sessionId || 'legacy-session' }] : [];
    } catch (e) { return []; }
  },

  readSession: (sessionId = null) => {
    const sessions = get().readSessions();
    return sessionId ? sessions.find(item => item.sessionId === sessionId) || null : sessions[0] || null;
  },

  deleteSavedSession: (sessionId) => {
    try {
      const next = get().readSessions().filter(item => item.sessionId !== sessionId);
      localStorage.setItem(SESSION_LIST_KEY, JSON.stringify(next));
      if (next.length === 0) localStorage.removeItem(SESSION_KEY);
      if (get().sessionId === sessionId) set({ sessionId: null });
      return next;
    } catch (e) { return get().readSessions(); }
  },

  clearSession: () => {
    try { localStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_LIST_KEY); } catch (e) {}
  },

  loadSavedSession: (sessionId = null) => {
    const state = get();
    const saved = state.readSession(sessionId);
    if (!saved || !saved.gamePeriod) return false;

    const savedSymbol = saved.symbol || 'XAUUSD';
    const symbolData = state.allRawDataBySymbol[savedSymbol];
    if (!symbolData || symbolData.length === 0) return false;

    // Stored CSV timestamps are normalized to UTC. Sessions saved in a
    // different display offset have their timeline shifted by offset−UTC+3.
    const savedTimezone = saved.timezone || 'UTC+3';
    const savedOffset = TZ_OFFSETS[savedTimezone] ?? 180;
    const currentOffset = TZ_OFFSETS[state.timezone || 'UTC+3'] ?? 180;
    const restoreShift = (savedOffset - currentOffset) * 60;
    const legacySessionTimes = saved.sessionTimes?.asian === 3 && saved.sessionTimes?.london === 10 && saved.sessionTimes?.newyork === 15;
    const restoredSessionTimes = !saved.sessionTimes || legacySessionTimes
      ? { asian: 1, london: 11, newyork: 16 }
      : saved.sessionTimes;
    const restoredData = restoreShift === 0
      ? symbolData
      : symbolData.map(c => ({ ...c, time: c.time + restoreShift }));
    const restoredCache = restoreShift === 0
      ? state.allRawDataBySymbol
      : Object.fromEntries(Object.entries(state.allRawDataBySymbol).map(([code, candles]) => [
          code,
          code === savedSymbol ? restoredData : candles.map(candle => ({ ...candle, time: candle.time + restoreShift })),
        ]));
    const filtered = restoredData.filter(c => c.time >= saved.gamePeriod.from && c.time <= saved.gamePeriod.to);
    if (filtered.length === 0) return false;

    // Guard against a saved session that was already at the last candle:
    // rewind one step so stepForward has room to advance.
    const savedIndex = Math.min(saved.currentIndex || 0, filtered.length - 1);
    const safeIndex = filtered.length > 1 ? Math.min(savedIndex, filtered.length - 2) : 0;

    const tf = saved.timeframe || 1;
    set({
      symbol: savedSymbol,
      allRawDataBySymbol: restoredCache,
      allRawData: restoredData,
      rawData: filtered,
      displayData: aggregateData(filtered, tf),
      gameStarted: true,
      isPeriodModalOpen: false,
      gamePeriod: saved.gamePeriod,
      rules: { ...DEFAULT_RULES, ...(saved.rules || {}), propFirmEnabled: saved.rules?.propFirmEnabled !== false },
      currentIndex: safeIndex,
      timeframe: tf,
      timezone: savedTimezone,
      contractSpecs: saved.contractSpecs || state.contractSpecs,
      chartType: saved.chartType || 'candle',
      balance: saved.balance ?? INITIAL_BALANCE,
      peakBalance: saved.peakBalance ?? INITIAL_BALANCE,
      positions: saved.positions || [],
      tradeHistory: saved.tradeHistory || [],
      pendingOrders: saved.pendingOrders || [],
      drawings: saved.drawings || [],
      drawingsPast: saved.drawingsPast || [],
      drawingsFuture: saved.drawingsFuture || [],
      dailyLoss: saved.dailyLoss || { day: null, dayStartBalance: INITIAL_BALANCE },
      gameState: { isOver: saved.gameState?.isOver ?? false, reason: saved.gameState?.reason ?? null, message: saved.gameState?.message ?? '', startTime: saved.gameState?.startTime ?? null },
      pencilStrokes: saved.pencilStrokes || [],
      playerName: saved.playerName || 'Trader',
      sessionId: saved.sessionId || 'legacy-session',
      sessionName: saved.sessionName || 'Session 1',
      theme: saved.theme || DEFAULT_THEME,
      sessionTimes: restoredSessionTimes,
      sessionColors: { ...DEFAULT_SESSION_COLORS, ...(saved.sessionColors || {}) },
      drawingStyles: {
        vertical: { ...DEFAULT_DRAWING_STYLES.vertical, ...(saved.drawingStyles?.vertical || {}) },
        horizontal: { ...DEFAULT_DRAWING_STYLES.horizontal, ...(saved.drawingStyles?.horizontal || {}) },
      },
      enableFireworks: saved.enableFireworks ?? true,
      recenterToken: state.recenterToken + 1,
    });
    return true;
  },

  playerName: 'Trader',
  setPlayerName: (name) => set({ playerName: name }),

  loadingState: { isActive: true, loaded: 0, total: 0, error: null },
  setLoadingState: (patch) => set((state) => ({ loadingState: { ...state.loadingState, ...patch } })),

  rules: { ...DEFAULT_RULES },

  gameState: { isOver: false, reason: null, message: '', startTime: null },

  peakBalance: INITIAL_BALANCE,
  dailyLoss: { day: null, dayStartBalance: INITIAL_BALANCE },
  
  balance: INITIAL_BALANCE,
  positions: [],
  tradeHistory: [],
  pendingOrders: [],

  isOrderModalOpen: false,
  isHistoryOpen: false,
  isEquityOpen: false,
  isInfoOpen: false,
  isAnalyticsOpen: false,
  isThemeOpen: false,
  orderSide: 'buy',

  isDrawingMode: false,
  drawingSide: null,
  drawingStep: null,
  draftPosition: null,

  // ============================================================
  // DRAWINGS
  // ============================================================
  drawings: [],
  drawingsPast: [],
  drawingsFuture: [],
  activeDrawingTool: null,

  setActiveDrawingTool: (tool) => set((state) => {
    if (state.isPencilMode) return state;
    return { 
      activeDrawingTool: state.activeDrawingTool === tool ? null : tool,
    };
  }),

  snapshotDrawings: () => set((state) => ({
    drawingsPast: [...state.drawingsPast.slice(-40), cloneDrawings(state.drawings)],
    drawingsFuture: [],
  })),

  undoDrawings: () => set((state) => {
    if (state.drawingsPast.length === 0) return state;
    const prev = state.drawingsPast[state.drawingsPast.length - 1];
    return {
      drawingsPast: state.drawingsPast.slice(0, -1),
      drawingsFuture: [cloneDrawings(state.drawings), ...state.drawingsFuture.slice(0, 40)],
      drawings: prev,
    };
  }),

  redoDrawings: () => set((state) => {
    if (state.drawingsFuture.length === 0) return state;
    const next = state.drawingsFuture[0];
    return {
      drawingsPast: [...state.drawingsPast.slice(-40), cloneDrawings(state.drawings)],
      drawingsFuture: state.drawingsFuture.slice(1),
      drawings: next,
    };
  }),

  addDrawing: (drawing) => set((state) => {
    const newDrawing = { 
      ...drawing, 
      id: Date.now() + Math.random(),
      color: drawing.color || '#f59e0b',
      borderColor: drawing.borderColor || drawing.color || '#f59e0b',
      fillColor: drawing.fillColor || '#f59e0b33',
      lineWidth: drawing.lineWidth ?? state.drawingStyles?.[drawing.type]?.lineWidth ?? 1,
      ...(drawing.type === 'vertical' || drawing.type === 'horizontal'
        ? { color: state.drawingStyles?.[drawing.type]?.color || drawing.color || '#f59e0b',
            borderColor: state.drawingStyles?.[drawing.type]?.color || drawing.borderColor || drawing.color || '#f59e0b' }
        : {}),
      showBorder: drawing.showBorder === true,
      symbol: state.symbol,
      timeframe: state.timeframe,
    };
    return {
      drawingsPast: [...state.drawingsPast.slice(-40), cloneDrawings(state.drawings)],
      drawingsFuture: [],
      drawings: [...state.drawings, newDrawing],
    };
  }),

  updateDrawing: (id, patch) => set((state) => ({
    drawings: state.drawings.map(d => {
      if (d.id !== id) return d;
      if (Array.isArray(patch)) return { ...d, points: patch };
      return { ...d, ...patch };
    })
  })),

  clearDrawings: () => set((state) => ({
    drawingsPast: [...state.drawingsPast.slice(-40), cloneDrawings(state.drawings)],
    drawingsFuture: [],
    drawings: [],
    activeDrawingTool: null,
  })),

  removeDrawing: (id) => set((state) => ({
    drawingsPast: [...state.drawingsPast.slice(-40), cloneDrawings(state.drawings)],
    drawingsFuture: [],
    drawings: state.drawings.filter(d => d.id !== id),
  })),

  // ============================================================
  // PENCIL MODE
  // ============================================================
  isPencilMode: false,
  pencilColor: '#3b82f6',
  pencilStrokes: [],

  setPencilMode: (active) => set((state) => ({
    isPencilMode: active,
    pencilStrokes: [],
    activeDrawingTool: active ? null : state.activeDrawingTool,
  })),

  setPencilColor: (c) => set({ pencilColor: c }),

  addPencilStroke: (stroke) => set((state) => ({
    pencilStrokes: [...state.pencilStrokes, { ...stroke, id: Date.now() + Math.random() }]
  })),

  clearPencil: () => set({ pencilStrokes: [] }),

  // ============================================================
  // CHART TYPE & SETTINGS
  // ============================================================
  chartType: 'candle',
  setChartType: (t) => set({ chartType: t }),

  enableFireworks: true,
  toggleFireworks: () => set((state) => ({ enableFireworks: !state.enableFireworks })),

  theme: { ...DEFAULT_THEME },
  setTheme: (patch) => set((state) => ({ theme: { ...state.theme, ...patch } })),
  resetTheme: () => set({ theme: { ...DEFAULT_THEME } }),

  soundEnabled: true,
  musicEnabled: true,
  toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),
  toggleMusic: () => set((state) => ({ musicEnabled: !state.musicEnabled })),

  // =========================================================================
  // START GAME
  // - Refuses to start if data isn't loaded or the period contains no candles
  // - Prevents the "instant period_end" bug that showed the GameOver modal
  //   immediately after starting a session.
  // =========================================================================
  startGame: (from, to, rules) => set((state) => {
    const symbolData = state.allRawDataBySymbol[state.symbol] || state.allRawData;

    if (!symbolData || symbolData.length === 0) {
      console.warn('[startGame] no data loaded for symbol:', state.symbol);
      return state;
    }

    const filtered = symbolData.filter(c => c.time >= from && c.time <= to);

    if (filtered.length < 2) {
      console.warn(`[startGame] period contains ${filtered.length} candle(s); need >= 2. From=${from} To=${to}`);
      return state;
    }

    const startBal = rules.startingBalance;
    const startDay = filtered[0] ? getDayKey(filtered[0].time) : null;
    return {
      rawData: filtered,
      displayData: aggregateData(filtered, state.timeframe),
      gamePeriod: { from, to },
      gameStarted: true,
      isPeriodModalOpen: false,
      rules: { ...rules, propFirmEnabled: rules.propFirmEnabled !== false },
      sessionId: null,
      currentIndex: 0,
      isPlaying: false,
      balance: startBal,
      positions: [],
      tradeHistory: [],
      pendingOrders: [],
      draftPosition: null,
      isDrawingMode: false,
      drawings: [],
      drawingsPast: [],
      drawingsFuture: [],
      activeDrawingTool: null,
      isPencilMode: false,
      pencilStrokes: [],
      peakBalance: startBal,
      dailyLoss: { day: startDay, dayStartBalance: startBal },
      gameState: { isOver: false, reason: null, message: '', startTime: Date.now() },
      recenterToken: state.recenterToken + 1,
    };
  }),

  endGame: (reason, message) => set((state) => ({
    isPlaying: false,
    gameState: { ...state.gameState, isOver: true, reason, message },
  })),

  restartGame: () => {
    const state = get();
    if (state.soundEnabled) playRestart();
    set({
      gameStarted: false,
      isPeriodModalOpen: true,
      gameState: { isOver: false, reason: null, message: '', startTime: null },
      currentIndex: 0,
      isPlaying: false,
      positions: [],
      tradeHistory: [],
      pendingOrders: [],
      draftPosition: null,
      isDrawingMode: false,
      drawings: [],
      drawingsPast: [],
      drawingsFuture: [],
      activeDrawingTool: null,
      isPencilMode: false,
      pencilStrokes: [],
    });
  },

  setTimeframe: (newTimeframe) => set((state) => {
    const nextTimeframe = Number(newTimeframe);
    if (!Number.isFinite(nextTimeframe) || nextTimeframe <= 0 || nextTimeframe === state.timeframe) return state;
    // At 1m, currentIndex is the last completed raw candle. At higher timeframes,
    // it is the next raw candle at the replay boundary. Preserve that boundary
    // when switching views instead of exposing an unfinished lower-timeframe bar.
    let currentIndex = state.currentIndex;
    if (state.timeframe === 1 && nextTimeframe > 1) {
      currentIndex = Math.min(Math.max(0, state.rawData.length - 1), currentIndex + 1);
    } else if (state.timeframe > 1 && nextTimeframe === 1) {
      currentIndex = Math.max(0, currentIndex - 1);
    }
    return {
      timeframe: nextTimeframe,
      currentIndex,
      displayData: aggregateData(state.rawData, nextTimeframe),
      drawings: state.drawings,
    };
  }),

  jumpToSession: (session) => set((state) => {
    if (state.rawData.length === 0) return state;
    const targetHour = state.sessionTimes[session];
    if (targetHour == null) return state;
    
    const maxScan = Math.min(state.rawData.length, state.currentIndex + 5000);
    let targetIndex = -1;
    
    for (let i = state.currentIndex + 1; i < maxScan; i++) {
      // Stored candle epochs are UTC; add the configured UTC+3 market offset once.
      const d = new Date((state.rawData[i].time + 3 * 3600) * 1000);
      if (d.getUTCHours() === targetHour && d.getUTCMinutes() === 0) {
        targetIndex = i;
        break;
      }
    }
    
    if (targetIndex === -1) return state;
    return { 
      currentIndex: targetIndex, 
      isPlaying: false,
      recenterToken: state.recenterToken + 1,
    };
  }),

  startDrawing: (side) => set({ 
    isDrawingMode: true, drawingSide: side, drawingStep: 'entry',
    draftPosition: { type: side, entry: null, sl: null, tp: null }
  }),
  
  setDraftPrice: (price) => set((state) => {
    if (!state.draftPosition) return state;
    const draft = { ...state.draftPosition };
    if (state.drawingStep === 'entry') { draft.entry = price; return { draftPosition: draft, drawingStep: 'sl' }; }
    else if (state.drawingStep === 'sl') { draft.sl = price; return { draftPosition: draft, drawingStep: 'tp' }; }
    else if (state.drawingStep === 'tp') { draft.tp = price; return { draftPosition: draft, drawingStep: null, isDrawingMode: false }; }
    return state;
  }),

  clearDraft: () => set({ draftPosition: null, isDrawingMode: false, drawingStep: null }),

  openOrderModal: (side) => set({ isOrderModalOpen: true, orderSide: side }),
  closeOrderModal: () => set({ isOrderModalOpen: false }),
  openHistory: () => set({ isHistoryOpen: true }),
  closeHistory: () => set({ isHistoryOpen: false }),
  openEquity: () => set({ isEquityOpen: true }),
  closeEquity: () => set({ isEquityOpen: false }),
  openInfo: () => set({ isInfoOpen: true }),
  closeInfo: () => set({ isInfoOpen: false }),
  openAnalytics: () => set({ isAnalyticsOpen: true }),
  closeAnalytics: () => set({ isAnalyticsOpen: false }),
  openTheme: () => set({ isThemeOpen: true }),
  closeTheme: () => set({ isThemeOpen: false }),

  cancelPendingOrder: (orderId) => set((state) => ({
    pendingOrders: state.pendingOrders.filter(o => o.id !== orderId)
  })),

  updatePositionSl: (id, price) => set((state) => {
    const pos = state.positions.find(p => p.id === id);
    if (!pos || !state.rawData[state.currentIndex]) return state;
    const currentPrice = state.rawData[state.currentIndex].close;
    const p = Number(price);
    const isBuy = pos.type === 'buy';
    if (isBuy) { if (p >= currentPrice) return state; }
    else { if (p <= currentPrice) return state; }
    return { positions: state.positions.map(pos => pos.id === id ? { ...pos, sl: p } : pos) };
  }),

  updatePositionTp: (id, price) => set((state) => {
    const pos = state.positions.find(p => p.id === id);
    if (!pos || !state.rawData[state.currentIndex]) return state;
    const currentPrice = state.rawData[state.currentIndex].close;
    const p = Number(price);
    const isBuy = pos.type === 'buy';
    if (isBuy) { if (p <= currentPrice) return state; }
    else { if (p >= currentPrice) return state; }
    return { positions: state.positions.map(pos => pos.id === id ? { ...pos, tp: p } : pos) };
  }),

  updatePendingOrder: (orderId, field, price) => set((state) => {
    const order = state.pendingOrders.find(o => o.id === orderId);
    if (!order) return state;
    const p = Number(price);
    const isBuy = order.type === 'buy';
    const newEntry = field === 'entry' ? p : order.entryPrice;
    const newSl = field === 'sl' ? p : order.sl;
    const newTp = field === 'tp' ? p : order.tp;
    if (isBuy) {
      if (newSl != null && newSl >= newEntry) return state;
      if (newTp != null && newTp <= newEntry) return state;
    } else {
      if (newSl != null && newSl <= newEntry) return state;
      if (newTp != null && newTp >= newEntry) return state;
    }
    return {
      pendingOrders: state.pendingOrders.map(o => 
        o.id === orderId ? { ...o, [field === 'entry' ? 'entryPrice' : field]: p } : o
      )
    };
  }),

  closePosition: (id) => set((state) => {
    const pos = state.positions.find(p => p.id === id);
    if (!pos || !state.rawData[state.currentIndex]) return state;
    const currentCandle = getExecutionCandle(state.rawData, state.displayData, state.currentIndex, state.timeframe) || state.rawData[state.currentIndex];
    const exitPrice = currentCandle.close;
    const isBuy = pos.type === 'buy';
    const priceDiff = isBuy ? exitPrice - pos.entryPrice : pos.entryPrice - exitPrice;
    const contractSize = getPnlMultiplier(pos.symbol || state.symbol, state.contractSpecs);
    const pnl = priceDiff * contractSize * pos.size;
    if (state.soundEnabled) playPositionClosed();
    const newBalance = state.balance + pnl;
    const newPeak = Math.max(state.peakBalance, newBalance);
    const violation = checkRuleViolations(state, newBalance, newPeak, state.dailyLoss);
    const newGameState = violation
      ? { ...state.gameState, isOver: true, reason: violation.reason, message: violation.message }
      : state.gameState;
    return {
      balance: newBalance,
      peakBalance: newPeak,
      positions: state.positions.filter(p => p.id !== id),
      tradeHistory: [...state.tradeHistory, { ...pos, exitPrice, pnl, reason: 'MANUAL', closeTime: currentCandle.time }],
      gameState: newGameState,
      isPlaying: newGameState.isOver ? false : state.isPlaying,
    };
  }),

  closeAllPositions: () => set((state) => {
    if (state.positions.length === 0 || !state.rawData[state.currentIndex]) return state;
    const currentCandle = getExecutionCandle(state.rawData, state.displayData, state.currentIndex, state.timeframe) || state.rawData[state.currentIndex];
    const exitPrice = currentCandle.close;
    let newBalance = state.balance;
    const newHistory = [...state.tradeHistory];
    state.positions.forEach(pos => {
      const isBuy = pos.type === 'buy';
      const priceDiff = isBuy ? exitPrice - pos.entryPrice : pos.entryPrice - exitPrice;
      const contractSize = getPnlMultiplier(pos.symbol || state.symbol, state.contractSpecs);
      const pnl = priceDiff * contractSize * pos.size;
      newBalance += pnl;
      newHistory.push({ ...pos, exitPrice, pnl, reason: 'MANUAL', closeTime: currentCandle.time });
    });
    if (state.soundEnabled) playPositionClosed();
    const newPeak = Math.max(state.peakBalance, newBalance);
    const violation = checkRuleViolations(state, newBalance, newPeak, state.dailyLoss);
    const newGameState = violation
      ? { ...state.gameState, isOver: true, reason: violation.reason, message: violation.message }
      : state.gameState;
    return { 
      balance: newBalance, 
      peakBalance: newPeak,
      positions: [], 
      tradeHistory: newHistory,
      gameState: newGameState,
      isPlaying: newGameState.isOver ? false : state.isPlaying,
    };
  }),

  // =========================================================================
  // STEP FORWARD
  // -------------------------------------------------------------------------
  // Guards added to prevent the "instant period_end" bug:
  //   1. Bail if the game hasn't started yet
  //   2. Bail if rawData is empty
  //   3. Bail if already at the last candle (do nothing)
  //   4. Only fire 'period_end' if we actually consumed new candles
  // =========================================================================
  stepForward: () => set((state) => {
    if (state.gameState.isOver) return state;
    if (!state.gameStarted) return state;
    if (state.rawData.length === 0) return state;

    // Already at the last candle — nothing to advance to.
    if (state.currentIndex >= state.rawData.length - 1) return state;

    const jumpSize = state.timeframe;
    const nextBoundary = jumpSize > 1
      ? (Math.floor(state.currentIndex / jumpSize) + 1) * jumpSize
      : state.currentIndex + 1;
    const nextIndex = Math.min(nextBoundary, state.rawData.length - 1);
    const advanced = nextIndex > state.currentIndex;
    const firstProcessedIndex = jumpSize > 1 ? state.currentIndex : nextIndex;
    const lastProcessedIndex = jumpSize > 1 && nextBoundary <= state.rawData.length - 1
      ? nextBoundary - 1
      : nextIndex;

    let newBalance = state.balance;
    let newPositions = [...state.positions];
    let newHistory = [...state.tradeHistory];
    let newPendingOrders = [...state.pendingOrders];
    let newPeak = state.peakBalance;
    let newDailyLoss = { ...state.dailyLoss };
    let tpHit = false, slHit = false, pendingTriggered = false;
    let gameOverReason = null, gameOverMessage = '';
    let lastEquity = state.balance;

    for (let i = firstProcessedIndex; i <= lastProcessedIndex; i++) {
      const candle = state.rawData[i];
      if (!candle) break;
      const dayKey = getDayKey(candle.time);
      if (newDailyLoss.day !== dayKey) {
        newDailyLoss = {
          day: dayKey,
          dayStartBalance: newBalance + calculateUnrealizedPnlAtPrice(newPositions, candle.open, state.symbol, state.contractSpecs),
        };
      }
      const stillOpen = [];
      for (const pos of newPositions) {
        const isBuy = pos.type === 'buy';
        let closed = false;
        if (pos.sl != null) {
          const hitSl = isBuy ? candle.low <= pos.sl : candle.high >= pos.sl;
          if (hitSl) {
            const contractSize = getPnlMultiplier(pos.symbol || state.symbol, state.contractSpecs);
            const exitPrice = getStopLossFillPrice(pos.type, pos.sl, candle);
            const pnl = (isBuy ? exitPrice - pos.entryPrice : pos.entryPrice - exitPrice) * contractSize * pos.size;
            newBalance += pnl;
            newHistory.push({ ...pos, exitPrice, pnl, reason: 'SL', closeTime: candle.time });
            closed = true; slHit = true;
          }
        }
        if (!closed && pos.tp != null) {
          const hitTp = isBuy ? candle.high >= pos.tp : candle.low <= pos.tp;
          if (hitTp) {
            const contractSize = getPnlMultiplier(pos.symbol || state.symbol, state.contractSpecs);
            const exitPrice = getTakeProfitFillPrice(pos.type, pos.tp, candle);
            const pnl = (isBuy ? exitPrice - pos.entryPrice : pos.entryPrice - exitPrice) * contractSize * pos.size;
            newBalance += pnl;
            newHistory.push({ ...pos, exitPrice, pnl, reason: 'TP', closeTime: candle.time });
            closed = true; tpHit = true;
          }
        }
        // Conservative intrabar handling: test the original SL/TP first. If neither
        // was hit, arm breakeven for the next candle after price reaches +1R.
        let updatedPosition = pos;
        if (!closed && pos.breakevenEnabled && !pos.breakevenDone && pos.sl != null) {
          const initialRisk = pos.initialRiskDistance ?? Math.abs(pos.entryPrice - pos.sl);
          const oneRPrice = isBuy ? pos.entryPrice + initialRisk : pos.entryPrice - initialRisk;
          const reachedOneR = isBuy ? candle.high >= oneRPrice : candle.low <= oneRPrice;
          if (initialRisk > 0 && reachedOneR) {
            updatedPosition = { ...pos, sl: pos.entryPrice, breakevenDone: true };
          }
        }
        if (!closed) stillOpen.push(updatedPosition);
      }
      newPositions = stillOpen;
      const equity = newBalance + calculateIntrabarUnrealizedPnl(newPositions, candle, state.symbol, state.contractSpecs);
      const favorableEquity = newBalance + calculateFavorableIntrabarPnl(newPositions, candle, state.symbol, state.contractSpecs);
      newPeak = Math.max(newPeak, favorableEquity);
      lastEquity = equity;
      if (!gameOverReason) {
        const violation = checkRuleViolations(state, equity, newPeak, newDailyLoss);
        if (violation) { gameOverReason = violation.reason; gameOverMessage = violation.message; }
      }
      const stillPending = [];
      let pendingSlotTaken = newPositions.length > 0;
      let pendingFilledThisCandle = false;
      for (const order of newPendingOrders) {
        if (pendingSlotTaken) continue;
        if (gameOverReason) { stillPending.push(order); continue; }
        const fillPrice = getPendingOrderFillPrice(order, candle);
        if (fillPrice != null) {
          const riskDistance = Math.abs(fillPrice - Number(order.sl));
          const contractSize = Number(getPnlMultiplier(order.symbol || state.symbol, state.contractSpecs));
          if (!Number.isFinite(riskDistance) || riskDistance <= 0 ||
              !Number.isFinite(contractSize) || contractSize <= 0) {
            stillPending.push(order);
            continue;
          }
          const rawLots = Number(order.riskAmount) > 0
            ? Number(order.riskAmount) / (riskDistance * contractSize)
            : Number(order.size);
          const recalculatedLots = Math.floor(rawLots * 10000) / 10000;
          // Never create a zero-sized position after a large gap through a stop.
          if (!Number.isFinite(recalculatedLots) || recalculatedLots <= 0) {
            stillPending.push(order);
            continue;
          }
          // A single active trade is enforced even for legacy sessions that
          // may contain more than one pending order.
          const filledPosition = {
            ...order,
            entryPrice: fillPrice,
            size: recalculatedLots,
            riskAmount: riskDistance * contractSize * recalculatedLots,
            riskPercent: state.balance > 0 ? (riskDistance * contractSize * recalculatedLots / state.balance) * 100 : 0,
            initialRiskDistance: riskDistance,
            isPending: false,
            openTime: candle.time,
          };
          const isBuy = order.type === 'buy';
          const stopPrice = Number(order.sl);
          const targetPrice = order.tp == null ? null : Number(order.tp);
          const hitStopOnEntryBar = Number.isFinite(stopPrice) &&
            (isBuy ? candle.low <= stopPrice : candle.high >= stopPrice);
          const hitTargetOnEntryBar = Number.isFinite(targetPrice) &&
            (isBuy ? candle.high >= targetPrice : candle.low <= targetPrice);

          // If OHLC cannot reveal whether SL or TP came first, resolve
          // conservatively: stop loss wins when both are touched in this bar.
          if (hitStopOnEntryBar) {
            const exitPrice = getStopLossFillPrice(order.type, stopPrice, candle);
            const pnl = (isBuy ? exitPrice - fillPrice : fillPrice - exitPrice) *
              contractSize * recalculatedLots;
            newBalance += pnl;
            newHistory.push({ ...filledPosition, exitPrice, pnl, reason: 'SL', closeTime: candle.time });
            slHit = true;
          } else if (hitTargetOnEntryBar) {
            const exitPrice = getTakeProfitFillPrice(order.type, targetPrice, candle);
            const pnl = (isBuy ? exitPrice - fillPrice : fillPrice - exitPrice) *
              contractSize * recalculatedLots;
            newBalance += pnl;
            newHistory.push({ ...filledPosition, exitPrice, pnl, reason: 'TP', closeTime: candle.time });
            tpHit = true;
          } else {
            newPositions.push(filledPosition);
          }
          pendingTriggered = true;
          pendingFilledThisCandle = true;
          pendingSlotTaken = true;
        } else stillPending.push(order);
      }
      newPendingOrders = stillPending;
      // A just-filled pending position is not marked against the entire entry
      // candle's extremes (those may have occurred before the entry).
      lastEquity = pendingFilledThisCandle && newPositions.length
        ? newBalance
        : newBalance + calculateIntrabarUnrealizedPnl(newPositions, candle, state.symbol, state.contractSpecs);
      newPeak = Math.max(newPeak, lastEquity, newBalance);
      if (gameOverReason) break;
    }

    if (state.soundEnabled) {
      if (tpHit) playTPHit();
      if (slHit) playSLHit();
      if (pendingTriggered) playPendingTriggered();
    }

    if (!gameOverReason) {
      const violation = checkRuleViolations(state, lastEquity, newPeak, newDailyLoss);
      if (violation) { gameOverReason = violation.reason; gameOverMessage = violation.message; }
    }

    const atEnd = nextIndex >= state.rawData.length - 1;
    if (!gameOverReason && atEnd && advanced) {
      gameOverReason = 'period_end';
      gameOverMessage = 'You reached the end of the session period.';
    }

    const newGameState = gameOverReason
      ? { ...state.gameState, isOver: true, reason: gameOverReason, message: gameOverMessage }
      : state.gameState;

    return { 
      currentIndex: nextIndex, 
      balance: newBalance, 
      positions: newPositions, 
      tradeHistory: newHistory, 
      pendingOrders: newPendingOrders,
      peakBalance: newPeak,
      dailyLoss: newDailyLoss,
      gameState: newGameState,
      isPlaying: gameOverReason ? false : state.isPlaying,
    };
  }),
  
  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),

  placeOrder: ({ side, type, riskPercent, entryPrice, slPrice, tpPrice, riskAmount, breakevenEnabled = false }) => set((state) => {
    const candle = state.rawData?.[state.currentIndex];
    if (state.gameState.isOver || !candle || !['buy', 'sell'].includes(side) ||
        !['market', 'limit', 'stop'].includes(type)) return state;
    // Only one live position OR one pending order is allowed at a time.
    if (state.positions.length > 0 || state.pendingOrders.length > 0) return state;
    const executionCandle = getExecutionCandle(
      state.rawData, state.displayData, state.currentIndex, state.timeframe
    );
    if (!executionCandle) return state;

    const marketPrice = Number(executionCandle.close);
    const actualEntry = type === 'market' ? marketPrice : Number(entryPrice);
    const stop = Number(slPrice);
    const riskPct = Number(riskPercent);
    const risk = Number(riskAmount);
    const target = tpPrice == null ? null : Number(tpPrice);
    if (![marketPrice, actualEntry, stop, riskPct, risk].every(Number.isFinite) ||
        actualEntry <= 0 || stop <= 0 || actualEntry === stop || riskPct <= 0 || risk <= 0) return state;
    if (side === 'buy' ? stop >= actualEntry : stop <= actualEntry) return state;
    if (target != null && (!Number.isFinite(target) || target <= 0 ||
        (side === 'buy' ? target <= actualEntry : target >= actualEntry))) return state;
    if (state.rules?.propFirmEnabled !== false &&
        riskPct > Number(state.rules?.maxRiskPerTrade ?? 0) + EPSILON) return state;

    const contractSize = Number(getPnlMultiplier(state.symbol, state.contractSpecs));
    const riskDistance = Math.abs(actualEntry - stop);
    if (!Number.isFinite(contractSize) || contractSize <= 0 || riskDistance <= 0) return state;
    const lots = risk / (riskDistance * contractSize);
    // Round down to the volume step so execution never exceeds requested risk.
    const roundedLots = Math.floor(lots * 10000) / 10000;
    if (!Number.isFinite(lots) || lots <= 0 || !Number.isFinite(roundedLots) || roundedLots <= 0) return state;
    const actualRisk = riskDistance * contractSize * roundedLots;
    const actualRiskPercent = state.balance > 0 ? actualRisk / state.balance * 100 : 0;

    const newOrder = {
      id: Date.now() + Math.random(),
      type: side, orderType: type,
      entryPrice: actualEntry,
      sl: stop, tp: target,
      breakevenEnabled: !!breakevenEnabled,
      breakevenDone: false,
      initialRiskDistance: riskDistance,
      size: roundedLots,
      riskPercent: actualRiskPercent, riskAmount: actualRisk,
      isPending: type !== 'market',
      openTime: executionCandle.time,
      symbol: state.symbol,
    };
    if (state.soundEnabled) playOrderPlaced();
    if (type === 'market') {
      return { positions: [...state.positions, newOrder], isOrderModalOpen: false, draftPosition: null };
    }
    return { pendingOrders: [...state.pendingOrders, newOrder], isOrderModalOpen: false, draftPosition: null };
  }),
}));