// Contract and quote-currency metadata used by order sizing and realized/unrealized PnL.
const SYMBOL_CONTRACT = {
  XAUUSD: 100,
  EURUSD: 100000,
};
const DEFAULT_CONTRACT = 100;

export const getContractSize = (symbol, specs = {}) =>
  specs?.[symbol]?.contractSize ?? SYMBOL_CONTRACT[symbol] ?? DEFAULT_CONTRACT;

export const getPricePrecision = (symbol, specs = {}) => {
  if (symbol === 'EURUSD' || symbol === 'CUSTOM') return 5;
  if (symbol === 'XAUUSD') return 3;
  const configured = Number(specs?.[symbol]?.precision);
  if (Number.isInteger(configured) && configured >= 0 && configured <= 10) return configured;
  return symbol?.includes('JPY') ? 3 : 2;
};

export const getPriceTickSize = (symbol, specs = {}) => {
  if (symbol === 'EURUSD' || symbol === 'CUSTOM') return 0.00001;
  if (symbol === 'XAUUSD') return 0.001;
  const configured = Number(specs?.[symbol]?.tickSize);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return symbol?.includes('JPY') ? 0.001 : 0.01;
};

export const getDefaultMarketStopDistance = (symbol, tickSize) =>
  symbol === 'EURUSD' ? 20 * 0.0001 : 100 * tickSize;

export const getPnlMultiplier = (symbol, specs = {}) => {
  const spec = specs?.[symbol];
  const conversion = Number(spec?.quoteToAccountRate);
  return getContractSize(symbol, specs) * (Number.isFinite(conversion) && conversion > 0 ? conversion : 1);
};

export const calculateUnrealizedPnlAtPrice = (positions, markPrice, fallbackSymbol, specs = {}) =>
  (positions || []).reduce((sum, pos) => {
    const entry = Number(pos.entryPrice), size = Number(pos.size);
    const multiplier = Number(getPnlMultiplier(pos.symbol || fallbackSymbol, specs));
    if (![markPrice, entry, size, multiplier].every(Number.isFinite) || size < 0 || multiplier <= 0) return sum;
    const isBuy = pos.type === 'buy';
    const diff = isBuy ? markPrice - entry : entry - markPrice;
    return sum + diff * multiplier * size;
  }, 0);

export const calculateIntrabarUnrealizedPnl = (positions, candle, fallbackSymbol, specs = {}) =>
  (positions || []).reduce((sum, pos) => {
    if (!candle) return sum;
    const isBuy = pos.type === 'buy';
    const markPrice = isBuy ? Number(candle.low) : Number(candle.high);
    const entry = Number(pos.entryPrice), size = Number(pos.size);
    const multiplier = Number(getPnlMultiplier(pos.symbol || fallbackSymbol, specs));
    if (![markPrice, entry, size, multiplier].every(Number.isFinite) || size < 0 || multiplier <= 0) return sum;
    const diff = isBuy ? markPrice - entry : entry - markPrice;
    return sum + diff * multiplier * size;
  }, 0);

export const calculateFavorableIntrabarPnl = (positions, candle, fallbackSymbol, specs = {}) =>
  (positions || []).reduce((sum, pos) => {
    if (!candle) return sum;
    const isBuy = pos.type === 'buy';
    const markPrice = isBuy ? Number(candle.high) : Number(candle.low);
    const entry = Number(pos.entryPrice), size = Number(pos.size);
    const multiplier = Number(getPnlMultiplier(pos.symbol || fallbackSymbol, specs));
    if (![markPrice, entry, size, multiplier].every(Number.isFinite) || size < 0 || multiplier <= 0) return sum;
    const diff = isBuy ? markPrice - entry : entry - markPrice;
    return sum + diff * multiplier * size;
  }, 0);
