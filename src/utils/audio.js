// ============================================================
// SOUND EFFECTS — synthesized via Web Audio API
// SOUNDTRACK — HTMLAudio routed through Web Audio for volume control
// ============================================================

let audioCtx = null;
const getCtx = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
};

// ---------- VOLUME CONTROLS ----------
const SFX_VOLUME_MULTIPLIER = 1.5;   // Sound effects multiplier
const MUSIC_VOLUME = 0.1;             // Soundtrack volume (0.0 – 1.0)

// ---------- SYNTHESIZED SFX ----------
const playTone = (freq, duration, type = 'sine', volume = 0.15, delay = 0) => {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = type;
    osc.frequency.value = freq;
    
    const finalVolume = volume * SFX_VOLUME_MULTIPLIER;
    const startTime = ctx.currentTime + delay;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(finalVolume, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  } catch (e) {}
};

export const playOrderPlaced = () => {
  playTone(600, 0.08, 'sine', 0.08);
  playTone(800, 0.08, 'sine', 0.06, 0.05);
};

export const playPositionClosed = () => {
  playTone(500, 0.1, 'sine', 0.1);
  playTone(400, 0.15, 'sine', 0.08, 0.08);
};

export const playTPHit = () => {
  playTone(523.25, 0.15, 'sine', 0.15);
  playTone(659.25, 0.15, 'sine', 0.15, 0.1);
  playTone(783.99, 0.2, 'sine', 0.15, 0.2);
  playTone(1046.5, 0.35, 'sine', 0.12, 0.32);
};

export const playSLHit = () => {
  playTone(400, 0.15, 'sawtooth', 0.1);
  playTone(300, 0.2, 'sawtooth', 0.1, 0.12);
  playTone(200, 0.45, 'sawtooth', 0.08, 0.28);
};

export const playPendingTriggered = () => {
  playTone(880, 0.08, 'square', 0.06);
  playTone(1100, 0.1, 'square', 0.05, 0.07);
};

// "ELIMINATED" — dramatic game-over bwoooong (kept for future use)
export const playEliminated = () => {
  playTone(220, 0.2, 'sawtooth', 0.1);
  playTone(165, 0.3, 'sawtooth', 0.11, 0.15);
  playTone(110, 0.5, 'sawtooth', 0.12, 0.4);
  playTone(82, 0.8, 'sawtooth', 0.1, 0.75);
  playTone(55, 1.5, 'sine', 0.08, 1.2);
};

// "RESTART" — ascending reset chime, feels like "fresh start"
export const playRestart = () => {
  playTone(400, 0.1, 'sine', 0.12);
  playTone(550, 0.1, 'sine', 0.12, 0.07);
  playTone(700, 0.12, 'triangle', 0.11, 0.14);
  playTone(1000, 0.18, 'triangle', 0.09, 0.22);
};

// ---------- SOUNDTRACK ----------
let soundtrackAudio = null;
let soundtrackGain = null;
let soundtrackSource = null;
let isPlaying = false;

export const startSoundtrack = async () => {
  try {
    const ctx = getCtx();

    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch (e) { console.warn('[Soundtrack] Resume failed:', e); }
    }

    if (!soundtrackAudio) {
      soundtrackAudio = new Audio('/sounds/soundtrack.mp3');
      soundtrackAudio.loop = true;
    }

    if (!soundtrackSource) {
      try {
        soundtrackSource = ctx.createMediaElementSource(soundtrackAudio);
        soundtrackGain = ctx.createGain();
        soundtrackGain.gain.value = MUSIC_VOLUME;
        soundtrackSource.connect(soundtrackGain);
        soundtrackGain.connect(ctx.destination);
      } catch (e) {
        console.warn('[Soundtrack] Web Audio connect failed, using HTMLAudio volume:', e);
        try { soundtrackAudio.volume = MUSIC_VOLUME; } catch (_) {}
      }
    } else if (soundtrackGain) {
      soundtrackGain.gain.value = MUSIC_VOLUME;
    }

    await soundtrackAudio.play();
    isPlaying = true;
  } catch (e) {
    console.error('[Soundtrack] Error:', e);
  }
};

export const stopSoundtrack = () => {
  if (!soundtrackAudio) return;
  try {
    if (soundtrackGain) {
      const ctx = getCtx();
      const now = ctx.currentTime;
      const startVol = soundtrackGain.gain.value;
      soundtrackGain.gain.setValueAtTime(startVol, now);
      soundtrackGain.gain.linearRampToValueAtTime(0.0001, now + 0.8);
      setTimeout(() => {
        if (soundtrackAudio) {
          soundtrackAudio.pause();
          soundtrackAudio.currentTime = 0;
        }
        if (soundtrackGain) soundtrackGain.gain.value = MUSIC_VOLUME;
      }, 900);
    } else {
      soundtrackAudio.pause();
      soundtrackAudio.currentTime = 0;
    }
    isPlaying = false;
  } catch (e) {}
};

export const isSoundtrackPlaying = () => isPlaying;

export const setMusicVolume = (v) => {
  if (soundtrackGain) {
    soundtrackGain.gain.value = Math.max(0, Math.min(1, v));
  }
  if (soundtrackAudio) {
    try { soundtrackAudio.volume = Math.max(0, Math.min(1, v)); } catch (_) {}
  }
};