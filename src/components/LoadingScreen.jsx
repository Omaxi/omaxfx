import { useStore } from '../store';
import { Loader2 } from 'lucide-react';

export default function LoadingScreen() {
  const { loadingState } = useStore();
  const { loaded, total, error } = loadingState;

  if (total === 0) return null;

  const progress = Math.min(100, Math.round((loaded / total) * 100));

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#131722] text-white">
      {/* Logo / Brand */}
      <div className="mb-8 flex flex-col items-center animate-pulse">
        <img
          src={`${import.meta.env.BASE_URL}favicon.png`}
          alt="OmaxFX"
          className="w-20 h-20 rounded-2xl shadow-2xl shadow-blue-900/50 mb-4 object-contain"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
        <h1 className="text-2xl font-bold tracking-widest text-white">OMAXFX</h1>
        <p className="text-sm text-gray-400 mt-1 tracking-wider uppercase">Simulator</p>
      </div>

      {/* Progress Bar */}
      <div className="w-64 max-w-[80vw]">
        <div className="flex justify-between text-xs text-gray-400 mb-2 font-mono">
          <span>LOADING DATA</span>
          <span>{progress}%</span>
        </div>

        <div className="h-2 w-full bg-[#1e222d] rounded-full overflow-hidden border border-[#2a2e39]">
          <div
            className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="mt-6 px-4 py-2 bg-red-900/30 border border-red-500/50 rounded-lg text-red-400 text-sm flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
          {error}
        </div>
      )}

      {/* Spinner */}
      {!error && (
        <div className="mt-8 flex items-center gap-2 text-gray-500 text-sm">
          <Loader2 className="animate-spin" size={16} />
          <span>Preparing chart engine...</span>
        </div>
      )}
    </div>
  );
}