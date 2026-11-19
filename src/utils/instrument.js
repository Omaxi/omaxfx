// Contract and quote-currency metadata used by order sizing and realized/unrealized PnL.
const SYMBOL_CONTRACT = {
  XAUUSD: 100,
  EURUSD: 100000,
};
const DEFAULT_CONTRACT = 100;

export const getContractSize = (symbol, specs = {}) =>
  specs?.[symbol]?.contractSize ?? SYMBOL_CONTRACT[symbol] ?? DEFAULT_CONTRACT;

export const getPricePrecision = (symbol, specs = {}) => {
  const configured = Number(specs?.[symbol]?.precision);
  if (Number.isInteger(configured) && configured >= 0 && configured <= 10) return configured;
  return symbol === 'EURUSD' ? 5 : symbol?.includes('JPY') ? 3 : 2;
};

export const getPriceTickSize = (symbol, specs = {}) => {
  const configured = Number(specs?.[symbol]?.tickSize);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return symbol === 'EURUSD' ? 0.00001 : symbol?.includes('JPY') ? 0.001 : 0.01;
};

export const getPnlMultiplier = (symbol, specs = {}) => {
  const spec = specs?.[symbol];
  const conversion = Number(spec?.quoteToAccountRate);
  return getContractSize(symbol, specs) * (Number.isFinite(conversion) && conversion > 0 ? conversion : 1);
};
