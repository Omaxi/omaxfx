import { useEffect, useMemo, useState } from 'react';
import { Upload, FileText, X, AlertTriangle, CheckCircle2, FolderOpen, RefreshCw } from 'lucide-react';
import { parseMarketCsv } from '../utils/marketData';
import { fetchDataCatalog, loadBundledCsvFiles } from '../utils/dataCatalog';
import { useStore } from '../store';

const UTC_PLUS_3_SECONDS = 3 * 60 * 60;

export default function DataImportModal() {
  const [open, setOpen] = useState(true);
  const [file, setFile] = useState(null);
  const [symbol, setSymbol] = useState('CUSTOM');
  const [contractSize, setContractSize] = useState('1');
  const [tickSize, setTickSize] = useState('0.01');
  const [precision, setPrecision] = useState('2');
  const [quoteCurrency, setQuoteCurrency] = useState('USD');
  const [quoteToAccountRate, setQuoteToAccountRate] = useState('1');
  const [catalog, setCatalog] = useState([]);
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [selectedFileNames, setSelectedFileNames] = useState([]);
  const [catalogError, setCatalogError] = useState('');
  const [folderProgress, setFolderProgress] = useState(null);
  const [status, setStatus] = useState({ loading: false, error: '', result: null });

  useEffect(() => {
    let alive = true;
    fetchDataCatalog().then(files => {
      if (!alive) return;
      setCatalog(files);
      const available = [...new Set(files.map(file => file.symbol))].sort();
      const firstSymbol = available[0] || '';
      setSelectedSymbol(firstSymbol);
      const firstGroup = files.filter(file => file.symbol === firstSymbol);
      setSelectedFileNames(firstGroup.length ? [firstGroup[firstGroup.length - 1].name] : []);
    }).catch(error => {
      if (alive) setCatalogError(error.message);
    });
    return () => { alive = false; };
  }, []);

  const symbols = useMemo(() => [...new Set(catalog.map(file => file.symbol))].sort(), [catalog]);
  const symbolFiles = useMemo(() => catalog.filter(file => file.symbol === selectedSymbol), [catalog, selectedSymbol]);
  const selectedFiles = useMemo(() => symbolFiles.filter(file => selectedFileNames.includes(file.name)), [symbolFiles, selectedFileNames]);

  const registerData = (code, candles, spec) => {
    useStore.getState().setCustomSymbolData(code, candles, spec);
    useStore.getState().openPeriodModal();
    setOpen(false);
  };

  const loadFolderData = async () => {
    if (!selectedFiles.length) {
      setStatus({ loading: false, error: 'Select a symbol from the data folder.', result: null });
      return;
    }
    setStatus({ loading: true, error: '', result: null });
    setFolderProgress({ completed: 0, total: selectedFiles.length, file: '' });
    try {
      const result = await loadBundledCsvFiles(selectedFiles, setFolderProgress);
      const code = result.symbol;
      const defaults = code === 'XAUUSD'
        ? { contractSize: 100, tickSize: 0.01, precision: 2 }
        : code === 'EURUSD'
          ? { contractSize: 100000, tickSize: 0.0001, precision: 5 }
          : { contractSize: 1, tickSize: 0.01, precision: 2 };
      registerData(code, result.candles, {
        ...defaults, quoteCurrency: 'USD', quoteToAccountRate: 1,
      });
      setStatus({ loading: false, error: '', result });
    } catch (error) {
      setStatus({ loading: false, error: error?.message || 'Unable to load local data.', result: null });
    } finally {
      setFolderProgress(null);
    }
  };

  const submit = async () => {
    if (!file) { setStatus({ loading: false, error: 'Choose a CSV file first.', result: null }); return; }
    if (!symbol.trim()) { setStatus({ loading: false, error: 'Enter an instrument symbol.', result: null }); return; }
    if (!(Number(contractSize) > 0) || !(Number(tickSize) > 0) || !(Number(quoteToAccountRate) > 0)) {
      setStatus({ loading: false, error: 'Contract size, tick size and quote-to-account rate must be greater than zero.', result: null }); return;
    }
    setStatus({ loading: true, error: '', result: null });
    try {
      const parsed = await parseMarketCsv(file);
      parsed.candles = parsed.candles.map(candle => ({ ...candle, time: candle.time - (parsed.timestampsAreUtc ? 0 : UTC_PLUS_3_SECONDS) }));
      const code = symbol.trim().toUpperCase().replace(/[^A-Z0-9._-]/g, '').slice(0, 20);
      registerData(code, parsed.candles, {
        contractSize: Number(contractSize), tickSize: Number(tickSize),
        precision: Number(precision), quoteCurrency, quoteToAccountRate: Number(quoteToAccountRate),
      });
      setStatus({ loading: false, error: '', result: { ...parsed, symbol: code } });
    } catch (error) {
      setStatus({ loading: false, error: error?.message || 'Unable to import this CSV.', result: null });
    }
  };

  if (!open) return (
    <button onClick={() => setOpen(true)} className="fixed top-2 left-1/2 -translate-x-1/2 z-40 px-3 py-1.5 rounded-lg border border-[#3b82f6]/50 bg-[#131722] text-blue-300 text-xs font-semibold shadow-lg">
      Import / Load market data
    </button>
  );

  return (
    <div className="fixed inset-0 z-[150] bg-black/85 backdrop-blur-sm flex items-center justify-center p-3">
      <div className="w-full max-w-2xl max-h-[94dvh] bg-[#131722] border border-[#2a2e39] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-3 border-b border-[#2a2e39] shrink-0">
          <div className="flex items-center gap-2"><Upload size={18} className="text-blue-400"/><div><h2 className="font-bold text-white">Market data</h2><p className="text-[11px] text-gray-400">Offline data folder or custom CSV import · all timestamps UTC+3</p></div></div>
          <button onClick={() => { setOpen(false); useStore.getState().openPeriodModal(); }} className="p-2 rounded hover:bg-[#2a2e39]" title="Close"><X size={17}/></button>
        </div>
        <div className="p-3 space-y-3 overflow-y-auto min-h-0">
          <section className="rounded-xl border border-[#2a2e39] bg-[#0e121a] p-3 space-y-2">
            <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2 text-sm font-bold"><FolderOpen size={15} className="text-emerald-400"/> Project data folder</div><span className="text-[10px] text-gray-500">{catalog.length} CSV files</span></div>
            <p className="text-[10px] text-gray-500">Place CSV files in <code>public/data/</code>. Restart the app or rebuild after adding files. Yearly files with the same symbol are combined automatically.</p>
            {catalogError && <p className="text-xs text-amber-300">{catalogError}</p>}
            {symbols.length > 0 ? (
              <>
                <label className="block text-[10px] text-gray-400">Symbol
                  <select value={selectedSymbol} onChange={event => {
                    const code = event.target.value;
                    setSelectedSymbol(code);
                    const group = catalog.filter(file => file.symbol === code);
                    setSelectedFileNames(group.length ? [group[group.length - 1].name] : []);
                  }} className="mt-1 w-full p-2 rounded bg-[#0b0e11] border border-[#2a2e39] text-white text-xs">
                    {symbols.map(code => <option key={code} value={code}>{code}</option>)}
                  </select>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {symbolFiles.map(item => {
                    const checked = selectedFileNames.includes(item.name);
                    return <label key={item.name} className={`flex items-center gap-2 rounded-lg border px-2 py-2 text-[10px] cursor-pointer ${checked ? 'border-blue-500 bg-blue-950/30 text-white' : 'border-[#2a2e39] text-gray-400'}`}>
                      <input type="checkbox" checked={checked} onChange={event => setSelectedFileNames(current => event.target.checked ? [...current, item.name] : current.filter(name => name !== item.name))}/>
                      <span className="truncate">{item.name}</span>
                    </label>;
                  })}
                </div>
                <button disabled={status.loading || !selectedFiles.length} onClick={loadFolderData} className="w-full py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2">
                  {status.loading && folderProgress ? <RefreshCw size={13} className="animate-spin"/> : <FolderOpen size={13}/>}
                  {folderProgress ? `Loading ${folderProgress.completed}/${folderProgress.total}: ${folderProgress.file}` : `Load selected data (${selectedFiles.length} files)`}
                </button>
              </>
            ) : <p className="text-xs text-gray-500">No bundled CSVs found. Add files to public/data/ and restart.</p>}
          </section>

          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-gray-500"><span className="h-px bg-[#2a2e39] flex-1"/><span>Or import a CSV file</span><span className="h-px bg-[#2a2e39] flex-1"/></div>
          <section className="space-y-2">
            <label className="flex items-center gap-3 p-3 border border-dashed border-[#465064] rounded-xl bg-[#0b0e11] cursor-pointer hover:border-blue-500">
              <FileText className="text-blue-400" size={22}/>
              <span className="min-w-0 flex-1"><span className="block text-sm text-white truncate">{file?.name || 'Choose a CSV file'}</span><span className="block text-[10px] text-gray-500">Date/time + Open, High, Low, Close; Volume optional · UTC+3</span></span>
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={e => { setFile(e.target.files?.[0] || null); setStatus({ loading:false,error:'',result:null }); }}/>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <label className="text-[10px] text-gray-400">Symbol<input value={symbol} onChange={e=>setSymbol(e.target.value)} placeholder="e.g. NAS100" className="mt-1 w-full p-2 rounded bg-[#0b0e11] border border-[#2a2e39] text-white text-xs"/></label>
              <label className="text-[10px] text-gray-400">Contract size<input type="number" min="0.000001" step="any" value={contractSize} onChange={e=>setContractSize(e.target.value)} className="mt-1 w-full p-2 rounded bg-[#0b0e11] border border-[#2a2e39] text-white text-xs"/></label>
              <label className="text-[10px] text-gray-400">Tick size<input type="number" min="0.00000001" step="any" value={tickSize} onChange={e=>setTickSize(e.target.value)} className="mt-1 w-full p-2 rounded bg-[#0b0e11] border border-[#2a2e39] text-white text-xs"/></label>
              <label className="text-[10px] text-gray-400">Price decimals<input type="number" min="0" max="10" value={precision} onChange={e=>setPrecision(e.target.value)} className="mt-1 w-full p-2 rounded bg-[#0b0e11] border border-[#2a2e39] text-white text-xs"/></label>
              <label className="text-[10px] text-gray-400">Quote currency<input value={quoteCurrency} onChange={e=>setQuoteCurrency(e.target.value.toUpperCase())} className="mt-1 w-full p-2 rounded bg-[#0b0e11] border border-[#2a2e39] text-white text-xs"/></label>
              <label className="text-[10px] text-gray-400">Quote → account FX<input type="number" min="0.000001" step="any" value={quoteToAccountRate} onChange={e=>setQuoteToAccountRate(e.target.value)} className="mt-1 w-full p-2 rounded bg-[#0b0e11] border border-[#2a2e39] text-white text-xs"/></label>
            </div>
          </section>
          {status.error && <div className="flex gap-2 p-2 rounded-lg bg-red-950/50 border border-red-800 text-red-300 text-xs"><AlertTriangle size={15}/>{status.error}</div>}
          {status.result && <div className="flex gap-2 p-2 rounded-lg bg-green-950/40 border border-green-800 text-green-300 text-xs"><CheckCircle2 size={15}/>{status.result.symbol}: {status.result.candles?.length?.toLocaleString()} candles ready.</div>}
        </div>
        <div className="flex gap-2 p-3 border-t border-[#2a2e39] shrink-0">
          <button onClick={()=>{setOpen(false);useStore.getState().openPeriodModal();}} className="flex-1 py-2 rounded-lg bg-[#2a2e39] text-gray-300 text-sm">Close</button>
          <button disabled={status.loading} onClick={submit} className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm">{status.loading ? 'Importing…' : 'Import custom CSV'}</button>
        </div>
      </div>
    </div>
  );
}
