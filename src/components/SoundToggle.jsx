import { useStore } from '../store';
import { Volume2, VolumeX, Music, Music2 } from 'lucide-react';

export default function SoundToggle() {
  const { soundEnabled, musicEnabled, toggleSound, toggleMusic } = useStore();

  return (
    <div className="flex items-center gap-1 bg-[#1e222d] p-1 rounded-lg border border-[#2a2e39]">
      <button
        onClick={toggleSound}
        title={soundEnabled ? 'Mute sound effects' : 'Enable sound effects'}
        className={`p-2 rounded transition-colors ${
          soundEnabled 
            ? 'text-green-400 hover:bg-[#2a2e39]' 
            : 'text-gray-600 hover:bg-[#2a2e39]'
        }`}
      >
        {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
      </button>
      <button
        onClick={toggleMusic}
        title={musicEnabled ? 'Stop music' : 'Play music'}
        className={`p-2 rounded transition-colors ${
          musicEnabled 
            ? 'text-blue-400 hover:bg-[#2a2e39]' 
            : 'text-gray-600 hover:bg-[#2a2e39]'
        }`}
      >
        {musicEnabled ? <Music size={16} /> : <Music2 size={16} />}
      </button>
    </div>
  );
}