import { create } from 'zustand';
import { aggregateData, getTimeframeBucketStart } from './utils/timeframe.js';
import { getPnlMultiplier, calculateIntrabarUnrealizedPnl, calculateUnrealizedPnlAtPrice, calculateFavorableIntrabarPnl } from './utils/instrument.js';
import { getPendingOrderFillPrice, getStopLossFillPrice, getTakeProfitFillPrice } from './utils/orderExecution.js';
export { getContractSize, getPnlMultiplier } from './utils/instrument.js';
import { 
  playOrderPlaced, playPositionClosed, playTPHit, playSLHit, playPendingTriggered, playRestart
} from './utils/audio.js';

export const INITIAL_BALANCE = 100000;
const EPSILON = 0.001;

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

const cloneDrawings = (drawings = []) => (drawings || []).map(d => ({
  ...d,
  points: (d.points || []).map(p => ({ ...p })),
}));

const cloneTradeDrawingSnapshot = (state) => ({
  drawings: cloneDrawings(state.drawings),
  chartDrawings: Object.fromEntries(Object.entries(state.chartDrawings || {}).map(([chartId, items]) => [chartId, cloneDrawings(items)])),
  pencilStrokes: (state.pencilStrokes || []).map(stroke => ({
    ...stroke,
    points: (stroke.points || []).map(point => ({ ...point })),
  })),
});

const shiftTradeDrawingSnapshot = (snapshot, shift) => {
  if (!snapshot) return snapshot;
  const shiftItems = items => (items || []).map(item => ({
    ...item,
    points: (item.points || []).map(point => ({
      ...point,
      ...(Number.isFinite(Number(point.time)) ? { time: shift(point.time) } : {}),
    })),
  }));
  return {
    ...snapshot,
    drawings: shiftItems(snapshot.drawings),
    chartDrawings: Object.fromEntries(Object.entries(snapshot.chartDrawings || {}).map(([chartId, items]) => [chartId, shiftItems(items)])),
    pencilStrokes: shiftItems(snapshot.pencilStrokes),
  };
};

const DEFAULT_THEME = {
  background: '#131722',
  upBody: '#26a69a',
  downBody: '#ef5350',
  upWick: '#26a69a',
  downWick: '#ef5350',
};
const DEFAULT_SESSION_COLORS = { asia: '#f59e0b', london: '#38bdf8', newyork: '#fb7185' };
const DEFAULT_DRAWING_STYLES = {
  vertical: { color: '#3b82f6', lineWidth: 1 },
  horizontal: { color: '#3b82f6', lineWidth: 1 },
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
  chartLayout: 1,
  setChartLayout: (layout) => set({ chartLayout: [1, 2, 3].includes(Number(layout)) ? Number(layout) : 1 }),
  currentIndex: 0,    
  isPlaying: false,
  replaySpeed: 1,
  setReplaySpeed: (speed) => set({ replaySpeed: [1, 5, 10, 50, 100, 500].includes(Number(speed)) ? Number(speed) : 1 }),
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
        tickSize: Number(spec.tickSize) > 0 ? Number(spec.tickSize) : 0.00001,
        precision: Number.isInteger(Number(spec.precision)) ? Math.max(0, Math.min(10, Number(spec.precision))) : 5,
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
      tradeHistory: state.tradeHistory.map(t => ({
        ...t,
        openTime: shift(t.openTime),
        closeTime: shift(t.closeTime),
        ...(t.drawingSnapshot ? { drawingSnapshot: shiftTradeDrawingSnapshot(t.drawingSnapshot, shift) } : {}),
      })),
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
  analyticsSnapshot: null,
  isPreviousSessionsOpen: false,
  openPreviousSessions: () => set({ isPreviousSessionsOpen: true }),
  closePreviousSessions: () => set({ isPreviousSessionsOpen: false }),
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
  // Mini-chart drawings are isolated by pane ID and survive layout switches.
  chartDrawings: {},
  setChartDrawings: (chartId, drawings) => set(state => ({ chartDrawings: { ...(state.chartDrawings || {}), [chartId]: drawings } })),
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
      color: drawing.color || '#3b82f6',
      borderColor: drawing.borderColor || drawing.color || '#3b82f6',
      fillColor: drawing.fillColor || '#3b82f633',
      lineWidth: drawing.lineWidth ?? state.drawingStyles?.[drawing.type]?.lineWidth ?? 1,
      ...(drawing.type === 'vertical' || drawing.type === 'horizontal'
        ? { color: state.drawingStyles?.[drawing.type]?.color || drawing.color || '#3b82f6',
            borderColor: state.drawingStyles?.[drawing.type]?.color || drawing.borderColor || drawing.color || '#3b82f6' }
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
  musicEnabled: false,
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
    // The replay cursor is always a 1m source-candle index. Changing the
    // chart timeframe changes only aggregation/display, never replay position.
    return {
      timeframe: nextTimeframe,
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

  updateDraftPosition: (patch) => set((state) => state.draftPosition
    ? { draftPosition: { ...state.draftPosition, ...patch } }
    : state),

  clearDraft: () => set({ draftPosition: null, isDrawingMode: false, drawingStep: null }),

  openOrderModal: (side) => set({ isOrderModalOpen: true, orderSide: side }),
  closeOrderModal: () => set({ isOrderModalOpen: false }),
  openHistory: () => set({ isHistoryOpen: true }),
  closeHistory: () => set({ isHistoryOpen: false }),
  openEquity: () => set({ isEquityOpen: true }),
  closeEquity: () => set({ isEquityOpen: false }),
  openInfo: () => set({ isInfoOpen: true }),
  closeInfo: () => set({ isInfoOpen: false }),
  openAnalytics: () => set({ isAnalyticsOpen: true, analyticsSnapshot: null }),
  openAnalyticsForSession: (session) => set({ isAnalyticsOpen: true, analyticsSnapshot: session, isPreviousSessionsOpen: false }),
  closeAnalytics: () => set({ isAnalyticsOpen: false, analyticsSnapshot: null }),
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
    const currentCandle = state.rawData[state.currentIndex];
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
      tradeHistory: [...state.tradeHistory, { ...pos, exitPrice, pnl, reason: 'MANUAL', closeTime: currentCandle.time, drawingSnapshot: cloneTradeDrawingSnapshot(state) }],
      gameState: newGameState,
      isPlaying: newGameState.isOver ? false : state.isPlaying,
    };
  }),

  closeAllPositions: () => set((state) => {
    if (state.positions.length === 0 || !state.rawData[state.currentIndex]) return state;
    const currentCandle = state.rawData[state.currentIndex];
    const exitPrice = currentCandle.close;
    let newBalance = state.balance;
    const newHistory = [...state.tradeHistory];
    state.positions.forEach(pos => {
      const isBuy = pos.type === 'buy';
      const priceDiff = isBuy ? exitPrice - pos.entryPrice : pos.entryPrice - exitPrice;
      const contractSize = getPnlMultiplier(pos.symbol || state.symbol, state.contractSpecs);
      const pnl = priceDiff * contractSize * pos.size;
      newBalance += pnl;
      newHistory.push({ ...pos, exitPrice, pnl, reason: 'MANUAL', closeTime: currentCandle.time, drawingSnapshot: cloneTradeDrawingSnapshot(state) });
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
  stepForward: (mode = 'timeframe', count = 1) => set((state) => {
    if (state.gameState.isOver) return state;
    if (!state.gameStarted) return state;
    if (state.rawData.length === 0) return state;

    // Already at the last candle — nothing to advance to.
    if (state.currentIndex >= state.rawData.length - 1) return state;

    // currentIndex always identifies the last 1-minute source candle processed,
    // no matter which chart timeframe is selected.
    let firstProcessedIndex = state.currentIndex + 1;
    let lastProcessedIndex;
    let nextIndex;

    if (mode === 'minute') {
      const barsToAdvance = Math.max(1, Math.floor(Number(count) || 1));
      lastProcessedIndex = Math.min(state.rawData.length - 1, state.currentIndex + barsToAdvance);
      nextIndex = lastProcessedIndex;
    } else {
      // Manual Next Bar jumps to the end of the next displayed timeframe bucket.
      // The cursor remains on the final underlying 1m candle in that bucket.
      const nextRaw = state.rawData[firstProcessedIndex];
      if (!nextRaw) return state;
      const bucketStart = getTimeframeBucketStart(nextRaw.time, Number(state.timeframe) || 1);
      lastProcessedIndex = firstProcessedIndex;
      while (lastProcessedIndex + 1 < state.rawData.length &&
        getTimeframeBucketStart(state.rawData[lastProcessedIndex + 1].time, Number(state.timeframe) || 1) === bucketStart) {
        lastProcessedIndex++;
      }
      nextIndex = lastProcessedIndex;
    }

    nextIndex = Math.min(nextIndex, state.rawData.length - 1);
    const advanced = nextIndex > state.currentIndex;

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
            newHistory.push({ ...pos, exitPrice, pnl, reason: 'SL', closeTime: candle.time, drawingSnapshot: cloneTradeDrawingSnapshot(state) });
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
            newHistory.push({ ...pos, exitPrice, pnl, reason: 'TP', closeTime: candle.time, drawingSnapshot: cloneTradeDrawingSnapshot(state) });
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
            newHistory.push({ ...filledPosition, exitPrice, pnl, reason: 'SL', closeTime: candle.time, drawingSnapshot: cloneTradeDrawingSnapshot(state) });
            slHit = true;
          } else if (hitTargetOnEntryBar) {
            const exitPrice = getTakeProfitFillPrice(order.type, targetPrice, candle);
            const pnl = (isBuy ? exitPrice - fillPrice : fillPrice - exitPrice) *
              contractSize * recalculatedLots;
            newBalance += pnl;
            newHistory.push({ ...filledPosition, exitPrice, pnl, reason: 'TP', closeTime: candle.time, drawingSnapshot: cloneTradeDrawingSnapshot(state) });
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
    // Market orders execute at the latest replayed 1m close. A chart's
    // display timeframe must never change the simulated execution price.
    const executionCandle = candle;
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