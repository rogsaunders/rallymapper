// src/utils/sounds.js

// Simple, reliable audio helpers.
// Uses HTMLAudioElement which works in Safari + WKWebView.

let startAudio;
let stopAudio;

export function initSounds(startUrl, stopUrl) {
  // Call this once (e.g., in App.jsx) so the audio objects exist.
  startAudio = new Audio(startUrl);
  stopAudio = new Audio(stopUrl);

  // iOS sometimes needs a user gesture before audio will play;
  // preloading helps once permission is granted by interaction.
  startAudio.preload = "auto";
  stopAudio.preload = "auto";
}

export async function playStartSound() {
  try {
    if (!startAudio) return;
    startAudio.currentTime = 0;
    await startAudio.play();
  } catch {
    // Ignore: iOS may block until user gesture
  }
}

export async function playStopSound() {
  try {
    if (!stopAudio) return;
    stopAudio.currentTime = 0;
    await stopAudio.play();
  } catch {
    // Ignore
  }
}
