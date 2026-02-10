import { SpeechRecognition } from "@capacitor-community/speech-recognition";

let listenersRegistered = false;

let handlers = {
  onStart: null,
  onResult: null,
  onEnd: null,
  onError: null,
};

let startLock = Promise.resolve();
let active = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function hardStop() {
  try {
    await SpeechRecognition.stop();
  } catch {}
  try {
    await SpeechRecognition.cancel?.();
  } catch {}
  await sleep(300); // ⚠️ critical for iOS
}

async function ensureSpeechListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;

  await SpeechRecognition.addListener("partialResults", (data) => {
    const text = data?.matches?.[0];
    if (text && active) handlers.onResult?.(text, false);
  });
}

export async function startSpeechRecognition(options = {}) {
  startLock = startLock
    .catch(() => {})
    .then(async () => {
      if (active) return;

      active = true;

      handlers.onStart = options.onStart || null;
      handlers.onResult = options.onResult || null;
      handlers.onEnd = options.onEnd || null;
      handlers.onError = options.onError || null;

      await ensureSpeechListeners();

      const avail = await SpeechRecognition.available();
      if (!avail?.available)
        throw new Error("Speech recognition not available");

      await SpeechRecognition.requestPermissions();

      await hardStop();

      try {
        handlers.onStart?.();

        const res = await SpeechRecognition.start({
          language: options.language || "en-AU",
          partialResults: false,
          maxResults: 1,
        });

        const text = res?.matches?.[0];
        if (text) handlers.onResult?.(text, true);
      } catch (err) {
        const msg = err?.errorMessage || err?.message || "";

        if (!msg.includes("No speech detected")) {
          handlers.onError?.(err);
        }
      } finally {
        await hardStop();
        active = false;
        handlers.onEnd?.();
      }
    });

  return startLock;
}

export async function stopSpeechRecognition() {
  active = false;
  await hardStop();
}
