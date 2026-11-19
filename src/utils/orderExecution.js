// Determine whether a pending order is touched by this candle and the
// executable price, including gaps through the requested level.
export function getPendingOrderFillPrice(order, candle) {
  if (!order || !candle) return null;
  const entry = Number(order.entryPrice);
  const open = Number(candle.open);
  const high = Number(candle.high);
  const low = Number(candle.low);
  if (![entry, open, high, low].every(Number.isFinite) || entry <= 0) return null;

  const side = order.type;
  const kind = order.orderType || 'limit';
  if (kind === 'limit' && side === 'buy' && low <= entry) return open < entry ? open : entry;
  if (kind === 'limit' && side === 'sell' && high >= entry) return open > entry ? open : entry;
  if (kind === 'stop' && side === 'buy' && high >= entry) return open > entry ? open : entry;
  if (kind === 'stop' && side === 'sell' && low <= entry) return open < entry ? open : entry;
  return null;
}
