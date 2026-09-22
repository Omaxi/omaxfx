import { create } from 'zustand';
import { aggregateData } from './utils/timeframe';
import { 
  playOrderPlaced, playPositionClosed, playTPHit, playSLHit, playPendingTriggered, playRestart
} from './utils/audio';

export const INITIAL_BALANCE = 100000;

const EPSILON = 0.001;

// Base data timezone is UTC+3 (from CSV filename)
const TZ_OFFSETS = {
  'UTC': 0,
  'UTC+1': 60,
  'UTC+2': 120,
  'UTC+3': 180,
};

const getDayKey = (unixSeconds) => {
  const d = new Date(unixSeconds * 1000);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
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

export const useStore = create((set) => ({
  allRawData: [],
  rawData: [],        
  displayData: [],    
  timeframe: 1,
  currentIndex: 0,    
  isPlaying: false,   

  symbol: 'XAUUSD',
  timezone: 'UTC+3',   // matches base CSV timezone

  setSymbol: (code) => set({ symbol: code }),

  // Shift all time-based data by the delta between old and new timezone
  setTimezone: (newTz) => set((state) => {
    if (newTz === state.timezone) return state;
    const oldOffset = TZ_OFFSETS[state.timezone] ?? 180;
    const newOffset = TZ_OFFSETS[newTz] ?? 180;
    const shiftSec = (newOffset - oldOffset) * 60;

    if (shiftSec === 0) return { timezone: newTz };

    const shift = (t) => t == null ? t : t + shiftSec;

    return {
      timezone: newTz,
      allRawData: state.allRawData.map(c => ({ ...c, time: shift(c.time) })),
      rawData: state.rawData.map(c => ({ ...c, time: shift(c.time) })),
      displayData: state.displayData.map(c => ({ ...c, time: shift(c.time) })),
      drawings: state.drawings.map(d => ({
        ...d,
        points: d.points.map(p => ({ ...p, time: shift(p.time) })),
      })),
      tradeHistory: state.tradeHistory.map(t => ({
        ...t,
        openTime: shift(t.openTime),
        closeTime: shift(t.closeTime),
      })),
      positions: state.positions.map(p => ({
        ...p,
        openTime: shift(p.openTime),
      })),
      pendingOrders: state.pendingOrders.map(o => ({
        ...o,
        openTime: shift(o.openTime),
      })),
      gamePeriod: state.gamePeriod ? {
        from: shift(state.gamePeriod.from),
        to: shift(state.gamePeriod.to),
      } : null,
    };
  }),

  gameStarted: false,
  gamePeriod: null,
  
  playerName: 'Player',
  setPlayerName: (name) => set({ playerName: name }),

  loadingState: { isActive: true, loaded: 0, total: 0, error: null },
  setLoadingState: (patch) => set((state) => ({ loadingState: { ...state.loadingState, ...patch } })),

  rules: {
    startingBalance: INITIAL_BALANCE,
    maxRiskPerTrade: 1,
    maxDailyLoss: 5,
    maxDrawdown: 10,
    countdownMinutes: 60,
    presetName: 'Custom',
  },

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
  orderSide: 'buy',

  isDrawingMode: false,
  drawingSide: null,
  drawingStep: null,
  draftPosition: null,

  drawings: [],
  activeDrawingTool: null,

  setActiveDrawingTool: (tool) => set((state) => ({ 
    activeDrawingTool: state.activeDrawingTool === tool ? null : tool,
  })),

  addDrawing: (drawing) => set((state) => ({ 
    drawings: [...state.drawings, { ...drawing, id: Date.now() + Math.random() }] 
  })),

  updateDrawing: (id, points) => set((state) => ({
    drawings: state.drawings.map(d => d.id === id ? { ...d, points } : d)
  })),

  clearDrawings: () => set({ drawings: [], activeDrawingTool: null }),
  removeDrawing: (id) => set((state) => ({ drawings: state.drawings.filter(d => d.id !== id) })),

  soundEnabled: true,
  musicEnabled: true,
  toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),
  toggleMusic: () => set((state) => ({ musicEnabled: !state.musicEnabled })),

  setAllData: (data) => set({ allRawData: data }),

  startGame: (from, to, rules) => set((state) => {
    const filtered = state.allRawData.filter(c => c.time >= from && c.time <= to);
    const startBal = rules.startingBalance;
    const startDay = filtered[0] ? getDayKey(filtered[0].time) : null;
    return {
      rawData: filtered,
      displayData: aggregateData(filtered, state.timeframe),
      gamePeriod: { from, to },
      gameStarted: true,
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
      activeDrawingTool: null,
      peakBalance: startBal,
      dailyLoss: { day: startDay, dayStartBalance: startBal },
      gameState: { isOver: false, reason: null, message: '', startTime: Date.now(), timeRemaining: rules.countdownMinutes ? rules.countdownMinutes * 60 : null },
    };
  }),

  endGame: (reason, message) => set((state) => ({
    isPlaying: false,
    gameState: { ...state.gameState, isOver: true, reason, message },
  })),

  updateTimeRemaining: (seconds) => set((state) => ({
    gameState: { ...state.gameState, timeRemaining: seconds },
  })),

  restartGame: () => set((state) => {
    if (state.soundEnabled) playRestart();
    return {
      gameStarted: false,
      gameState: { isOver: false, reason: null, message: '', startTime: null, timeRemaining: null },
      currentIndex: 0,
      isPlaying: false,
      positions: [],
      tradeHistory: [],
      pendingOrders: [],
      draftPosition: null,
      isDrawingMode: false,
      drawings: [],
      activeDrawingTool: null,
    };
  }),

  setTimeframe: (newTimeframe) => set((state) => {
    if (newTimeframe === state.timeframe) return state;
    return {
      timeframe: newTimeframe,
      displayData: aggregateData(state.rawData, newTimeframe),
      drawings: state.drawings,
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
      openTime
    };
    if (state.soundEnabled) playOrderPlaced();
    if (type === 'market') {
      return { positions: [...state.positions, newOrder], isOrderModalOpen: false, draftPosition: null };
    } else {
      return { pendingOrders: [...state.pendingOrders, newOrder], isOrderModalOpen: false, draftPosition: null };
    }
  }),
}));