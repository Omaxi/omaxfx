// Contract and quote-currency metadata used by order sizing and realized/unrealized PnL.
const SYMBOL_CONTRACT = {
  XAUUSD: 100,
  EURUSD: 100000,
};
const DEFAULT_CONTRACT = 100;

export const getContractSize = (symbol, specs = {}) =>
  specs?.[symbol]?.contractSize ?? SYMBOL_CONTRACT[symbol] ?? DEFAULT_CONTRACT;

export const getPricePrecision = (symbol, specs = {}) => {
  if (symbol === 'EURUSD') return 5;
  if (symbol === 'XAUUSD') return 2;
  const configured = Number(specs?.[symbol]?.precision);
  if (Number.isInteger(configured) && configured >= 0 && configured <= 10) return configured;
  return symbol?.includes('JPY') ? 3 : 2;
};

export const getPriceTickSize = (symbol, specs = {}) => {
  if (symbol === 'EURUSD') return 0.00001;
  if (symbol === 'XAUUSD') return 0.01;
  const configured = Number(specs?.[symbol]?.tickSize);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return symbol?.includes('JPY') ? 0.001 : 0.01;
};

export const getPnlMultiplier = (symbol, specs = {}) => {
  const spec = specs?.[symbol];
  const conversion = Number(spec?.quoteToAccountRate);
  return getContractSize(symbol, specs) * (Number.isFinite(conversion) && conversion > 0 ? conversion : 1);
};

export const calculateUnrealizedPnlAtPrice = (positions, markPrice, fallbackSymbol, specs = {}) =>
  (positions || []).reduce((sum, pos) => {
    const isBuy = pos.type === 'buy';
    const diff = isBuy ? markPrice - Number(pos.entryPrice) : Number(pos.entryPrice) - markPrice;
    return sum + diff * getPnlMultiplier(pos.symbol || fallbackSymbol, specs) * Number(pos.size || 0);
  }, 0);

export const calculateIntrabarUnrealizedPnl = (positions, candle, fallbackSymbol, specs = {}) =>
  (positions || []).reduce((sum, pos) => {
    if (!candle) return sum;
    const isBuy = pos.type === 'buy';
    const markPrice = isBuy ? Number(candle.low) : Number(candle.high);
    const diff = isBuy ? markPrice - Number(pos.entryPrice) : Number(pos.entryPrice) - markPrice;
    return sum + diff * getPnlMultiplier(pos.symbol || fallbackSymbol, specs) * Number(pos.size || 0);
  }, 0);

export const calculateFavorableIntrabarPnl = (positions, candle, fallbackSymbol, specs = {}) =>
  (positions || []).reduce((sum, pos) => {
    if (!candle) return sum;
    const isBuy = pos.type === 'buy';
    const markPrice = isBuy ? Number(candle.high) : Number(candle.low);
    const diff = isBuy ? markPrice - Number(pos.entryPrice) : Number(pos.entryPrice) - markPrice;
    return sum + diff * getPnlMultiplier(pos.symbol || fallbackSymbol, specs) * Number(pos.size || 0);
  }, 0);
