import { useEffect, useState } from 'react';
import { Bookmark, FolderOpen, Trash2, Play, X, Save, RefreshCw, AlertCircle, CheckCircle2, Download, Upload } from 'lucide-react';
import { useStore } from '../store';
import {
  deleteSavedBacktestSession,
  getSavedBacktestSession,
  listSavedBacktestSessions,
  saveBacktestSession,
} from '../utils/savedBacktestSessions';
import { formatMarketDateTime } from '../utils/marketClock';

function createSnapshot(state) {
  const candle = state.rawData?.[state.currentIndex];
  const symbolData = state.allRawDataBySymbol?.[state.symbol] || state.allRawData || state.rawData;
  return {
    version: 1,
    symbol: state.symbol,
    timezone: state.timezone,
    timeframe: state.timeframe,
    chartType: state.chartType,
    chartLayout: state.chartLayout,
    chartOptions: state.chartOptions,
    pencilColor: state.pencilColor,
    allRawData: symbolData,
    rawData: state.rawData,
    currentIndex: state.currentIndex,
    currentTime: candle?.time ?? null,
    gamePeriod: state.gamePeriod,
    rules: state.rules,
    balance: state.balance,
    positions: state.positions,
    pendingOrders: state.pendingOrders,
    tradeHistory: state.tradeHistory,
    peakBalance: state.peakBalance,
    dailyLoss: state.dailyLoss,
    gameState: state.gameState,
    drawings: state.drawings,
    chartDrawings: state.chartDrawings,
    drawingsPast: state.drawingsPast,
    drawingsFuture: state.drawingsFuture,
    pencilStrokes: state.pencilStrokes,
    sessionTimes: state.sessionTimes,
    sessionEndTimes: state.sessionEndTimes,
    sessionColors: state.sessionColors,
    sessionLabelsVisible: state.sessionLabelsVisible,
    drawingStyles: state.drawingStyles,
    theme: state.theme,
    uiMode: state.uiMode,
    contractSpec: state.contractSpecs?.[state.symbol] || null,
  };
}

function formatSavedTime(time) {
  if (!Number.isFinite(Number(time))) return 'Replay position unavailable';
  return formatMarketDateTime(Number(time));
}

export default function SavedSessionsModal({ open, onClose }) {
  const [sessions, setSessions] = useState([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fileBusy, setFileBusy] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      setSessions(await listSavedBacktestSessions());
    } catch (err) {
      setError(err?.message || 'Unable to read saved sessions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const state = useStore.getState();
    const time = state.rawData?.[state.currentIndex]?.time;
    setName(`${state.symbol || 'Backtest'} · ${time ? formatMarketDateTime(time) : 'Replay'}`);
    setNotice('');
    refresh();
  }, [open]);

  if (!open) return null;

  const handleSave = async () => {
    const state = useStore.getState();
    if (!state.gameStarted || !state.rawData?.length) {
      setError('Start a backtest before saving a session.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const snapshot = createSnapshot(state);
      await saveBacktestSession(name, snapshot);
      await refresh();
      setNotice('Backtest saved on this device.');
    } catch (err) {
      setError(err?.name === 'QuotaExceededError'
        ? 'This device is running low on storage. Remove older saved sessions and try again.'
        : (err?.message || 'Unable to save this backtest.'));
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    const state = useStore.getState();
    if (!state.gameStarted || !state.rawData?.length) {
      setError('Start a backtest before exporting a session.');
      return;
    }
    setFileBusy(true);
    setError('');
    setNotice('');
    try {
      const snapshot = createSnapshot(state);
      const payload = {
        format: 'TradePastSession',
        formatVersion: 1,
        exportedAt: new Date().toISOString(),
        name: name.trim() || `${state.symbol || 'Backtest'} session`,
        snapshot,
      };
      const safeName = (payload.name.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'TradePast-session');
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/vnd.tradepast.session+json' });
      if (typeof window.showSaveFilePicker === 'function') {
        const handle = await window.showSaveFilePicker({
          suggestedName: `${safeName}.tradepast`,
          startIn: 'documents',
          types: [{ description: 'TradePast backtest session', accept: { 'application/vnd.tradepast.session+json': ['.tradepast'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        setNotice('Session file saved. Choose Documents in the file picker to keep it there.');
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${safeName}.tradepast`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        setNotice('Session file downloaded. Move it into your Documents folder.');
      }
    } catch (err) {
      if (err?.name !== 'AbortError') setError(err?.message || 'Could not export this session file.');
    } finally {
      setFileBusy(false);
    }
  };

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setFileBusy(true);
    setError('');
    setNotice('');
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (payload?.format !== 'TradePastSession' || payload?.formatVersion !== 1 ||
          !payload?.snapshot || !Array.isArray(payload.snapshot.rawData) ||
          payload.snapshot.rawData.length < 2) {
        throw new Error('This is not a valid TradePast session file, or its version is not supported.');
      }
      const snapshot = payload.snapshot;
      const restored = useStore.getState().restoreBacktestSession(snapshot);
      if (!restored) throw new Error('TradePast could not restore this session file.');
      try {
        await saveBacktestSession(payload.name || file.name.replace(/\\.tradepast$/i, ''), snapshot);
      } catch {
        // The imported file is already restored. Local browser storage is optional.
      }
      setNotice('Session imported and resumed successfully.');
      await refresh();
      onClose();
    } catch (err) {
      setError(err?.message || 'Could not import this session file.');
    } finally {
      setFileBusy(false);
    }
  };

  const handleResume = async (id) => {
    setLoading(true);
    setError('');
    try {
      const record = await getSavedBacktestSession(id);
      if (!record?.snapshot) throw new Error('This saved session is incomplete or unavailable.');
      const restored = useStore.getState().restoreBacktestSession(record.snapshot);
      if (!restored) throw new Error('This saved session could not be restored.');
      onClose();
    } catch (err) {
      setError(err?.message || 'Unable to resume this session.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    setError('');
    try {
      await deleteSavedBacktestSession(id);
      await refresh();
    } catch (err) {
      setError(err?.message || 'Unable to delete this saved session.');
    }
  };

  return (
    <div className="fixed inset-0 z-[15000] flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="saved-sessions-title" className="w-full max-w-2xl overflow-hidden rounded-xl border border-slate-300 bg-white text-slate-800 shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Bookmark size={19}/></span>
            <div>
              <h2 id="saved-sessions-title" className="text-base font-bold">Saved Sessions</h2>
              <p className="text-xs text-slate-500">Save locally or export a portable file to Documents.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Close saved sessions"><X size={18}/></button>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-3">
          <button type="button" onClick={handleExport} disabled={fileBusy || !useStore.getState().gameStarted} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Download size={14}/> Save file to Documents</button>
          <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 ${fileBusy ? 'pointer-events-none opacity-50' : ''}`}>
            <Upload size={14}/> Import session file
            <input type="file" accept=".tradepast,.json,application/json,application/vnd.tradepast.session+json" className="hidden" disabled={fileBusy} onChange={handleImportFile}/>
          </label>
          <span className="text-[11px] text-slate-500">Portable backup · works offline</span>
        </div>

        <div className="border-b border-slate-200 bg-slate-50 p-5">
          <label htmlFor="saved-session-name" className="mb-2 block text-xs font-semibold text-slate-600">Session name</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input id="saved-session-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="e.g. XAUUSD London strategy test" className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"/>
            <button type="button" onClick={handleSave} disabled={saving || !useStore.getState().gameStarted} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? <RefreshCw size={15} className="animate-spin"/> : <Save size={15}/>} Save current
            </button>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Includes CSV data, replay position, balance, trades, open orders and drawings. Use Save file to keep a backup in Documents.</p>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Your saved backtests ({sessions.length})</h3>
            <button type="button" onClick={refresh} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"><RefreshCw size={12}/> Refresh</button>
          </div>
          {loading && <p className="py-5 text-center text-sm text-slate-500">Loading saved sessions…</p>}
          {!loading && sessions.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 py-8 text-center">
              <FolderOpen size={25} className="mx-auto mb-2 text-slate-400"/>
              <p className="text-sm font-semibold text-slate-600">No saved sessions yet</p>
              <p className="mt-1 text-xs text-slate-500">Save your current backtest to resume it later.</p>
            </div>
          )}
          <div className="space-y-2">
            {sessions.map((session) => (
              <div key={session.id} className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-800">{session.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{session.symbol} · {formatSavedTime(session.currentTime)}</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">Saved {new Date(session.updatedAt).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => handleResume(session.id)} disabled={loading} className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><Play size={13}/> Resume</button>
                  <button type="button" onClick={() => handleDelete(session.id)} disabled={loading} className="inline-flex items-center justify-center rounded-md border border-red-200 px-3 py-2 text-red-600 hover:bg-red-50 disabled:opacity-50" aria-label={`Delete ${session.name}`}><Trash2 size={14}/></button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {(error || notice) && <div className={`mx-5 mb-5 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {error ? <AlertCircle size={14} className="mt-0.5 shrink-0"/> : <CheckCircle2 size={14} className="mt-0.5 shrink-0"/>}
          <span>{error || notice}</span>
        </div>}
        <footer className="flex justify-end border-t border-slate-200 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Close</button>
        </footer>
      </section>
    </div>
  );
}
