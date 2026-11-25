import { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, FileText, AlertTriangle, RefreshCw, ChevronDown } from 'lucide-react';
import { parseMarketCsv } from '../utils/marketData';
import { useStore } from '../store';

const UTC_PLUS_3_SECONDS = 3 * 60 * 60;

function defaultSpecs(symbol) {
  const code = symbol.toUpperCase();
  if (code === 'XAUUSD') return { contractSize: 100, tickSize: 0.01, precision: 2 };
  if (/^[A-Z]{6}$/.test(code)) {
    const isJpy = code.includes('JPY');
    return { contractSize: 100000, tickSize: isJpy ? 0.001 : 0.00001, precision: isJpy ? 3 : 5 };
  }
  if (code.includes('JPY')) return { contractSize: 100000, tickSize: 0.001, precision: 3 };
  return { contractSize: 1, tickSize: 0.00001, precision: 5 };
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
  const [symbol, setSymbol] = useState('CUSTOM');
  const [contractSize, setContractSize] = useState('1');
  const [tickSize, setTickSize] = useState('0.00001');
  const [precision, setPrecision] = useState('5');
  const [quoteCurrency, setQuoteCurrency] = useState('USD');
  const [quoteToAccountRate, setQuoteToAccountRate] = useState('1');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [status, setStatus] = useState({ loading: false, error: '', progress: 0, stage: '' });

  useEffect(() => {
    const showImporter = () => setOpen(true);
    window.addEventListener('omaxfx:open-data-import', showImporter);
    return () => window.removeEventListener('omaxfx:open-data-import', showImporter);
  }, []);

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

  const handleCustomFile = async (selectedFile) => {
    setFile(selectedFile);
    setCustomParsed(null);
    setCustomMonth('__ALL__');
    if (!selectedFile) return;
    const baseName = selectedFile.name.replace(/\\.[^.]+$/, '').toUpperCase();
    const ignoredTokens = new Set(['DATA', 'PRICE', 'OHLC', 'TICK', 'HISTORY', 'MARKET', 'CSV']);
    const detectedSymbol = baseName.split(/[^A-Z0-9]+/).find(token =>
      !ignoredTokens.has(token) && !/^\\d+$/.test(token) &&
      (/^[A-Z]{6}$/.test(token) || /^(XAUUSD|XAGUSD|NAS100|US30|US100|SPX500|GER40|UK100|BTCUSD|ETHUSD)$/.test(token))
    );
    if (detectedSymbol) {
      setSymbol(detectedSymbol);
      const specs = defaultSpecs(detectedSymbol);
      setContractSize(String(specs.contractSize));
      setTickSize(String(specs.tickSize));
      setPrecision(String(specs.precision));
    }
    setStatus({ loading: true, error: '', progress: 0, fileName: selectedFile.name, stage: 'detecting' });
    try {
      const parsed = await parseMarketCsv(selectedFile, progress => {
        setStatus(current => ({
          ...current,
          progress: progress.percent ?? current.progress,
          stage: progress.stage || current.stage,
          detectedFormat: progress.detectedFormat || current.detectedFormat,
        }));
      });
      setCustomParsed(parsed);
      const months = new Set(parsed.candles.map(candle => {
        const normalizedTime = Number(candle.time) - (parsed.timestampsAreUtc ? 0 : UTC_PLUS_3_SECONDS);
        const marketDate = new Date((normalizedTime + UTC_PLUS_3_SECONDS) * 1000);
        return `${marketDate.getUTCFullYear()}-${String(marketDate.getUTCMonth() + 1).padStart(2, '0')}`;
      }));
      setCustomMonth('__ALL__');
      setStatus({
        loading: false, error: '', progress: 100, fileName: selectedFile.name, stage: 'verified',
        detectedFormat: parsed.detectedFormat, candleCount: parsed.candles.length,
        invalidRows: parsed.invalidRows, duplicateRows: parsed.duplicateRows,
        firstTime: parsed.candles[0]?.time, lastTime: parsed.candles.at(-1)?.time,
      });
    } catch (error) {
      setStatus({ loading: false, error: error?.message || 'Unable to read this CSV file.', fileName: selectedFile.name, stage: 'error' });
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
      const parsed = customParsed || await parseMarketCsv(file, progress => {
        setStatus(current => ({ ...current, progress: progress.percent ?? current.progress, stage: progress.stage || current.stage }));
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
  const buttonClass = 'theme-action-contrast w-full rounded-lg bg-blue-600 hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 px-4 py-3 text-sm font-bold text-white';

  return (
    <div className="fixed inset-0 z-[150] bg-black/85 backdrop-blur-sm flex items-center justify-center p-3">
      <div className="relative w-full max-w-lg bg-[#131722] border border-[#2a2e39] rounded-2xl shadow-2xl overflow-visible">
        <div className="flex items-center gap-3 border-b border-[#2a2e39] p-4">
          <div className="rounded-xl bg-blue-500/15 p-2"><Upload size={20} className="text-blue-400"/></div>
          <div><h2 className="font-bold text-white">Load market data</h2><p className="text-xs text-gray-400">Choose a dataset to open the backtest setup · timestamps UTC+3</p></div>
        </div>

        <div className="p-4 space-y-4">
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-white"><FileText size={16} className="text-blue-400"/> Import CSV from your computer</div>
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
            {file && status.loading && <p className="text-[11px] text-blue-300" aria-live="polite">
              {status.stage === 'detecting' ? 'Detecting CSV format and column headings…' : 'Reading and validating market candles…'}
            </p>}
            {file && customParsed && status.stage === 'verified' && (
              <div className="space-y-2 rounded-lg border border-emerald-700/60 bg-emerald-950/25 p-3 text-xs" role="status">
                <div className="flex items-center gap-2 font-semibold text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-400"/> CSV successfully verified</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-300">
                  <span>Detected format</span><span className="text-right text-white">{status.detectedFormat || customParsed.detectedFormat}</span>
                  <span>Valid candles</span><span className="text-right text-white">{(status.candleCount || customParsed.candles.length).toLocaleString()}</span>
                  <span>Invalid rows</span><span className="text-right text-white">{status.invalidRows ?? customParsed.invalidRows ?? 0}</span>
                  <span>Duplicate rows</span><span className="text-right text-white">{status.duplicateRows ?? customParsed.duplicateRows ?? 0}</span>
                  <span>Detected columns</span><span className="text-right text-white">{(customParsed.fields || []).join(', ')}</span>
                  <span>Data range (UTC+3)</span><span className="text-right text-white">{customParsed.candles.length ? `${new Date((customParsed.candles[0].time + (customParsed.timestampsAreUtc ? UTC_PLUS_3_SECONDS : 0)) * 1000).toISOString().slice(0, 16).replace('T', ' ')} → ${new Date((customParsed.candles.at(-1).time + (customParsed.timestampsAreUtc ? UTC_PLUS_3_SECONDS : 0)) * 1000).toISOString().slice(0, 16).replace('T', ' ')}` : '—'}</span>
                </div>
              </div>
            )}
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
                <p className="text-[10px] text-gray-500">{status.stage === 'detecting' ? 'Detecting file format' : 'Validating OHLC data'} · {status.fileName || 'CSV data'} · {status.progress || 0}%</p>
              </div>
            )}
          </section>

          {status.error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-800 bg-red-950/50 p-3 text-xs text-red-300"><AlertTriangle size={15} className="mt-0.5 shrink-0"/><span>{status.error}</span></div>}
        </div>
      </div>
    </div>
  );
}
