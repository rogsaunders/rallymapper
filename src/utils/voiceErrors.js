// src/utils/voiceErrors.js

export function parseVoiceError(err) {
  const msg = String(err?.errorMessage || err?.message || err || "").trim();
  if (!msg) return "Voice recognition failed.";

  // Common Capacitor SpeechRecognition patterns
  if (msg.toLowerCase().includes("permission"))
    return "Microphone permission denied.";
  if (msg.toLowerCase().includes("not available"))
    return "Speech recognition not available on this device.";
  if (msg.toLowerCase().includes("ongoing"))
    return "Speech recognition was already running. Try again.";
  if (msg.toLowerCase().includes("network"))
    return "Network issue during speech recognition.";

  return msg;
}
