import { useState, useEffect, useMemo } from 'react';
import { useStore } from '../store';
import { fmtMoney } from '../utils/format';
import { X, AlertTriangle } from 'lucide-react';

// =========================================================================
// Per-symbol price configuration
// -------------------------------------------------------------------------
//   pointSize  → the value of 1 "point" in price terms
//   precision  → number of decimals shown / rounded to
// =========================================================================
const SYMBOL_META = {
  XAUUSD: { pointSize: 0.01,   precision: 2 },
  EURUSD: { pointSize: 0.0001, precision: 4 },
};
const DEFAULT_META = { pointSize: 0.01, precision: 2 };

// Default distance for a market order (in points):
const DEFAULT_SL_POINTS = 100;
const DEFAULT_TP_POINTS = 200;

const roundTo = (n, precision) => {
  const factor = Math.pow(10, precision);
  return Math.round(n * factor) / factor;
};

export default function OrderModal() {
  const { 
    contractSpecs,
    isOrderModalOpen, closeOrderModal, orderSide, placeOrder, 
    balance, rawData, currentIndex, draftPosition, clearDraft, rules,
    symbol,
  } = useStore();

  const meta = contractSpecs?.[symbol] ? { pointSize: contractSpecs[symbol].tickSize, precision: contractSpecs[symbol].precision } : (SYMBOL_META[symbol] ?? DEFAULT_META);
  const { pointSize, precision } = meta;

  const [orderType, setOrderType] = useState('market');
  const [riskPercent, setRiskPercent] = useState(1);
  const [slPrice, setSlPrice] = useState(0);
  const [tpPrice, setTpPrice] = useState(0);
  const [riskReward, setRiskReward] = useState('2');
  const [entryPrice, setEntryPrice] = useState(0);
  const [breakevenEnabled, setBreakevenEnabled] = useState(false);

  const currentPrice = rawData[currentIndex]?.close || 0;
  const riskAmount = balance * (riskPercent / 100);
  const maxRisk = rules?.maxRiskPerTrade ?? 3;
  const propFirmEnabled = rules?.propFirmEnabled !== false;

  useEffect(() => {
    if (propFirmEnabled && riskPercent > maxRisk) setRiskPercent(maxRisk);
  }, [propFirmEnabled, maxRisk, riskPercent]);

  useEffect(() => { if (isOrderModalOpen) setRiskReward('2'); }, [isOrderModalOpen]);

  // Whenever the modal opens (or the side / symbol / current price changes
  // while it's open), recompute the default entry / SL / TP.
  useEffect(() => {
    if (!isOrderModalOpen) return;

    if (draftPosition) {
      // User dragged a position on the chart → use those prices
      setEntryPrice(roundTo(draftPosition.entry || currentPrice, precision));
      setSlPrice(roundTo(draftPosition.sl || (orderSide === 'buy'
        ? currentPrice - DEFAULT_SL_POINTS * pointSize
        : currentPrice + DEFAULT_SL_POINTS * pointSize), precision));
      setTpPrice(0);
      setOrderType('limit');
    } else {
      // Market order default: SL = 100 points away, TP = 200 points away
      setEntryPrice(roundTo(currentPrice, precision));
      setSlPrice(roundTo(orderSide === 'buy'
        ? currentPrice - DEFAULT_SL_POINTS * pointSize
        : currentPrice + DEFAULT_SL_POINTS * pointSize, precision));
      setTpPrice(0);
      setOrderType('market');
    }
  }, [isOrderModalOpen, draftPosition, orderSide, currentPrice, precision, pointSize]);

  // When the user flips between Market / Limit / Stop, re-apply market defaults
  // only when switching TO market. Switching away keeps whatever they typed.
  useEffect(() => {
    if (!isOrderModalOpen) return;
    if (orderType !== 'market') return;
    if (draftPosition) return;

    setEntryPrice(roundTo(currentPrice, precision));
    setSlPrice(roundTo(orderSide === 'buy'
      ? currentPrice - DEFAULT_SL_POINTS * pointSize
      : currentPrice + DEFAULT_SL_POINTS * pointSize, precision));
    setTpPrice(0);
  }, [orderType, isOrderModalOpen, currentPrice, orderSide, precision, pointSize, draftPosition]);

  useEffect(() => {
    if (!isOrderModalOpen) return;
    if (riskReward === 'none') { setTpPrice(0); return; }
    const distance = Math.abs(Number(entryPrice) - Number(slPrice));
    if (!Number.isFinite(distance) || distance <= 0 || !entryPrice || !slPrice) return;
    const target = orderSide === 'buy'
      ? Number(entryPrice) + distance * Number(riskReward)
      : Number(entryPrice) - distance * Number(riskReward);
    setTpPrice(roundTo(target, precision));
  }, [isOrderModalOpen, riskReward, entryPrice, slPrice, orderSide, precision]);

  const validation = useMemo(() => {
    const errors = [];
    const effectiveEntry = orderType === 'market' ? currentPrice : entryPrice;

    if (!Number.isFinite(effectiveEntry) || effectiveEntry <= 0) {
      errors.push('Entry price must be a valid positive price');
    }
    if (!Number.isFinite(slPrice) || slPrice <= 0) {
      errors.push('Stop Loss must be a valid positive price');
    }
    if (riskReward !== 'none' && (!Number.isFinite(tpPrice) || tpPrice <= 0)) {
      errors.push('Take Profit must be a valid positive price');
    }
    if (!Number.isFinite(riskPercent) || riskPercent <= 0) {
      errors.push('Risk percentage must be greater than 0');
    }

    if (orderSide === 'buy') {
      if (slPrice >= effectiveEntry) errors.push('BUY: Stop Loss must be BELOW entry');
      if (riskReward !== 'none' && tpPrice <= effectiveEntry) errors.push('BUY: Take Profit must be ABOVE entry');
    } else {
      if (slPrice <= effectiveEntry) errors.push('SELL: Stop Loss must be ABOVE entry');
      if (riskReward !== 'none' && tpPrice >= effectiveEntry) errors.push('SELL: Take Profit must be BELOW entry');
    }

    if (propFirmEnabled && riskPercent > maxRisk) {
      errors.push(`Risk ${riskPercent}% exceeds game rule (max ${maxRisk}%)`);
    }

    return { errors, isValid: errors.length === 0, effectiveEntry };
  }, [orderSide, entryPrice, slPrice, tpPrice, orderType, currentPrice, riskPercent, maxRisk, riskReward, propFirmEnabled]);

  const { estimatedLoss, estimatedProfit } = useMemo(() => {
    const entry = validation.effectiveEntry;
    if (!entry || !slPrice || riskReward === 'none' || !tpPrice) return { estimatedLoss: riskAmount, estimatedProfit: 0 };
    const slDistance = Math.abs(entry - slPrice);
    const tpDistance = Math.abs(tpPrice - entry);
    const loss = riskAmount;
    const profit = slDistance > 0 ? riskAmount * (tpDistance / slDistance) : 0;
    return { estimatedLoss: loss, estimatedProfit: profit };
  }, [validation.effectiveEntry, slPrice, tpPrice, riskAmount, riskReward]);

  if (!isOrderModalOpen) return null;

  const handleSubmit = () => {
    if (!validation.isValid) return;
    placeOrder({
      side: orderSide,
      type: orderType,
      riskPercent,
      entryPrice: validation.effectiveEntry,
      slPrice,
      tpPrice: riskReward === 'none' ? null : tpPrice,
      riskAmount,
      breakevenEnabled,
    });
  };

  const handleCancel = () => {
    clearDraft();
    closeOrderModal();
  };

  // Input step depends on the symbol's precision so the spinner arrows
  // move by 1 point per click.
  const inputStep = precision === 4 ? '0.0001' : '0.01';

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#131722] rounded-2xl w-full max-w-md border border-[#2a2e39] overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-3 border-b border-[#2a2e39]">
          <h2 className="text-lg font-bold">Place Order</h2>
          <button onClick={handleCancel} className="p-1 hover:bg-[#2a2e39] rounded"><X size={20}/></button>
        </div>

        <div className="overflow-y-auto flex-1">
          <div className="bg-[#1e222d] mx-3 mt-3 p-3 rounded-lg flex justify-between">
            <div>
              <p className="text-xs text-gray-400">Estimated Loss</p>
              <p className="text-red-400 font-bold">${fmtMoney(estimatedLoss)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">Estimated Profit</p>
              <p className="text-green-400 font-bold">${fmtMoney(estimatedProfit)}</p>
            </div>
          </div>

          <div className="p-3 space-y-3">
            <div>
              <label className="text-[11px] text-gray-400 block mb-1">
                Risk Percentage {propFirmEnabled && <span className="text-gray-500">(max {maxRisk}%)</span>}
              </label>
              <div className="flex gap-2">
                {[0.5, 1, 2, 3].filter(pct => !propFirmEnabled || pct <= maxRisk).map(pct => (
                  <button key={pct} onClick={() => setRiskPercent(pct)} className={`flex-1 py-2 rounded text-sm font-bold ${riskPercent === pct ? 'bg-blue-600' : 'bg-[#1e222d]'}`}>{pct}%</button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 rounded bg-[#1e222d] px-3 py-2 text-[11px] text-gray-300">
              <input type="checkbox" checked={breakevenEnabled} onChange={(e) => setBreakevenEnabled(e.target.checked)} className="accent-blue-500"/>
              Automatically move Stop Loss to breakeven at +1R
            </label>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400">Side</label>
                <div className={`mt-1 p-2 rounded font-bold capitalize ${orderSide === 'buy' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                  {orderSide}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400">Type</label>
                <select value={orderType} onChange={(e) => setOrderType(e.target.value)} className="w-full mt-1 p-2 bg-[#1e222d] rounded text-sm border border-[#2a2e39]">
                  <option value="market">Market</option>
                  <option value="limit">Limit</option>
                  <option value="stop">Stop</option>
                </select>
              </div>
            </div>

            {orderType === 'market' ? (
              <div className="bg-[#1e222d] p-3 rounded text-sm">
                <span className="text-gray-400">Entry at market: </span>
                <span className="font-mono font-bold text-white">{currentPrice.toFixed(precision)}</span>
              </div>
            ) : (
              <div>
                <label className="text-xs text-gray-400">Entry Price</label>
                <input 
                  type="number" 
                  value={entryPrice} 
                  step={inputStep}
                  onChange={(e) => setEntryPrice(Number(e.target.value))} 
                  className="w-full mt-1 p-2 bg-[#1e222d] rounded border border-[#2a2e39]" 
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-red-400">Stop Loss</label>
                <input 
                  type="number" 
                  value={slPrice} 
                  step={inputStep}
                  onChange={(e) => setSlPrice(Number(e.target.value))} 
                  className={`w-full mt-1 p-2 bg-[#1e222d] rounded border ${
                    validation.errors.some(e => e.includes('Stop Loss')) ? 'border-red-500' : 'border-[#2a2e39]'
                  }`}
                />
              </div>
              <div>
                <label className="text-xs text-green-400">Risk / Reward</label>
                <select value={riskReward} onChange={(e) => setRiskReward(e.target.value)} className="w-full mt-1 p-2 bg-[#1e222d] rounded border border-[#2a2e39] text-sm">
                  <option value="1">1:1</option>
                  <option value="2">1:2</option>
                  <option value="3">1:3</option>
                  <option value="4">1:4</option>
                  <option value="5">1:5</option>
                  <option value="none">NONE</option>
                </select>
                <div className="mt-1 rounded bg-[#1e222d] px-2 py-1.5 text-xs text-gray-300">
                  TP: <span className="font-mono text-green-400">{riskReward === 'none' ? 'Disabled' : Number(tpPrice || 0).toFixed(precision)}</span>
                </div>
              </div>
            </div>

            {!validation.isValid && (
              <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 space-y-1">
                {validation.errors.map((err, i) => (
                  <div key={i} className="flex items-center gap-2 text-red-400 text-xs">
                    <AlertTriangle size={14} />
                    <span>{err}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-3 flex gap-2 border-t border-[#2a2e39]">
          <button onClick={handleCancel} className="flex-1 py-2 bg-[#2a2e39] rounded font-bold text-sm">Cancel</button>
          <button 
            onClick={handleSubmit} 
            disabled={!validation.isValid}
            className={`flex-1 py-2 rounded font-bold text-sm ${
              !validation.isValid
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : orderSide === 'buy' 
                  ? 'bg-green-600 hover:bg-green-700' 
                  : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            Confirm {orderSide.toUpperCase()}
          </button>
        </div>
      </div>
    </div>
  );
}