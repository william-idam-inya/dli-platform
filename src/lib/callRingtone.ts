/**
 * Foreground-only DLI call ringing.
 * No user media or remote calls are started here. Playback is unlocked only
 * after a real click/key press, subject to browser and device sound policies.
 * This does NOT pretend to ring a closed tab; that needs the separate Q52
 * Web Push rollout and OS-managed notification sound.
 */
let audio: AudioContext | null = null;
let unlocked = false;
function unlock(): void {
  try {
    audio ??= new AudioContext();
    void audio.resume().then(() => {
      unlocked = audio?.state === 'running';
      if (unlocked) {
        window.removeEventListener('pointerdown', unlock, true);
        window.removeEventListener('keydown', unlock, true);
      }
    }).catch(() => { /* A later user gesture may unlock audio. */ });
  } catch { /* Unsupported audio hardware or browser policy. */ }
}
export function initializeCallRingtone(): void {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return;
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
}
export function startCallRingtone(direction: 'incoming' | 'outgoing'): () => void {
  if (!unlocked || !audio || audio.state !== 'running') return () => {};
  const ctx = audio;
  let active = true;
  const oscillators: OscillatorNode[] = [];
  const play = () => {
    if (!active || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const notes = direction === 'incoming'
      ? [{freq:740,start:0,duration:.28},{freq:930,start:.4,duration:.32}]
      : [{freq:435,start:0,duration:.28},{freq:480,start:.34,duration:.28}];
    for (const note of notes) {
      try {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        const at = now + note.start;
        oscillator.type = 'sine';
        oscillator.frequency.value = note.freq;
        gain.gain.setValueAtTime(.0001, at);
        gain.gain.exponentialRampToValueAtTime(.15, at + .025);
        gain.gain.exponentialRampToValueAtTime(.0001, at + note.duration);
        oscillator.connect(gain).connect(ctx.destination);
        oscillator.start(at);
        oscillator.stop(at + note.duration + .03);
        oscillators.push(oscillator);
        oscillator.onended = () => {
          const index = oscillators.indexOf(oscillator);
          if (index >= 0) oscillators.splice(index, 1);
          oscillator.disconnect();
          gain.disconnect();
        };
      } catch { /* Continue with the in-app call UI if audio is blocked. */ }
    }
    if (direction === 'incoming') {
      try { navigator.vibrate?.([350, 220, 350]); } catch { /* Unsupported. */ }
    }
  };
  play();
  const repeating = window.setInterval(play, direction === 'incoming' ? 1900 : 2600);
  return () => {
    active = false;
    window.clearInterval(repeating);
    for (const oscillator of oscillators) {
      try { oscillator.stop(); } catch { /* Already stopped. */ }
    }
    try { navigator.vibrate?.(0); } catch { /* Unsupported. */ }
  };
}
