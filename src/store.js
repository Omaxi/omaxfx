import { create } from 'zustand';
import { aggregateData } from './utils/timeframe';
import { 
  playOrderPlaced, playPositionClosed, playTPHit, playSLHit, playPendingTriggered, playRestart
} from './utils/audio';

export const INITIAL_BALANCE = 100000;
const EPSILON = 0.001;
const SESSION_KEY = 'omaxfx-session-v1';

const TZ_OFFSETS = {
  'UTC-3': -180, 'UTC-2': -120, 'UTC-1': -60,
  'UTC': 0,
  'UTC+1': 60, 'UTC+2': 120, 'UTC+3': 180,
};

const getDayKey = (unixSeconds) => {
  const d = new Date(unixSeconds * 1000);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const formatRangeDate = (unixSeconds) => {
  const d = new Date(unixSeconds * 1000);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}.${mm}.${yyyy}`;
};

const checkRuleViolations = (state, newBalance, newPeak, newDailyLoss) => {
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

const DEFAULT_RULES = {
  startingBalance: INITIAL_BALANCE,
  maxRiskPerTrade: 1,
  maxDailyLoss: 5,
  maxDrawdown: 10,
  countdownMinutes: 60,
  presetName: 'Custom',
};

export const useStore = create((set, get) => ({
  // ============================================================
  // MULTI-SYMBOL DATA CACHE
  // ============================================================
  allRawDataBySymbol: {},
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

  sessionTimes: { asian: 3, london: 10, newyork: 15 },

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
    const oldOffset = TZ_OFFSETS[state.timezone] ?? 180;
    const newOffset = TZ_OFFSETS[newTz] ?? 180;
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
  
  sessionName: 'Session 1',
  setSessionName: (name) => set({ sessionName: name }),

  saveSession: () => {
    const s = get();
    if (!s.gameStarted || !s.gamePeriod) return;
    try {
      const payload = {
        version: 1,
        savedAt: Date.now(),
        sessionName: s.sessionName,
        playerName: s.playerName,
        gamePeriod: s.gamePeriod,
        rules: s.rules,
        currentIndex: s.currentIndex,
        timeframe: s.timeframe,
        symbol: s.symbol,
        timezone: s.timezone,
        chartType: s.chartType,
        balance: s.balance,
        peakBalance: s.peakBalance,
        positions: s.positions,
        tradeHistory: s.tradeHistory,
        pendingOrders: s.pendingOrders,
        drawings: s.drawings,
        drawingsPast: s.drawingsPast,
        drawingsFuture: s.drawingsFuture,
        dailyLoss: s.dailyLoss,
        gameState: s.gameState,
        theme: s.theme,
        sessionTimes: s.sessionTimes,
        enableFireworks: s.enableFireworks,
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn('Failed to save session:', e);
    }
  },

  readSession: () => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  },

  clearSession: () => {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  },

  loadSavedSession: () => {
    const state = get();
    const saved = state.readSession();
    if (!saved || !saved.gamePeriod) return false;

    const savedSymbol = saved.symbol || 'XAUUSD';
    const symbolData = state.allRawDataBySymbol[savedSymbol];
    if (!symbolData || symbolData.length === 0) return false;

    const filtered = symbolData.filter(c => c.time >= saved.gamePeriod.from && c.time <= saved.gamePeriod.to);
    if (filtered.length === 0) return false;
    const tf = saved.timeframe || 1;
    set({
      symbol: savedSymbol,
      allRawData: symbolData,
      rawData: filtered,
      displayData: aggregateData(filtered, tf),
      gameStarted: true,
      isPeriodModalOpen: false,
      gamePeriod: saved.gamePeriod,
      rules: saved.rules || DEFAULT_RULES,
      currentIndex: Math.min(saved.currentIndex || 0, filtered.length - 1),
      timeframe: tf,
      timezone: saved.timezone || 'UTC+3',
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
      gameState: saved.gameState || { isOver: false, reason: null, message: '', startTime: null, timeRemaining: null },
      playerName: saved.playerName || 'Trader',
      sessionName: saved.sessionName || 'Session 1',
      theme: saved.theme || DEFAULT_THEME,
      sessionTimes: saved.sessionTimes || { asian: 3, london: 10, newyork: 15 },
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

  gameState: { isOver: false, reason: null, message: '', startTime: null, timeRemaining: null },

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

  // DRAWINGS
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
      lineWidth: drawing.lineWidth ?? 1,
      showBorder: drawing.showBorder !== false,
      symbol: state.symbol,
      // Tag with the timeframe the drawing was created on.
      // It will be visible on this TF and all LOWER TFs (more granular),
      // but hidden when the user switches to a HIGHER (less granular) TF.
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

  // PENCIL MODE
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

  // CHART TYPE & SETTINGS
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

  startGame: (from, to, rules) => set((state) => {
    const symbolData = state.allRawDataBySymbol[state.symbol] || state.allRawData;
    const filtered = symbolData.filter(c => c.time >= from && c.time <= to);
    const startBal = rules.startingBalance;
    const startDay = filtered[0] ? getDayKey(filtered[0].time) : null;
    return {
      rawData: filtered,
      displayData: aggregateData(filtered, state.timeframe),
      gamePeriod: { from, to },
      gameStarted: true,
      isPeriodModalOpen: false,
      rules,
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
      gameState: { isOver: false, reason: null, message: '', startTime: Date.now(), timeRemaining: rules.countdownMinutes ? rules.countdownMinutes * 60 : null },
      recenterToken: state.recenterToken + 1,
    };
  }),

  endGame: (reason, message) => set((state) => ({
    isPlaying: false,
    gameState: { ...state.gameState, isOver: true, reason, message },
  })),

  updateTimeRemaining: (seconds) => set((state) => ({
    gameState: { ...state.gameState, timeRemaining: seconds },
  })),

  restartGame: () => {
    const state = get();
    if (state.soundEnabled) playRestart();
    set({
      gameStarted: false,
      isPeriodModalOpen: true,
      gameState: { isOver: false, reason: null, message: '', startTime: null, timeRemaining: null },
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
    if (newTimeframe === state.timeframe) return state;
    return {
      timeframe: newTimeframe,
      displayData: aggregateData(state.rawData, newTimeframe),
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
      const d = new Date(state.rawData[i].time * 1000);
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
    const currentCandle = state.rawData[state.currentIndex];
    const exitPrice = currentCandle.close;
    const isBuy = pos.type === 'buy';
    const priceDiff = isBuy ? exitPrice - pos.entryPrice : pos.entryPrice - exitPrice;
    const pnl = priceDiff * 100 * pos.size;
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
    const currentCandle = state.rawData[state.currentIndex];
    const exitPrice = currentCandle.close;
    let newBalance = state.balance;
    const newHistory = [...state.tradeHistory];
    state.positions.forEach(pos => {
      const isBuy = pos.type === 'buy';
      const priceDiff = isBuy ? exitPrice - pos.entryPrice : pos.entryPrice - exitPrice;
      const pnl = priceDiff * 100 * pos.size;
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

  stepForward: () => set((state) => {
    if (state.gameState.isOver) return state;
    const jumpSize = state.timeframe;
    const nextIndex = Math.min(state.currentIndex + jumpSize, state.rawData.length - 1);
    
    let newBalance = state.balance;
    let newPositions = [...state.positions];
    let newHistory = [...state.tradeHistory];
    let newPendingOrders = [...state.pendingOrders];
    let newPeak = state.peakBalance;
    let newDailyLoss = { ...state.dailyLoss };
    let tpHit = false, slHit = false, pendingTriggered = false;
    let gameOverReason = null, gameOverMessage = '';

    for (let i = state.currentIndex + 1; i <= nextIndex; i++) {
      const candle = state.rawData[i];
      if (!candle) break;
      const dayKey = getDayKey(candle.time);
      if (newDailyLoss.day !== dayKey) {
        newDailyLoss = { day: dayKey, dayStartBalance: newBalance };
      }
      const stillOpen = [];
      for (const pos of newPositions) {
        const isBuy = pos.type === 'buy';
        let closed = false;
        if (pos.sl) {
          const hitSl = isBuy ? candle.low <= pos.sl : candle.high >= pos.sl;
          if (hitSl) {
            const pnl = (isBuy ? pos.sl - pos.entryPrice : pos.entryPrice - pos.sl) * 100 * pos.size;
            newBalance += pnl;
            newHistory.push({ ...pos, exitPrice: pos.sl, pnl, reason: 'SL', closeTime: candle.time });
            closed = true; slHit = true;
          }
        }
        if (!closed && pos.tp) {
          const hitTp = isBuy ? candle.high >= pos.tp : candle.low <= pos.tp;
          if (hitTp) {
            const pnl = (isBuy ? pos.tp - pos.entryPrice : pos.entryPrice - pos.tp) * 100 * pos.size;
            newBalance += pnl;
            newHistory.push({ ...pos, exitPrice: pos.tp, pnl, reason: 'TP', closeTime: candle.time });
            closed = true; tpHit = true;
          }
        }
        if (!closed) stillOpen.push(pos);
      }
      newPositions = stillOpen;
      if (!gameOverReason) {
        const violation = checkRuleViolations(state, newBalance, newPeak, newDailyLoss);
        if (violation) { gameOverReason = violation.reason; gameOverMessage = violation.message; }
      }
      const stillPending = [];
      for (const order of newPendingOrders) {
        const isBuy = order.type === 'buy';
        const hitEntry = isBuy 
          ? candle.low <= order.entryPrice && candle.high >= order.entryPrice
          : candle.high >= order.entryPrice && candle.low <= order.entryPrice;
        if (hitEntry) {
          newPositions.push({ ...order, isPending: false, openTime: candle.time });
          pendingTriggered = true;
        } else stillPending.push(order);
      }
      newPendingOrders = stillPending;
      if (newBalance > newPeak) newPeak = newBalance;
      if (gameOverReason) break;
    }

    if (state.soundEnabled) {
      if (tpHit) playTPHit();
      if (slHit) playSLHit();
      if (pendingTriggered) playPendingTriggered();
    }

    if (!gameOverReason) {
      const violation = checkRuleViolations(state, newBalance, newPeak, newDailyLoss);
      if (violation) { gameOverReason = violation.reason; gameOverMessage = violation.message; }
    }

    const atEnd = nextIndex >= state.rawData.length - 1;
    if (!gameOverReason && atEnd) {
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

  placeOrder: ({ side, type, riskPercent, entryPrice, slPrice, tpPrice, riskAmount }) => set((state) => {
    if (state.gameState.isOver) return state;
    if (riskPercent > state.rules.maxRiskPerTrade + EPSILON) return state;
    const currentPrice = state.rawData[state.currentIndex].close;
    const lots = riskAmount / (Math.abs(entryPrice - slPrice) * 100);
    const openTime = state.rawData[state.currentIndex].time;
    const newOrder = {
      id: Date.now() + Math.random(),
      type: side, orderType: type,
      entryPrice: type === 'market' ? currentPrice : entryPrice,
      sl: slPrice, tp: tpPrice,
      size: Number(lots.toFixed(2)),
      riskPercent, riskAmount,
      isPending: type !== 'market',
      openTime,
      symbol: state.symbol,
    };
    if (state.soundEnabled) playOrderPlaced();
    if (type === 'market') {
      return { positions: [...state.positions, newOrder], isOrderModalOpen: false, draftPosition: null };
    } else {
      return { pendingOrders: [...state.pendingOrders, newOrder], isOrderModalOpen: false, draftPosition: null };
    }
  }),
}));