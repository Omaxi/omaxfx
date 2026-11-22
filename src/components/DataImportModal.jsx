import { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, FileText, AlertTriangle, FolderOpen, RefreshCw, ChevronDown } from 'lucide-react';
import { parseMarketCsv } from '../utils/marketData';
import { fetchDataCatalog, loadBundledCsvFiles } from '../utils/dataCatalog';
import { useStore } from '../store';

const UTC_PLUS_3_SECONDS = 3 * 60 * 60;

function defaultSpecs(symbol) {
  const code = symbol.toUpperCase();
  if (code === 'XAUUSD') return { contractSize: 100, tickSize: 0.01, precision: 2 };
  if (code === 'EURUSD' || code.endsWith('USD') && code.length === 6) return { contractSize: 100000, tickSize: 0.00001, precision: 5 };
  if (code.includes('JPY')) return { contractSize: 100000, tickSize: 0.001, precision: 3 };
  return { contractSize: 1, tickSize: 0.01, precision: 2 };
}

function StyledSelect({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = options.find(option => String(option.value) === String(value));
  useEffect(() => {
    if (!open) return undefined;
    const close = event => {
      if (event.type === 'keydown' && event.key === 'Escape') setOpen(false);
      if (event.type === 'pointerdown' && rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  return (
    <div ref={rootRef} className="relative mt-1 w-full">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(current => !current)} className="flex h-11 w-full items-center justify-between rounded-lg border border-[#303846] bg-[#1e222d] px-3 text-left text-sm font-semibold text-white transition-colors hover:border-[#46536a] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15">
        <span className="truncate">{selected?.label ?? value}</span>
        <ChevronDown size={16} className={'ml-3 shrink-0 text-gray-400 transition-transform ' + (open ? 'rotate-180' : '')} />
      </button>
      {open && <div role="listbox" className="absolute left-0 top-[calc(100%+6px)] z-[9999] max-h-60 w-full overflow-y-auto rounded-lg border border-[#343b49] bg-[#1e222d] p-1 shadow-2xl">
        {options.map(option => <button key={String(option.value)} type="button" role="option" aria-selected={String(option.value) === String(value)} onClick={() => { onChange(option.value); setOpen(false); }} className={'flex min-h-9 w-full items-center rounded-md px-3 py-2 text-left text-sm transition-colors ' + (String(option.value) === String(value) ? 'bg-[#273449] font-semibold text-white' : 'text-gray-300 hover:bg-[#2a2e39] hover:text-white')}>
          {option.label}
        </button>)}
      </div>}
    </div>
  );
}
export default function DataImportModal() {
  const [open, setOpen] = useState(true);
  const [file, setFile] = useState(null);
  const [customParsed, setCustomParsed] = useState(null);
  const [customMonth, setCustomMonth] = useState('__ALL__');
  const [symbol, setSymbol] = useState('CUSTOM');
  const [contractSize, setContractSize] = useState('1');
  const [tickSize, setTickSize] = useState('0.01');
  const [precision, setPrecision] = useState('2');
  const [quoteCurrency, setQuoteCurrency] = useState('USD');
  const [quoteToAccountRate, setQuoteToAccountRate] = useState('1');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [catalog, setCatalog] = useState([]);
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('__ALL__');
  const [catalogError, setCatalogError] = useState('');
  const [status, setStatus] = useState({ loading: false, error: '' });
  const [source, setSource] = useState('folder');

  useEffect(() => {
    let alive = true;
    fetchDataCatalog().then(files => {
      if (!alive) return;
      const sorted = [...files].sort((a, b) => a.symbol.localeCompare(b.symbol) || (a.year ?? 0) - (b.year ?? 0) || a.name.localeCompare(b.name));
      setCatalog(sorted);
      const firstSymbol = [...new Set(sorted.map(item => item.symbol))].sort()[0] || '';
      setSelectedSymbol(firstSymbol);
      const group = sorted.filter(item => item.symbol === firstSymbol);
      setSelectedFileName(group.length > 1 ? '__ALL__' : group[0]?.name || '');
      const latestMonth = group.flatMap(item => (item.monthlyFiles || []).map(month => `${month.year}-${month.month}`)).sort().at(-1);
      setSelectedMonth(latestMonth || '__ALL__');
    }).catch(error => { if (alive) setCatalogError(error?.message || 'Could not read the project data folder.'); });
    return () => { alive = false; };
  }, []);

  const symbols = useMemo(() => [...new Set(catalog.map(item => item.symbol))].sort(), [catalog]);
  const symbolFiles = useMemo(() => catalog.filter(item => item.symbol === selectedSymbol), [catalog, selectedSymbol]);
  const selectedYearFiles = selectedFileName === '__ALL__' ? symbolFiles : symbolFiles.filter(item => item.name === selectedFileName);
  const availableMonths = [...new Set(selectedYearFiles.flatMap(item => (item.monthlyFiles || []).map(month => `${month.year}-${month.month}`)))].sort();
  const selectedFiles = selectedMonth === '__ALL__'
    ? selectedYearFiles
    : selectedYearFiles.flatMap(item => item.monthlyFiles || []).filter(item => `${item.year}-${item.month}` === selectedMonth);

  const customMonths = useMemo(() => {
    if (!customParsed?.candles?.length) return [];
    const months = new Set();
    customParsed.candles.forEach(candle => {
      const normalizedTime = Number(candle.time) - (customParsed.timestampsAreUtc ? 0 : UTC_PLUS_3_SECONDS);
      const marketDate = new Date((normalizedTime + UTC_PLUS_3_SECONDS) * 1000);
      if (Number.isFinite(marketDate.getTime())) months.add(`${marketDate.getUTCFullYear()}-${String(marketDate.getUTCMonth() + 1).padStart(2, '0')}`);
    });
    return [...months].sort();
  }, [customParsed]);

  const openBacktestSetup = (code, candles, spec) => {
    if (!candles?.length) throw new Error('This CSV contains no valid market candles.');
    useStore.getState().setCustomSymbolData(code, candles, spec);
    useStore.getState().openPeriodModal();
    setOpen(false);
  };

  const loadFolderData = async () => {
    if (!selectedFiles.length) {
      setStatus({ loading: false, error: 'Choose a CSV dataset first.' });
      return;
    }
    setStatus({ loading: true, error: '', progress: 0, fileName: selectedFiles[0]?.name || '' });
    try {
      const result = await loadBundledCsvFiles(selectedFiles, (progress) => {
        setStatus((current) => ({ ...current, progress: progress.percent ?? current.progress, fileName: progress.file || current.fileName, stage: progress.stage || current.stage }));
      });
      const specs = defaultSpecs(result.symbol);
      openBacktestSetup(result.symbol, result.candles, { ...specs, quoteCurrency: 'USD', quoteToAccountRate: 1 });
    } catch (error) {
      setStatus({ loading: false, error: error?.message || 'Unable to load this dataset.' });
    }
  };

  const handleCustomFile = async (selectedFile) => {
    setFile(selectedFile);
    setCustomParsed(null);
    setCustomMonth('__ALL__');
    if (!selectedFile) return;
    setStatus({ loading: true, error: '', progress: 0, fileName: selectedFile.name, stage: 'parsing' });
    try {
      const parsed = await parseMarketCsv(selectedFile, progress => {
        setStatus(current => ({ ...current, progress: progress.percent ?? current.progress, stage: 'parsing' }));
      });
      setCustomParsed(parsed);
      const months = new Set(parsed.candles.map(candle => {
        const normalizedTime = Number(candle.time) - (parsed.timestampsAreUtc ? 0 : UTC_PLUS_3_SECONDS);
        const marketDate = new Date((normalizedTime + UTC_PLUS_3_SECONDS) * 1000);
        return `${marketDate.getUTCFullYear()}-${String(marketDate.getUTCMonth() + 1).padStart(2, '0')}`;
      }));
      setCustomMonth([...months].sort().at(-1) || '__ALL__');
      setStatus({ loading: false, error: '', progress: 100, fileName: selectedFile.name, stage: 'complete' });
    } catch (error) {
      setStatus({ loading: false, error: error?.message || 'Unable to read this CSV file.' });
    }
  };

  const submitCustom = async () => {
    if (!file) { setStatus({ loading: false, error: 'Choose your CSV file first.' }); return; }
    const code = symbol.trim().toUpperCase().replace(/[^A-Z0-9._-]/g, '').slice(0, 20);
    if (!code) { setStatus({ loading: false, error: 'Enter a symbol for this CSV.' }); return; }
    if (!(Number(contractSize) > 0) || !(Number(tickSize) > 0) || !(Number(quoteToAccountRate) > 0)) {
      setStatus({ loading: false, error: 'Instrument settings must be greater than zero.' }); return;
    }
    setStatus({ loading: true, error: '', progress: 0, fileName: file.name });
    try {
      const parsed = customParsed || await parseMarketCsv(file, (progress) => {
        setStatus((current) => ({ ...current, progress: progress.percent ?? current.progress }));
      });
      const candles = parsed.candles
        .map(candle => ({ ...candle, time: candle.time - (parsed.timestampsAreUtc ? 0 : UTC_PLUS_3_SECONDS) }))
        .filter(candle => {
          if (customMonth === '__ALL__') return true;
          const marketDate = new Date((Number(candle.time) + UTC_PLUS_3_SECONDS) * 1000);
          return `${marketDate.getUTCFullYear()}-${String(marketDate.getUTCMonth() + 1).padStart(2, '0')}` === customMonth;
        });
      if (candles.length < 2) throw new Error(`The selected month (${customMonth}) contains fewer than two valid candles. Choose another month or Full dataset.`);
      openBacktestSetup(code, candles, {
        contractSize: Number(contractSize), tickSize: Number(tickSize), precision: Number(precision),
        quoteCurrency: quoteCurrency.trim().toUpperCase(), quoteToAccountRate: Number(quoteToAccountRate),
      });
    } catch (error) {
      setStatus({ loading: false, error: error?.message || 'Unable to import this CSV.' });
    }
  };

  if (!open) return null;

  const inputClass = 'mt-1 w-full rounded-lg border border-[#303846] bg-[#0b0e11] px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500';
  const buttonClass = 'w-full rounded-lg bg-blue-600 hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 px-4 py-3 text-sm font-bold text-white';

  return (
    <div className="fixed inset-0 z-[150] bg-black/85 backdrop-blur-sm flex items-center justify-center p-3">
      <div className="relative w-full max-w-lg bg-[#131722] border border-[#2a2e39] rounded-2xl shadow-2xl overflow-visible">
        <div className="flex items-center gap-3 border-b border-[#2a2e39] p-4">
          <div className="rounded-xl bg-blue-500/15 p-2"><Upload size={20} className="text-blue-400"/></div>
          <div><h2 className="font-bold text-white">Load market data</h2><p className="text-xs text-gray-400">Choose a dataset to open the backtest setup · timestamps UTC+3</p></div>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 rounded-lg bg-[#0b0e11] p-1">
            <button onClick={() => { setSource('folder'); setStatus({ loading: false, error: '' }); }} className={`rounded-md px-3 py-2 text-sm font-semibold ${source === 'folder' ? 'bg-[#273449] text-white' : 'text-gray-400'}`}>Existing data</button>
            <button onClick={() => { setSource('custom'); setStatus({ loading: false, error: '' }); }} className={`rounded-md px-3 py-2 text-sm font-semibold ${source === 'custom' ? 'bg-[#273449] text-white' : 'text-gray-400'}`}>Import CSV</button>
          </div>

          {source === 'folder' ? (
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-white"><FolderOpen size={16} className="text-emerald-400"/> Project data folder </div>
              {symbols.length ? <>
                <label className="block text-xs text-gray-400">Symbol
                  <StyledSelect value={selectedSymbol} onChange={code => {
                    setSelectedSymbol(code);
                    const group = catalog.filter(item => item.symbol === code);
                    setSelectedFileName(group.length > 1 ? '__ALL__' : group[0]?.name || '');
                    const latestMonth = group.flatMap(item => (item.monthlyFiles || []).map(month => `${month.year}-${month.month}`)).sort().at(-1);
                    setSelectedMonth(latestMonth || '__ALL__');
                  }} options={symbols.map(code => ({ value: code, label: code }))}/>
                </label>
                <label className="block text-xs text-gray-400">CSV dataset
                  <StyledSelect value={selectedFileName} onChange={setSelectedFileName} options={[
                    ...(symbolFiles.length > 1 ? [{ value: '__ALL__', label: 'All available years (combined)' }] : []),
                    ...symbolFiles.map(item => ({ value: item.name, label: item.name })),
                  ]}/>
                </label>
                <label className="block text-xs text-gray-400">Month
                  <StyledSelect value={selectedMonth} onChange={setSelectedMonth} options={[
                    { value: '__ALL__', label: 'Full dataset (all months)' },
                    ...availableMonths.map(month => ({ value: month, label: new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' }) })),
                  ]}/>
                </label>
                <p className="text-[11px] text-gray-500">Choose a month to download and parse only that month. Full dataset loads every available year.</p>
                <button className={buttonClass} disabled={status.loading || !selectedFiles.length} onClick={loadFolderData}>
                  {status.loading ? <span className="inline-flex items-center gap-2"><RefreshCw size={15} className="animate-spin"/> Loading data… {status.progress || 0}%</span> : 'Load data and continue'}
                </button>
                {status.loading && (
                  <div className="space-y-1" aria-live="polite">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#202938]">
                      <div className="h-full rounded-full bg-blue-500 transition-[width] duration-200" style={{ width: `${status.progress || 0}%` }} />
                    </div>
                    <p className="text-[10px] text-gray-500">{status.stage === 'downloading' ? 'Downloading' : 'Parsing'} {status.fileName || 'CSV data'} · {status.progress || 0}%</p>
                  </div>
                )}
              </> : <div className="rounded-lg border border-dashed border-[#3b4554] p-4 text-center text-sm text-gray-400">
                {catalogError || 'No CSV files found in public/data/.'}
                <p className="mt-2 text-xs">Add CSV files to public/data/ and restart the app.</p>
              </div>}
            </section>
          ) : (
            <section className="space-y-3">
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[#465064] bg-[#0b0e11] p-4 hover:border-blue-500">
                <FileText size={24} className="shrink-0 text-blue-400"/>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white">{file?.name || 'Choose your CSV file'}</span><span className="mt-1 block text-[11px] text-gray-500">Date/time, Open, High, Low, Close · Volume optional</span></span>
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={event => { handleCustomFile(event.target.files?.[0] || null); }}/>
              </label>
              {file && customParsed && <label className="block text-xs text-gray-400">Month to import
                <StyledSelect value={customMonth} onChange={setCustomMonth} options={[
                  { value: '__ALL__', label: 'Full dataset (all months)' },
                  ...customMonths.map(month => ({ value: month, label: new Date(Number(month.slice(0,4)), Number(month.slice(5,7)) - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' }) })),
                ]}/>
              </label>}
              {file && status.loading && <p className="text-[10px] text-gray-500">Scanning CSV dates to find available months…</p>}
              <label className="block text-xs text-gray-400">Symbol (e.g. XAUUSD, EURUSD, NAS100)
                <input className={inputClass} value={symbol} onChange={event => {
                  const code = event.target.value;
                  setSymbol(code);
                  const specs = defaultSpecs(code);
                  setContractSize(String(specs.contractSize)); setTickSize(String(specs.tickSize)); setPrecision(String(specs.precision));
                }} placeholder="Enter symbol"/>
              </label>
              <button type="button" onClick={() => setShowAdvanced(value => !value)} className="flex w-full items-center gap-2 text-xs text-gray-400 hover:text-white">
                <ChevronDown size={14} className={showAdvanced ? 'rotate-180' : ''}/> Instrument settings {showAdvanced ? '(hide)' : '(optional)'}
              </button>
              {showAdvanced && <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-gray-400">Contract size<input type="number" min="0.000001" step="any" value={contractSize} onChange={event => setContractSize(event.target.value)} className={inputClass}/></label>
                <label className="text-xs text-gray-400">Tick size<input type="number" min="0.00000001" step="any" value={tickSize} onChange={event => setTickSize(event.target.value)} className={inputClass}/></label>
                <label className="text-xs text-gray-400">Price decimals<input type="number" min="0" max="10" value={precision} onChange={event => setPrecision(event.target.value)} className={inputClass}/></label>
                <label className="text-xs text-gray-400">Quote currency<input value={quoteCurrency} onChange={event => setQuoteCurrency(event.target.value.toUpperCase())} className={inputClass}/></label>
                <label className="col-span-2 text-xs text-gray-400">Quote → account FX<input type="number" min="0.000001" step="any" value={quoteToAccountRate} onChange={event => setQuoteToAccountRate(event.target.value)} className={inputClass}/></label>
              </div>}
              <button className={buttonClass} disabled={status.loading || !file || !customParsed} onClick={submitCustom}>
                {status.loading ? <span className="inline-flex items-center gap-2"><RefreshCw size={15} className="animate-spin"/> Importing CSV… {status.progress || 0}%</span> : 'Import CSV and continue'}
              </button>
              {status.loading && (
                <div className="space-y-1" aria-live="polite">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#202938]">
                    <div className="h-full rounded-full bg-blue-500 transition-[width] duration-200" style={{ width: `${status.progress || 0}%` }} />
                  </div>
                  <p className="text-[10px] text-gray-500">Processing {status.fileName || 'CSV data'} · {status.progress || 0}%</p>
                </div>
              )}
            </section>
          )}

          {status.error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-800 bg-red-950/50 p-3 text-xs text-red-300"><AlertTriangle size={15} className="mt-0.5 shrink-0"/><span>{status.error}</span></div>}
        </div>
      </div>
    </div>
  );
}
