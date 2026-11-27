import { useState, useEffect, useMemo } from 'react';
import { useStore } from '../store';
import { fmtMoney } from '../utils/format';
import { getExecutionCandle } from '../utils/timeframe.js';
import { getPricePrecision, getPriceTickSize, getDefaultMarketStopDistance } from '../utils/instrument.js';
import { X, AlertTriangle, ChevronDown, Check } from 'lucide-react';

// =========================================================================
// Per-symbol price configuration
// -------------------------------------------------------------------------
//   pointSize  → the value of 1 "point" in price terms
//   precision  → number of decimals shown / rounded to
// =========================================================================
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

  const meta = { pointSize: getPriceTickSize(symbol, contractSpecs), precision: getPricePrecision(symbol, contractSpecs) };
  const { pointSize, precision } = meta;
  const defaultStopDistance = getDefaultMarketStopDistance(symbol, pointSize, precision);

  const [orderType, setOrderType] = useState('market');
  const [orderTypeOpen, setOrderTypeOpen] = useState(false);
  const [riskRewardOpen, setRiskRewardOpen] = useState(false);
  const [riskPercent, setRiskPercent] = useState(1);
  const [customRiskInput, setCustomRiskInput] = useState('');
  const [slPrice, setSlPrice] = useState(0);
  const [tpPrice, setTpPrice] = useState(0);
  const [riskReward, setRiskReward] = useState('2');
  const [entryPrice, setEntryPrice] = useState(0);
  const [breakevenEnabled, setBreakevenEnabled] = useState(false);
  const [breakevenTriggerR, setBreakevenTriggerR] = useState('1');
  const [partialTakeProfitEnabled, setPartialTakeProfitEnabled] = useState(false);
  const [partialTriggerR, setPartialTriggerR] = useState('1');
  const [partialClosePercent, setPartialClosePercent] = useState('50');

  const currentPrice = getExecutionCandle(rawData, useStore.getState().displayData, currentIndex, useStore.getState().timeframe)?.close || 0;
  const riskAmount = balance * (riskPercent / 100);
  const maxRisk = rules?.maxRiskPerTrade ?? 3;
  const propFirmEnabled = rules?.propFirmEnabled !== false;
  const isCustomPreset = rules?.presetName === 'Custom';
  const availableRiskOptions = [0.5, 1, 2, 3].filter(pct => !propFirmEnabled || pct <= maxRisk);
  const riskControlCount = availableRiskOptions.length + (isCustomPreset ? 1 : 0);

  useEffect(() => {
    if (propFirmEnabled && riskPercent > maxRisk) setRiskPercent(maxRisk);
    if (!isCustomPreset && customRiskInput) setCustomRiskInput('');
  }, [propFirmEnabled, maxRisk, riskPercent, isCustomPreset, customRiskInput]);

  useEffect(() => {
    if (!isOrderModalOpen) return;
    const draft = useStore.getState().draftPosition;
    const risk = draft?.entry != null && draft?.sl != null ? Math.abs(Number(draft.entry) - Number(draft.sl)) : 0;
    const reward = draft?.entry != null && draft?.tp != null ? Math.abs(Number(draft.tp) - Number(draft.entry)) : 0;
    setRiskReward(risk > 0 && reward > 0 ? (reward / risk).toFixed(1) : '2');
  }, [isOrderModalOpen]);

  // Whenever the modal opens (or the side / symbol / current price changes
  // while it's open), recompute the default entry / SL / TP.
  useEffect(() => {
    if (!isOrderModalOpen) return;

    if (draftPosition) {
      // User dragged a position on the chart → use those prices
      setEntryPrice(roundTo(draftPosition.entry || currentPrice, precision));
      setSlPrice(roundTo(draftPosition.sl || (orderSide === 'buy'
        ? currentPrice - defaultStopDistance
        : currentPrice + defaultStopDistance), precision));
      setTpPrice(draftPosition.tp ? roundTo(draftPosition.tp, precision) : 0);
      setOrderType(draftPosition.orderType || 'limit');
    } else {
      // Five-decimal pairs: 5-pip SL. The default 1:2 RR creates a 10-pip TP.
      setEntryPrice(roundTo(currentPrice, precision));
      setSlPrice(roundTo(orderSide === 'buy'
        ? currentPrice - defaultStopDistance
        : currentPrice + defaultStopDistance, precision));
      setTpPrice(0);
      setOrderType('market');
    }
  }, [isOrderModalOpen, draftPosition, orderSide, currentPrice, precision, pointSize, symbol, defaultStopDistance]);

  // When the user flips between Market / Limit / Stop, re-apply market defaults
  // only when switching TO market. Switching away keeps whatever they typed.
  useEffect(() => {
    if (!isOrderModalOpen) return;
    if (orderType !== 'market') return;
    if (draftPosition) return;

    setEntryPrice(roundTo(currentPrice, precision));
    setSlPrice(roundTo(orderSide === 'buy'
      ? currentPrice - defaultStopDistance
      : currentPrice + defaultStopDistance, precision));
    setTpPrice(0);
  }, [orderType, isOrderModalOpen, currentPrice, orderSide, precision, pointSize, draftPosition, symbol, defaultStopDistance]);

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
    if (orderType === 'limit' && orderSide === 'buy' && entryPrice >= currentPrice) {
      errors.push('BUY LIMIT entry must be below the current market price');
    }
    if (orderType === 'limit' && orderSide === 'sell' && entryPrice <= currentPrice) {
      errors.push('SELL LIMIT entry must be above the current market price');
    }
    if (orderType === 'stop' && orderSide === 'buy' && entryPrice <= currentPrice) {
      errors.push('BUY STOP entry must be above the current market price');
    }
    if (orderType === 'stop' && orderSide === 'sell' && entryPrice >= currentPrice) {
      errors.push('SELL STOP entry must be below the current market price');
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
    if (breakevenEnabled && (!Number.isFinite(Number(breakevenTriggerR)) || Number(breakevenTriggerR) <= 0)) {
      errors.push('Breakeven trigger must be greater than 0R');
    }
    if (partialTakeProfitEnabled) {
      const trigger = Number(partialTriggerR);
      const closePercent = Number(partialClosePercent);
      if (!Number.isFinite(trigger) || trigger <= 0) errors.push('Partial take-profit trigger must be greater than 0R');
      if (!Number.isFinite(closePercent) || closePercent <= 0 || closePercent >= 100) {
        errors.push('Partial close percentage must be between 1% and 99%');
      }
      if (riskReward === 'none') {
        errors.push('Partial take profit requires a Take Profit target for the remaining position');
      } else {
        const initialRisk = Math.abs(effectiveEntry - Number(slPrice));
        const targetR = initialRisk > 0 ? Math.abs(Number(tpPrice) - effectiveEntry) / initialRisk : 0;
        if (trigger > 0 && Number.isFinite(trigger) && targetR > 0 && trigger >= targetR) {
          errors.push('Partial take-profit trigger must be reached before the final Take Profit');
        }
      }
    }

    return { errors, isValid: errors.length === 0, effectiveEntry };
  }, [orderSide, entryPrice, slPrice, tpPrice, orderType, currentPrice, riskPercent, maxRisk, riskReward, propFirmEnabled, positions, pendingOrders, breakevenEnabled, breakevenTriggerR, partialTakeProfitEnabled, partialTriggerR, partialClosePercent]);

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
      breakevenTriggerR: Number(breakevenTriggerR),
      partialTakeProfitEnabled,
      partialTriggerR: Number(partialTriggerR),
      partialClosePercent: Number(partialClosePercent),
    });
  };

  const handleCancel = () => {
    clearDraft();
    closeOrderModal();
  };

  // Input step depends on the symbol's precision so the spinner arrows
  // move by 1 point per click.
  const inputStep = precision === 5 ? '0.00001' : precision === 3 ? '0.001' : '0.01';

  return (
    <div className="order-modal-overlay fixed inset-0 bg-black/80 flex items-center justify-center z-[120] p-4">
      <div className="order-modal-shell bg-[#131722] rounded-2xl w-[min(560px,calc(100vw-2rem))] max-w-none border border-[#2a2e39] overflow-hidden max-h-[94vh] flex flex-col">
        <div className="flex justify-between items-center px-3 py-2 border-b border-[#2a2e39]">
          <h2 className="text-base font-bold">Place Order</h2>
          <button onClick={handleCancel} className="p-1 hover:bg-[#2a2e39] rounded"><X size={20}/></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="bg-[#1e222d] mx-3 mt-2 p-2.5 rounded-lg flex justify-between">
            <div>
              <p className="text-[11px] text-gray-400">Estimated Loss</p>
              <p className="text-sm text-red-400 font-bold">${fmtMoney(estimatedLoss)}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-gray-400">Estimated Profit</p>
              <p className="text-sm text-green-400 font-bold">${fmtMoney(estimatedProfit)}</p>
            </div>
          </div>

          <div className="px-3 py-2 space-y-2">
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">
                Risk Percentage {propFirmEnabled && <span className="text-gray-500">(max {maxRisk}%)</span>}
              </label>
              <div
                className="grid gap-1.5"
                style={{ gridTemplateColumns: `repeat(${Math.max(1, riskControlCount)}, minmax(0, 1fr))` }}
              >
                {availableRiskOptions.map(pct => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => { setRiskPercent(pct); setCustomRiskInput(''); }}
                    className={`w-full min-w-0 min-h-[34px] py-1.5 rounded text-xs font-bold ${riskPercent === pct && !customRiskInput ? 'bg-blue-600 text-white' : 'bg-[#1e222d] text-gray-300'}`}
                  >{pct}%</button>
                ))}
                {isCustomPreset && (
                  <label className={`w-full min-w-0 min-h-[34px] flex items-center gap-1 rounded px-2 bg-[#1e222d] border ${customRiskInput ? 'border-blue-500' : 'border-[#2a2e39]'}`}>
                    <input
                      type="number"
                      min="0.01"
                      max={propFirmEnabled ? maxRisk : 100}
                      step="0.1"
                      value={customRiskInput}
                      placeholder="Custom"
                      aria-label="Custom risk percentage"
                      onChange={(e) => { const value = e.target.value; setCustomRiskInput(value); if (value !== '') setRiskPercent(Number(value)); }}
                      className="w-full min-w-0 bg-transparent py-1 text-xs text-white outline-none placeholder:text-gray-500"
                    />
                    <span className="text-[10px] text-gray-400">%</span>
                  </label>
                )}
              </div>
            </div>

            <div className="rounded-lg bg-[#1e222d] px-2.5 py-2 space-y-2">
              <label className="flex items-center gap-2 text-[11px] text-gray-200">
                <input type="checkbox" checked={breakevenEnabled} onChange={(e) => setBreakevenEnabled(e.target.checked)} className="accent-blue-500"/>
                Move Stop Loss to breakeven
              </label>
              {breakevenEnabled && (
                <div className="flex items-center gap-2 pl-5">
                  <label className="text-[10px] text-gray-400 flex-1">Trigger when price reaches</label>
                  <div className="flex items-center gap-1 rounded border border-[#343a49] bg-[#131722] px-2 py-1">
                    <input type="number" min="0.1" step="0.1" value={breakevenTriggerR} onChange={e => setBreakevenTriggerR(e.target.value)} className="w-14 bg-transparent text-right text-xs text-white outline-none"/>
                    <span className="text-[10px] text-gray-400">R</span>
                  </div>
                </div>
              )}
              <div className="border-t border-[#343a49] pt-2 space-y-2">
                <label className="flex items-center gap-2 text-[11px] text-gray-200">
                  <input type="checkbox" checked={partialTakeProfitEnabled} onChange={(e) => setPartialTakeProfitEnabled(e.target.checked)} className="accent-blue-500"/>
                  Take partial profit and let the rest run to TP
                </label>
                {partialTakeProfitEnabled && (
                  <div className="grid grid-cols-2 gap-2 pl-5">
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1">Trigger at</label>
                      <div className="flex items-center gap-1 rounded border border-[#343a49] bg-[#131722] px-2 py-1">
                        <input type="number" min="0.1" step="0.1" value={partialTriggerR} onChange={e => setPartialTriggerR(e.target.value)} className="w-full bg-transparent text-xs text-white outline-none"/>
                        <span className="text-[10px] text-gray-400">R</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1">Close position</label>
                      <div className="flex items-center gap-1 rounded border border-[#343a49] bg-[#131722] px-2 py-1">
                        <input type="number" min="1" max="99" step="1" value={partialClosePercent} onChange={e => setPartialClosePercent(e.target.value)} className="w-full bg-transparent text-xs text-white outline-none"/>
                        <span className="text-[10px] text-gray-400">%</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-gray-400">Side</label>
                <div className={`order-side-label mt-1 px-2.5 py-1.5 rounded text-sm font-bold capitalize ${orderSide === 'buy' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                  {orderSide}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400">Type</label>
                <div className="relative mt-1" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOrderTypeOpen(false); }}>
                  <button
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={orderTypeOpen}
                    onClick={() => setOrderTypeOpen(open => !open)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setOrderTypeOpen(false); }}
                    className="w-full flex items-center justify-between gap-2 rounded-lg border border-[#2a2e39] bg-[#1e222d] px-2.5 py-1.5 text-left text-xs text-gray-200 shadow-sm transition-colors hover:bg-[#252a36] focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <span className="capitalize">{orderType}</span>
                    <ChevronDown size={15} className={`text-gray-400 transition-transform ${orderTypeOpen ? 'rotate-180' : ''}`}/>
                  </button>
                  {orderTypeOpen && (
                    <div role="listbox" aria-label="Order type" className="theme-menu-surface absolute left-0 right-0 top-full z-[150] mt-1 overflow-hidden rounded-lg border border-[#2a2e39] bg-[#1e222d] shadow-2xl">
                      <div className="px-3 py-1.5 border-b border-[#2a2e39] text-[9px] font-bold uppercase text-gray-500 tracking-wide">Order type</div>
                      {[
                        { value: 'market', label: 'Market' },
                        { value: 'limit', label: 'Limit' },
                        { value: 'stop', label: 'Stop' },
                      ].map(option => {
                        const isSelected = orderType === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => { setOrderType(option.value); setOrderTypeOpen(false); }}
                            className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-left text-white hover:bg-[#2a2e39] cursor-pointer ${isSelected ? 'bg-blue-600/15' : ''}`}
                          >
                            <span className={isSelected ? 'font-bold' : ''}>{option.label}</span>
                            {isSelected && <Check size={10} className="text-blue-400" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {orderType === 'market' ? (
              <div className="bg-[#1e222d] px-2.5 py-1.5 rounded text-xs">
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
                  className="w-full mt-1 px-2.5 py-1.5 text-sm bg-[#1e222d] rounded border border-[#2a2e39]" 
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-red-400">Stop Loss</label>
                <input 
                  type="number" 
                  value={slPrice} 
                  step={inputStep}
                  onChange={(e) => setSlPrice(Number(e.target.value))} 
                  className={`w-full mt-1 px-2.5 py-1.5 text-sm bg-[#1e222d] rounded border ${
                    validation.errors.some(e => e.includes('Stop Loss')) ? 'border-red-500' : 'border-[#2a2e39]'
                  }`}
                />
              </div>
              <div>
                <label className="text-[11px] text-green-400">Risk / Reward</label>
                <div className="relative mt-1" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setRiskRewardOpen(false); }}>
                  <button
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={riskRewardOpen}
                    onClick={() => setRiskRewardOpen(open => !open)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setRiskRewardOpen(false); }}
                    className="w-full flex items-center justify-between gap-2 rounded-lg border border-[#2a2e39] bg-[#1e222d] px-3 py-2 text-left text-sm text-gray-200 shadow-sm transition-colors hover:bg-[#252a36] focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <span>{riskReward === 'none' ? 'NONE' : `1:${riskReward}`}</span>
                    <ChevronDown size={15} className={`text-gray-400 transition-transform ${riskRewardOpen ? 'rotate-180' : ''}`}/>
                  </button>
                  {riskRewardOpen && (
                    <div role="listbox" aria-label="Risk / reward ratio" className="theme-menu-surface absolute left-0 right-0 bottom-full z-[150] mb-1 overflow-hidden rounded-lg border border-[#2a2e39] bg-[#1e222d] shadow-2xl">
                      <div className="px-3 py-1.5 border-b border-[#2a2e39] text-[9px] font-bold uppercase text-gray-500 tracking-wide">Risk / Reward</div>
                      {[
                        { value: '1', label: '1:1' },
                        { value: '2', label: '1:2' },
                        { value: '3', label: '1:3' },
                        { value: '4', label: '1:4' },
                        { value: '5', label: '1:5' },
                        ...(riskReward !== 'none' && !['1', '2', '3', '4', '5'].includes(riskReward)
                          ? [{ value: riskReward, label: `1:${riskReward}` }]
                          : []),
                        { value: 'none', label: 'NONE' },
                      ].map(option => {
                        const isSelected = riskReward === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => { setRiskReward(option.value); setRiskRewardOpen(false); }}
                            className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-left text-white hover:bg-[#2a2e39] cursor-pointer ${isSelected ? 'bg-blue-600/15' : ''}`}
                          >
                            <span className={isSelected ? 'font-bold' : ''}>{option.label}</span>
                            {isSelected && <Check size={10} className="text-blue-400" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="mt-1 rounded bg-[#1e222d] px-2 py-1 text-[11px] text-gray-300">
                  TP: <span className="order-tp-value font-mono text-green-400">{riskReward === 'none' ? 'Disabled' : Number(tpPrice || 0).toFixed(precision)}</span>
                </div>
              </div>
            </div>

            {!validation.isValid && (
              <div className="bg-red-900/30 border border-red-700 rounded-lg p-2 space-y-1">
                {validation.errors.map((err, i) => (
                  <div key={i} className="flex items-center gap-2 text-red-400 text-[10px]">
                    <AlertTriangle size={14} />
                    <span>{err}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-3 py-2 flex gap-2 border-t border-[#2a2e39]">
          <button onClick={handleCancel} className="flex-1 py-1.5 bg-[#2a2e39] rounded font-bold text-xs">Cancel</button>
          <button 
            onClick={handleSubmit} 
            disabled={!validation.isValid}
            className={`flex-1 py-1.5 rounded font-bold text-xs ${
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