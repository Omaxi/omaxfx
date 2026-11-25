import { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, FileText, AlertTriangle, RefreshCw, ChevronDown, CheckCircle2 } from 'lucide-react';
import { inferSymbolFromFilename, parseMarketCsv } from '../utils/marketData';
import { useStore } from '../store';

const UTC_PLUS_3_SECONDS = 3 * 60 * 60;

function defaultSpecs(symbol) {
  const code = String(symbol || '').toUpperCase();
  if (code === 'XAUUSD') return { contractSize: 100, tickSize: 0.01, precision: 2 };
  if (code === 'XAGUSD') return { contractSize: 5000, tickSize: 0.001, precision: 3 };
  if (code.endsWith('JPY') && code.length === 6) return { contractSize: 100000, tickSize: 0.001, precision: 3 };
  if (/^[A-Z]{6}$/.test(code)) return { contractSize: 100000, tickSize: 0.00001, precision: 5 };
  if (/^(NAS100|US30|SPX500|GER40|UK100|JP225)$/.test(code)) return { contractSize: 1, tickSize: 0.1, precision: 1 };
  if (/^(BTC|ETH)/.test(code)) return { contractSize: 1, tickSize: 0.01, precision: 2 };
  return { contractSize: 1, tickSize: 0.00001, precision: 5 };
}

function marketMonth(candle, timestampsAreUtc) {
  const normalizedTime = Number(candle.time) - (timestampsAreUtc ? 0 : UTC_PLUS_3_SECONDS);
  const marketDate = new Date((normalizedTime + UTC_PLUS_3_SECONDS) * 1000);
  return Number.isFinite(marketDate.getTime())
    ? marketDate.getUTCFullYear() + '-' + String(marketDate.getUTCMonth() + 1).padStart(2, '0')
    : null;
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
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(current => !current)} className="theme-select-trigger flex h-11 w-full items-center justify-between rounded-lg border border-[#303846] bg-[#1e222d] px-3 text-left text-sm font-semibold text-white transition-colors hover:border-[#46536a] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15">
        <span className="truncate">{selected?.label ?? value}</span>
        <ChevronDown size={16} className={'ml-3 shrink-0 text-gray-400 transition-transform ' + (open ? 'rotate-180' : '')} />
      </button>
      {open && <div role="listbox" className="theme-select-menu absolute left-0 top-[calc(100%+6px)] z-[9999] max-h-60 w-full overflow-y-auto rounded-lg border border-[#343b49] bg-[#1e222d] p-1 shadow-2xl">
        {options.map(option => <button key={String(option.value)} type="button" role="option" aria-selected={String(option.value) === String(value)} onClick={() => { onChange(option.value); setOpen(false); }} className={'theme-select-option flex min-h-9 w-full items-center rounded-md px-3 py-2 text-left text-sm transition-colors ' + (String(option.value) === String(value) ? 'bg-[#273449] font-semibold text-white' : 'text-gray-300 hover:bg-[#2a2e39] hover:text-white')}>
          {option.label}
        </button>)}
      </div>}
    </div>
  );
}

export default function DataImportModal() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [customParsed, setCustomParsed] = useState(null);
  const [customMonth, setCustomMonth] = useState('__ALL__');
  const [symbol, setSymbol] = useState('');
  const [contractSize, setContractSize] = useState('1');
  const [tickSize, setTickSize] = useState('0.00001');
  const [precision, setPrecision] = useState('5');
  const [quoteCurrency, setQuoteCurrency] = useState('USD');
  const [quoteToAccountRate, setQuoteToAccountRate] = useState('1');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [status, setStatus] = useState({ loading: false, error: '' });

  useEffect(() => {
    const showImporter = () => setOpen(true);
    window.addEventListener('omaxfx:open-data-import', showImporter);
    return () => window.removeEventListener('omaxfx:open-data-import', showImporter);
  }, []);

  const customMonths = useMemo(() => {
    if (!customParsed?.candles?.length) return [];
    return [...new Set(customParsed.candles.map(candle => marketMonth(candle, customParsed.timestampsAreUtc)).filter(Boolean))].sort();
  }, [customParsed]);

  const openBacktestSetup = (code, candles, spec) => {
    if (!candles?.length) throw new Error('This CSV contains no valid market candles.');
    useStore.getState().setCustomSymbolData(code, candles, spec);
    useStore.getState().openPeriodModal();
    setOpen(false);
  };

  const handleCustomFile = async (selectedFile) => {
    setFile(selectedFile);
    setCustomParsed(null);
    setCustomMonth('__ALL__');
    if (!selectedFile) return;
    const detectedSymbol = inferSymbolFromFilename(selectedFile.name);
    if (detectedSymbol) {
      setSymbol(detectedSymbol);
      const specs = defaultSpecs(detectedSymbol);
      setContractSize(String(specs.contractSize));
      setTickSize(String(specs.tickSize));
      setPrecision(String(specs.precision));
      setQuoteCurrency(detectedSymbol.slice(-3).length === 3 ? detectedSymbol.slice(-3) : 'USD');
    }
    setStatus({ loading: true, error: '', progress: 0, fileName: selectedFile.name, stage: 'parsing' });
    try {
      const parsed = await parseMarketCsv(selectedFile, progress => {
        setStatus(current => ({ ...current, progress: progress.percent ?? current.progress, stage: progress.stage || 'parsing' }));
      });
      setCustomParsed(parsed);
      setCustomMonth('__ALL__');
      setStatus({
        loading: false,
        error: '',
        progress: 100,
        fileName: selectedFile.name,
        stage: 'complete',
        summary: {
          candles: parsed.candles.length,
          invalidRows: parsed.invalidRows,
          duplicateRows: parsed.duplicateRows,
          months: [...new Set(parsed.candles.map(candle => marketMonth(candle, parsed.timestampsAreUtc)).filter(Boolean))].length,
          columns: parsed.detectedColumns,
        },
      });
    } catch (error) {
      setStatus({ loading: false, error: error?.message || 'Unable to read this CSV file.' });
    }
  };

  const submitCustom = async () => {
    if (!file) { setStatus({ loading: false, error: 'Choose your CSV file first.' }); return; }
    const inferred = inferSymbolFromFilename(file.name);
    const code = (symbol.trim() || inferred || 'CUSTOM').toUpperCase().replace(/[^A-Z0-9._-]/g, '').slice(0, 20);
    if (!code) { setStatus({ loading: false, error: 'Enter a symbol for this CSV.' }); return; }
    if (!(Number(contractSize) > 0) || !(Number(tickSize) > 0) || !(Number(quoteToAccountRate) > 0)) {
      setStatus({ loading: false, error: 'Instrument settings must be greater than zero.' }); return;
    }
    setStatus({ loading: true, error: '', progress: 0, fileName: file.name });
    try {
      const parsed = customParsed || await parseMarketCsv(file, progress => {
        setStatus(current => ({ ...current, progress: progress.percent ?? current.progress }));
      });
      const candles = parsed.candles
        .map(candle => ({ ...candle, time: candle.time - (parsed.timestampsAreUtc ? 0 : UTC_PLUS_3_SECONDS) }))
        .filter(candle => customMonth === '__ALL__' || marketMonth(candle, false) === customMonth);
      if (candles.length < 2) {
        throw new Error('No candles were found for ' + (customMonth === '__ALL__' ? 'this file' : customMonth) + '. The full file contains ' + parsed.candles.length.toLocaleString() + ' valid candles across ' + customMonths.length + ' month(s). Choose Full dataset or another month.');
      }
      openBacktestSetup(code, candles, {
        contractSize: Number(contractSize),
        tickSize: Number(tickSize),
        precision: Number(precision),
        quoteCurrency: quoteCurrency.trim().toUpperCase(),
        quoteToAccountRate: Number(quoteToAccountRate),
      });
    } catch (error) {
      setStatus({ loading: false, error: error?.message || 'Unable to import this CSV.' });
    }
  };

  if (!open) return null;

  const inputClass = 'mt-1 w-full rounded-lg border border-[#303846] bg-[#0b0e11] px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500';
  const buttonClass = 'theme-action-contrast w-full rounded-lg bg-blue-600 hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 px-4 py-3 text-sm font-bold text-white';

  return (
    <div className="fixed inset-0 z-[150] bg-black/85 backdrop-blur-sm flex items-center justify-center p-3">
      <div className="relative w-full max-w-lg bg-[#131722] border border-[#2a2e39] rounded-2xl shadow-2xl overflow-visible">
        <div className="flex items-center gap-3 border-b border-[#2a2e39] p-4">
          <div className="rounded-xl bg-blue-500/15 p-2"><Upload size={20} className="text-blue-400"/></div>
          <div><h2 className="font-bold text-white">Load market data</h2><p className="text-xs text-gray-400">Automatic format detection · broker time normalized to UTC+3</p></div>
        </div>

        <div className="p-4 space-y-4">
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-white"><FileText size={16} className="text-blue-400"/> Import CSV from your computer</div>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[#465064] bg-[#0b0e11] p-4 hover:border-blue-500">
              <FileText size={24} className="shrink-0 text-blue-400"/>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white">{file?.name || 'Choose your CSV file'}</span><span className="mt-1 block text-[11px] text-gray-500">Auto-detects delimiter, date/time and common OHLC header variations · Volume optional</span></span>
              <input type="file" accept=".csv,text/csv,.txt,text/plain" className="hidden" onChange={event => handleCustomFile(event.target.files?.[0] || null)}/>
            </label>
            {file && customParsed && <div className="rounded-lg border border-emerald-800/60 bg-emerald-950/20 p-3 text-xs text-gray-300">
              <div className="mb-1 flex items-center gap-2 font-semibold text-emerald-400"><CheckCircle2 size={14}/> CSV analyzed successfully</div>
              <div className="grid grid-cols-2 gap-2">
                <span>Valid candles: <b className="text-white">{customParsed.candles.length.toLocaleString()}</b></span>
                <span>Months detected: <b className="text-white">{customMonths.length}</b></span>
                <span>Skipped rows: <b className="text-white">{customParsed.invalidRows.toLocaleString()}</b></span>
                <span>Duplicate times: <b className="text-white">{customParsed.duplicateRows.toLocaleString()}</b></span>
              </div>
              <p className="mt-1 text-[10px] text-gray-500">Detected headers: {customParsed.fields.join(', ')}</p>
            </div>}
            {file && customParsed && <label className="block text-xs text-gray-400">Dataset to import
              <StyledSelect value={customMonth} onChange={setCustomMonth} options={[
                { value: '__ALL__', label: 'Full dataset · all months (' + customParsed.candles.length.toLocaleString() + ' candles)' },
                ...customMonths.map(month => ({ value: month, label: new Date(Number(month.slice(0,4)), Number(month.slice(5,7)) - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' }) })),
              ]}/>
            </label>}
            <label className="block text-xs text-gray-400">Instrument / symbol
              <input className={inputClass} value={symbol} onChange={event => {
                const code = event.target.value.toUpperCase();
                setSymbol(code);
                const specs = defaultSpecs(code);
                setContractSize(String(specs.contractSize));
                setTickSize(String(specs.tickSize));
                setPrecision(String(specs.precision));
              }} placeholder="Auto-detected from filename, or enter e.g. EURUSD / XAUUSD / NAS100"/>
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
            {status.loading && <div className="space-y-1" aria-live="polite">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#202938]">
                <div className="h-full rounded-full bg-blue-500 transition-[width] duration-200" style={{ width: (status.progress || 0) + '%' }} />
              </div>
              <p className="text-[10px] text-gray-500">{status.stage === 'downloading' ? 'Reading file' : 'Detecting format and validating candles'} · {status.progress || 0}%</p>
            </div>}
          </section>
          {status.error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-800 bg-red-950/50 p-3 text-xs text-red-300"><AlertTriangle size={15} className="mt-0.5 shrink-0"/><span>{status.error}</span></div>}
        </div>
      </div>
    </div>
  );
}
