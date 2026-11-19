import { useRef, useState } from 'react';
import Papa from 'papaparse';
import { Upload, X, FileSpreadsheet, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useStore } from '../store';
import { aggregateData } from '../utils/timeframe';

const normalizeKey = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const findValue = (row, aliases) => {
  const entries = Object.entries(row || {});
  for (const alias of aliases) {
    const found = entries.find(([key]) => normalizeKey(key) === alias);
    if (found) return found[1];
  }
  return null;
};

const parseTimestamp = (row, sourceOffsetMinutes) => {
  const timestamp = findValue(row, ['timestamp', 'datetime', 'dateandtime', 'opentime']);
  if (timestamp != null && String(timestamp).trim() !== '') {
    const raw = String(timestamp).trim();
    if (/^\\d{10,13}$/.test(raw)) {
      const n = Number(raw);
      const seconds = n > 1e12 ? n / 1000 : n;
      return seconds + (-300 - sourceOffsetMinutes) * 60;
    }
    const hasZone = /(?:z|[+-]\\d{2}:?\\d{2})$/i.test(raw);
    const parsed = Date.parse(hasZone ? raw : (raw.replace(' ', 'T') + 'Z'));
    if (Number.isFinite(parsed)) return parsed / 1000 + (hasZone ? 0 : (-300 - sourceOffsetMinutes) * 60);
  }
  const date = findValue(row, ['date', 'tradedate']);
  const time = findValue(row, ['time', 'tradetime']);
  if (date == null || time == null) return null;
  const parsed = Date.parse(`${String(date).trim()}T${String(time).trim()}Z`);
  return Number.isFinite(parsed) ? parsed / 1000 + (-300 - sourceOffsetMinutes) * 60 : null;
};

export default function DataImport() {
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState('XAUUSD');
  const [sourceOffset, setSourceOffset] = useState('-300');
  const [status, setStatus] = useState(null);
  const inputRef = useRef(null);
  const { setAllDataForSymbol, openPeriodModal } = useStore();

  const importFile = (file) => {
    if (!file) return;
    setStatus({ type: 'loading', message: `Reading ${file.name}…` });
    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      dynamicTyping: false,
      complete: (result) => {
        const offset = Number(sourceOffset);
        const rows = result.data || [];
        const byTime = new Map();
        let invalid = 0;
        for (const row of rows) {
          const time = parseTimestamp(row, offset);
          const openPrice = Number(findValue(row, ['open', 'o']));
          const high = Number(findValue(row, ['high', 'h']));
          const low = Number(findValue(row, ['low', 'l']));
          const close = Number(findValue(row, ['close', 'c']));
          const volume = Number(findValue(row, ['volume', 'vol', 'tickvolume'])) || 0;
          if (!Number.isFinite(time) || ![openPrice, high, low, close].every(Number.isFinite) ||
              high < Math.max(openPrice, close, low) || low > Math.min(openPrice, close, high)) {
            invalid++;
            continue;
          }
          byTime.set(time, { time, open: openPrice, high, low, close, volume });
        }
        const candles = [...byTime.values()].sort((a, b) => a.time - b.time);
        if (candles.length < 2) {
          setStatus({ type: 'error', message: 'No usable data found. Expected date/time and OHLC columns. At least two valid candles are required.' });
          return;
        }
        setAllDataForSymbol(symbol, candles);
        const state = useStore.getState();
        useStore.setState({
          symbol, allRawData: candles, rawData: candles,
          displayData: aggregateData(candles, state.timeframe), currentIndex: 0,
          gameStarted: false, isPlaying: false,
          gameState: { isOver: false, reason: null, message: '', startTime: null, timeRemaining: null },
          symbolWarning: null,
        });
        openPeriodModal();
        setStatus({ type: 'success', message: `Imported ${candles.length.toLocaleString()} candles for ${symbol}. ${invalid} invalid or incomplete rows skipped.` });
      },
      error: (error) => setStatus({ type: 'error', message: error.message || 'Could not read this CSV file.' }),
    });
  };

  return (
    <>
      <button onClick={() => { setOpen(true); setStatus(null); }} className="h-7 px-2 bg-[#1e222d] border border-[#2a2e39] hover:border-blue-500 hover:text-blue-400 rounded flex items-center gap-1.5 text-[11px] font-semibold" title="Import your own market CSV">
        <Upload size={12} /> <span className="hidden sm:inline">Import CSV</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-3">
          <div className="w-full max-w-md bg-[#131722] border border-[#2a2e39] rounded-xl shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-[#2a2e39]">
              <div className="flex items-center gap-2"><FileSpreadsheet size={17} className="text-blue-400"/><h2 className="font-bold text-sm">Import Market Data</h2></div>
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-[#2a2e39]" aria-label="Close"><X size={17}/></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Instrument</label>
                <select value={symbol} onChange={e => setSymbol(e.target.value)} className="w-full bg-[#0b0e11] border border-[#2a2e39] rounded p-2 text-sm text-white">
                  <option value="XAUUSD">XAUUSD — Gold</option><option value="EURUSD">EURUSD</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">CSV source timezone</label>
                <select value={sourceOffset} onChange={e => setSourceOffset(e.target.value)} className="w-full bg-[#0b0e11] border border-[#2a2e39] rounded p-2 text-sm text-white">
                  <option value="-300">UTC−5</option><option value="0">UTC</option><option value="60">UTC+1</option><option value="120">UTC+2</option><option value="180">UTC+3</option><option value="240">UTC+4</option><option value="330">UTC+5:30</option><option value="480">UTC+8</option>
                </select>
              </div>
              <div className="text-[11px] text-gray-400 leading-relaxed">
                Required columns: Date, Time, Open, High, Low, Close. Headers are case-insensitive; Timestamp/DateTime and Volume are also supported. Duplicate timestamps are merged, invalid OHLC rows are skipped. Imported timestamps are normalized to OmaxFX's canonical UTC−5 timeline.
              </div>
              <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => { importFile(e.target.files?.[0]); e.target.value = ''; }}/>
              <button onClick={() => inputRef.current?.click()} className="w-full py-2.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold flex items-center justify-center gap-2"><Upload size={15}/> Choose CSV file</button>
              {status && (
                <div className={`rounded-lg border p-3 text-xs flex gap-2 ${status.type === 'error' ? 'border-red-500/40 bg-red-500/10 text-red-300' : status.type === 'success' ? 'border-green-500/40 bg-green-500/10 text-green-300' : 'border-blue-500/40 bg-blue-500/10 text-blue-300'}`}>
                  {status.type === 'error' ? <AlertCircle size={15}/> : status.type === 'success' ? <CheckCircle2 size={15}/> : null}
                  <span>{status.message}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
