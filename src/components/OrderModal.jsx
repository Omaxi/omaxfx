import { useState, useEffect, useMemo } from 'react';
import { useStore } from '../store';
import { fmtMoney } from '../utils/format';
import { X, AlertTriangle } from 'lucide-react';

const round2 = (n) => Math.round(n * 100) / 100;

export default function OrderModal() {
  const { 
    isOrderModalOpen, closeOrderModal, orderSide, placeOrder, 
    balance, rawData, currentIndex, draftPosition, clearDraft, rules
  } = useStore();

  const [orderType, setOrderType] = useState('market');
  const [riskPercent, setRiskPercent] = useState(1);
  const [slPrice, setSlPrice] = useState(0);
  const [tpPrice, setTpPrice] = useState(0);
  const [entryPrice, setEntryPrice] = useState(0);

  const currentPrice = rawData[currentIndex]?.close || 0;
  const riskAmount = balance * (riskPercent / 100);
  const maxRisk = rules?.maxRiskPerTrade ?? 3;

  useEffect(() => {
    if (riskPercent > maxRisk) setRiskPercent(maxRisk);
  }, [maxRisk, riskPercent]);

  useEffect(() => {
    if (isOrderModalOpen) {
      if (draftPosition) {
        setEntryPrice(round2(draftPosition.entry || currentPrice));
        setSlPrice(round2(draftPosition.sl || (orderSide === 'buy' ? currentPrice - 2 : currentPrice + 2)));
        setTpPrice(round2(draftPosition.tp || (orderSide === 'buy' ? currentPrice + 4 : currentPrice - 4)));
        setOrderType('limit');
      } else {
        setEntryPrice(round2(currentPrice));
        setSlPrice(round2(orderSide === 'buy' ? currentPrice - 2 : currentPrice + 2));
        setTpPrice(round2(orderSide === 'buy' ? currentPrice + 4 : currentPrice - 4));
        setOrderType('market');
      }
    }
  }, [isOrderModalOpen, draftPosition, orderSide, currentPrice]);

  const validation = useMemo(() => {
    const errors = [];
    const effectiveEntry = orderType === 'market' ? currentPrice : entryPrice;

    if (orderType !== 'market' && (!entryPrice || entryPrice <= 0)) {
      errors.push('Entry price must be greater than 0');
    }

    if (orderSide === 'buy') {
      if (slPrice >= effectiveEntry) errors.push('BUY: Stop Loss must be BELOW entry');
      if (tpPrice <= effectiveEntry) errors.push('BUY: Take Profit must be ABOVE entry');
    } else {
      if (slPrice <= effectiveEntry) errors.push('SELL: Stop Loss must be ABOVE entry');
      if (tpPrice >= effectiveEntry) errors.push('SELL: Take Profit must be BELOW entry');
    }

    if (riskPercent > maxRisk) {
      errors.push(`Risk ${riskPercent}% exceeds game rule (max ${maxRisk}%)`);
    }

    return { errors, isValid: errors.length === 0, effectiveEntry };
  }, [orderSide, entryPrice, slPrice, tpPrice, orderType, currentPrice, riskPercent, maxRisk]);

  const { estimatedLoss, estimatedProfit } = useMemo(() => {
    const entry = validation.effectiveEntry;
    if (!entry || !slPrice || !tpPrice) return { estimatedLoss: 0, estimatedProfit: 0 };
    const slDistance = Math.abs(entry - slPrice);
    const tpDistance = Math.abs(tpPrice - entry);
    const loss = riskAmount;
    const profit = slDistance > 0 ? riskAmount * (tpDistance / slDistance) : 0;
    return { estimatedLoss: loss, estimatedProfit: profit };
  }, [validation.effectiveEntry, slPrice, tpPrice, riskAmount]);

  if (!isOrderModalOpen) return null;

  const handleSubmit = () => {
    if (!validation.isValid) return;
    placeOrder({
      side: orderSide,
      type: orderType,
      riskPercent,
      entryPrice: validation.effectiveEntry,
      slPrice,
      tpPrice,
      riskAmount
    });
  };

  const handleCancel = () => {
    clearDraft();
    closeOrderModal();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#131722] rounded-2xl w-full max-w-md border border-[#2a2e39] overflow-hidden max-h-[95vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b border-[#2a2e39]">
          <h2 className="text-xl font-bold">Place Order</h2>
          <button onClick={handleCancel} className="p-1 hover:bg-[#2a2e39] rounded"><X size={20}/></button>
        </div>

        <div className="overflow-y-auto flex-1">
          <div className="bg-[#1e222d] mx-4 mt-4 p-4 rounded-lg flex justify-between">
            <div>
              <p className="text-xs text-gray-400">Estimated Loss</p>
              <p className="text-red-400 font-bold">${fmtMoney(estimatedLoss)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">Estimated Profit</p>
              <p className="text-green-400 font-bold">${fmtMoney(estimatedProfit)}</p>
            </div>
          </div>

          <div className="p-4 space-y-4">
            <div>
              <label className="text-xs text-gray-400 block mb-2">
                Risk Percentage <span className="text-gray-500">(max {maxRisk}%)</span>
              </label>
              <div className="flex gap-2">
                {[0.5, 1, 2, 3].filter(pct => pct <= maxRisk).map(pct => (
                  <button key={pct} onClick={() => setRiskPercent(pct)} className={`flex-1 py-2 rounded text-sm font-bold ${riskPercent === pct ? 'bg-blue-600' : 'bg-[#1e222d]'}`}>{pct}%</button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-400">Side</label>
                <div className={`mt-1 p-3 rounded font-bold capitalize ${orderSide === 'buy' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                  {orderSide}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400">Type</label>
                <select value={orderType} onChange={(e) => setOrderType(e.target.value)} className="w-full mt-1 p-3 bg-[#1e222d] rounded text-sm border border-[#2a2e39]">
                  <option value="market">Market</option>
                  <option value="limit">Limit</option>
                  <option value="stop">Stop</option>
                </select>
              </div>
            </div>

            {orderType === 'market' ? (
              <div className="bg-[#1e222d] p-3 rounded text-sm">
                <span className="text-gray-400">Entry at market: </span>
                <span className="font-mono font-bold text-white">{currentPrice.toFixed(2)}</span>
              </div>
            ) : (
              <div>
                <label className="text-xs text-gray-400">Entry Price</label>
                <input 
                  type="number" 
                  value={entryPrice} 
                  step="0.01"
                  onChange={(e) => setEntryPrice(Number(e.target.value))} 
                  className="w-full mt-1 p-3 bg-[#1e222d] rounded border border-[#2a2e39]" 
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-red-400">Stop Loss</label>
                <input 
                  type="number" 
                  value={slPrice} 
                  step="0.01"
                  onChange={(e) => setSlPrice(Number(e.target.value))} 
                  className={`w-full mt-1 p-3 bg-[#1e222d] rounded border ${
                    validation.errors.some(e => e.includes('Stop Loss')) ? 'border-red-500' : 'border-[#2a2e39]'
                  }`}
                />
              </div>
              <div>
                <label className="text-xs text-green-400">Take Profit</label>
                <input 
                  type="number" 
                  value={tpPrice} 
                  step="0.01"
                  onChange={(e) => setTpPrice(Number(e.target.value))} 
                  className={`w-full mt-1 p-3 bg-[#1e222d] rounded border ${
                    validation.errors.some(e => e.includes('Take Profit')) ? 'border-red-500' : 'border-[#2a2e39]'
                  }`}
                />
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

        <div className="p-4 flex gap-3 border-t border-[#2a2e39]">
          <button onClick={handleCancel} className="flex-1 py-3 bg-[#2a2e39] rounded font-bold">Cancel</button>
          <button 
            onClick={handleSubmit} 
            disabled={!validation.isValid}
            className={`flex-1 py-3 rounded font-bold ${
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