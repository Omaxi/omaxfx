import { useStore } from '../store';
import { Volume2, VolumeX, Music } from 'lucide-react';

export default function SoundToggle() {
  const { soundEnabled, musicEnabled, toggleSound, toggleMusic } = useStore();

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={toggleSound}
        title={soundEnabled ? 'Mute sound effects' : 'Enable sound effects'}
        className={`w-7 h-7 rounded flex items-center justify-center border-0 bg-transparent transition-colors hover:bg-transparent ${soundEnabled ? 'text-green-400' : 'text-gray-600'}`}
      >
        {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
      </button>
      <button
        onClick={toggleMusic}
        title={musicEnabled ? 'Stop music' : 'Play music'}
        className={`w-7 h-7 rounded flex items-center justify-center border-0 bg-transparent transition-colors hover:bg-transparent ${musicEnabled ? 'text-blue-400' : 'text-gray-600'}`}
      >
        <Music size={13} />
      </button>
    </div>
  );
}