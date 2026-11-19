import { useState } from 'react';
import { Upload, FileText, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { parseMarketCsv } from '../utils/marketData';
import { useStore } from '../store';

export default function DataImportModal() {
  const [open, setOpen] = useState(true);
  const [file, setFile] = useState(null);
  const [symbol, setSymbol] = useState('CUSTOM');
  const [contractSize, setContractSize] = useState('1');
  const [tickSize, setTickSize] = useState('0.01');
  const [precision, setPrecision] = useState('2');
  const [quoteCurrency, setQuoteCurrency] = useState('USD');
  const [quoteToAccountRate, setQuoteToAccountRate] = useState('1');
  const [status, setStatus] = useState({ loading: false, error: '', result: null });

  const submit = async () => {
    if (!file) { setStatus({ loading: false, error: 'Choose a CSV file first.', result: null }); return; }
    if (!symbol.trim()) { setStatus({ loading: false, error: 'Enter an instrument symbol.', result: null }); return; }
    if (!(Number(contractSize) > 0) || !(Number(tickSize) > 0)) {
      setStatus({ loading: false, error: 'Contract size and tick size must be greater than zero.', result: null }); return;
    }
    setStatus({ loading: true, error: '', result: null });
    try {
      const parsed = await parseMarketCsv(file);
      const code = symbol.trim().toUpperCase().replace(/[^A-Z0-9._-]/g, '').slice(0, 20);
      useStore.getState().setCustomSymbolData(code, parsed.candles, {
        contractSize: Number(contractSize), tickSize: Number(tickSize),
        precision: Number(precision), quoteCurrency, quoteToAccountRate: Number(quoteToAccountRate),
      });
      setStatus({ loading: false, error: '', result: { ...parsed, symbol: code } });
      setOpen(false);
    } catch (error) {
      setStatus({ loading: false, error: error?.message || 'Unable to import this CSV.', result: null });
    }
  };

  if (!open) return (
    <button onClick={() => setOpen(true)} className="fixed top-2 left-1/2 -translate-x-1/2 z-40 px-3 py-1.5 rounded-lg border border-[#3b82f6]/50 bg-[#131722] text-blue-300 text-xs font-semibold shadow-lg">
      Import another dataset
    </button>
  );

  return (
    <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[#131722] border border-[#2a2e39] rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-[#2a2e39]">
          <div className="flex items-center gap-2"><Upload size={18} className="text-blue-400"/><div><h2 className="font-bold text-white">Import market data</h2><p className="text-[11px] text-gray-400">Load your own symbol and historical candles</p></div></div>
          <button onClick={() => { setOpen(false); useStore.getState().openPeriodModal(); }} className="p-2 rounded hover:bg-[#2a2e39]" title="Close"><X size={17}/></button>
        </div>
        <div className="p-4 space-y-3">
          <label className="block text-xs text-gray-400">CSV file</label>
          <label className="flex items-center gap-3 p-4 border border-dashed border-[#465064] rounded-xl bg-[#0b0e11] cursor-pointer hover:border-blue-500">
            <FileText className="text-blue-400" size={22}/>
            <span className="min-w-0 flex-1"><span className="block text-sm text-white truncate">{file?.name || 'Choose a CSV file'}</span><span className="block text-[10px] text-gray-500">Date/time + Open, High, Low, Close; Volume optional</span></span>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={e => { setFile(e.target.files?.[0] || null); setStatus({ loading:false,error:'',result:null }); }}/>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-gray-400">Symbol<input value={symbol} onChange={e=>setSymbol(e.target.value)} placeholder="e.g. NAS100" className="mt-1 w-full p-2 rounded bg-[#0b0e11] border border-[#2a2e39] text-white text-sm"/></label>
            <label className="text-xs text-gray-400">Quote currency<input value={quoteCurrency} onChange={e=>setQuoteCurrency(e.target.value.toUpperCase())} placeholder="USD" className="mt-1 w-full p-2 rounded bg-[#0b0e11] border border-[#2a2e39] text-white text-sm"/></label>
            <label className="text-xs text-gray-400">Contract size (units / lot)<input type="number" min="0.000001" step="any" value={contractSize} onChange={e=>setContractSize(e.target.value)} className="mt-1 w-full p-2 rounded bg-[#0b0e11] border border-[#2a2e39] text-white text-sm"/></label>
            <label className="text-xs text-gray-400">Tick size<input type="number" min="0.00000001" step="any" value={tickSize} onChange={e=>setTickSize(e.target.value)} className="mt-1 w-full p-2 rounded bg-[#0b0e11] border border-[#2a2e39] text-white text-sm"/></label>
            <label className="text-xs text-gray-400">Price decimal places<input type="number" min="0" max="10" value={precision} onChange={e=>setPrecision(e.target.value)} className="mt-1 w-full p-2 rounded bg-[#0b0e11] border border-[#2a2e39] text-white text-sm"/></label>
            <label className="text-xs text-gray-400">Quote → account FX rate<input type="number" min="0.000001" step="any" value={quoteToAccountRate} onChange={e=>setQuoteToAccountRate(e.target.value)} className="mt-1 w-full p-2 rounded bg-[#0b0e11] border border-[#2a2e39] text-white text-sm"/></label>
          </div>
          <p className="text-[10px] leading-relaxed text-gray-500">Contract size, tick size and quote-to-account FX rate are broker/instrument-specific. Confirm these values against your data provider; OHLC prices alone cannot safely infer them.</p>
          {status.error && <div className="flex gap-2 p-3 rounded-lg bg-red-950/50 border border-red-800 text-red-300 text-xs"><AlertTriangle size={15}/>{status.error}</div>}
          {status.result && <div className="flex gap-2 p-3 rounded-lg bg-green-950/40 border border-green-800 text-green-300 text-xs"><CheckCircle2 size={15}/>{status.result.symbol}: {status.result.candles.length.toLocaleString()} candles imported. {status.result.invalidRows} invalid and {status.result.duplicateRows} duplicate rows skipped.</div>}
        </div>
        <div className="flex gap-2 p-4 border-t border-[#2a2e39]">
          <button onClick={()=>{setOpen(false);useStore.getState().openPeriodModal();}} className="flex-1 py-2 rounded-lg bg-[#2a2e39] text-gray-300 text-sm">Close</button>
          <button disabled={status.loading} onClick={submit} className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm">{status.loading ? 'Importing…' : 'Import data'}</button>
        </div>
      </div>
    </div>
  );
}
