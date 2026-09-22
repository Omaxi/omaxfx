import { useStore } from '../store';
import { Volume2, VolumeX, Music } from 'lucide-react';

export default function SoundToggle() {
  const { soundEnabled, musicEnabled, toggleSound, toggleMusic } = useStore();

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={toggleSound}
        title={soundEnabled ? 'Mute sound effects' : 'Enable sound effects'}
        className={`w-7 h-7 rounded border flex items-center justify-center transition-colors ${
          soundEnabled 
            ? 'bg-[#1e222d] border-[#2a2e39] text-green-400 hover:bg-[#2a2e39]' 
            : 'bg-[#1e222d] border-[#2a2e39] text-gray-600 hover:bg-[#2a2e39]'
        }`}
      >
        {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
      </button>
      <button
        onClick={toggleMusic}
        title={musicEnabled ? 'Stop music' : 'Play music'}
        className={`w-7 h-7 rounded border flex items-center justify-center transition-colors ${
          musicEnabled 
            ? 'bg-[#1e222d] border-[#2a2e39] text-blue-400 hover:bg-[#2a2e39]' 
            : 'bg-[#1e222d] border-[#2a2e39] text-gray-600 hover:bg-[#2a2e39]'
        }`}
      >
        <Music size={13} />
      </button>
    </div>
  );
}