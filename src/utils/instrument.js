// Contract and quote-currency metadata used by order sizing and realized/unrealized PnL.
const SYMBOL_CONTRACT = {
  XAUUSD: 100,
  EURUSD: 100000,
};
const DEFAULT_CONTRACT = 100;

export const getContractSize = (symbol, specs = {}) =>
  specs?.[symbol]?.contractSize ?? SYMBOL_CONTRACT[symbol] ?? DEFAULT_CONTRACT;

export const getPnlMultiplier = (symbol, specs = {}) => {
  const spec = specs?.[symbol];
  const conversion = Number(spec?.quoteToAccountRate);
  return getContractSize(symbol, specs) * (Number.isFinite(conversion) && conversion > 0 ? conversion : 1);
};
