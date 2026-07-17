// ============================================================================
// SPEECH MODULE
// Thin wrapper around the browser's native Web Speech API (SpeechRecognition).
// This is a browser feature, not a Firebase one — support varies (best in
// Chrome/Edge on desktop and Android; limited/absent in Firefox and some iOS
// browsers), so every entry point here degrades gracefully.
// ============================================================================

const SpeechRecognitionImpl =
  window.SpeechRecognition || window.webkitSpeechRecognition || null;

/**
 * True if this browser supports the Web Speech API at all.
 */
export function isSpeechSupported() {
  return SpeechRecognitionImpl !== null;
}

/**
 * Creates a recognizer bound to a set of callbacks.
 *
 * @param {Object} handlers
 * @param {(finalTranscript: string) => void} handlers.onResult
 *   Called with each finalized chunk of speech, ready to append to the entry.
 * @param {() => void} handlers.onStart
 * @param {() => void} handlers.onEnd
 * @param {(message: string) => void} handlers.onError
 *   Called with a human-readable message — covers mic-permission denial,
 *   no-speech timeouts, and other recognition errors.
 * @returns {{ start: () => void, stop: () => void } | null}
 *   Returns null if the browser doesn't support speech recognition at all.
 */
export function createDictation({ onResult, onStart, onEnd, onError }) {
  if (!isSpeechSupported()) {
    onError?.(
      "Voice-to-text isn't supported in this browser. Try Chrome or Edge, or just type your entry."
    );
    return null;
  }

  const recognition = new SpeechRecognitionImpl();
  recognition.lang = "en-US";
  recognition.continuous = true; // keep listening until stopped, not just one phrase
  recognition.interimResults = false; // only emit finalized text to keep things simple/clean

  recognition.onstart = () => onStart?.();
  recognition.onend = () => onEnd?.();

  recognition.onresult = (event) => {
    let finalChunk = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        finalChunk += event.results[i][0].transcript;
      }
    }
    if (finalChunk.trim()) onResult?.(finalChunk.trim());
  };

  recognition.onerror = (event) => {
    const messages = {
      "not-allowed": "Microphone access was denied. Allow it in your browser settings to talk to write.",
      "permission-denied": "Microphone access was denied. Allow it in your browser settings to talk to write.",
      "no-speech": "Didn't catch that — no speech detected. Try again a little closer to the mic.",
      "audio-capture": "No microphone was found on this device.",
      network: "A network error interrupted voice recognition. Check your connection and try again.",
      aborted: null, // user-initiated stop; not an error worth surfacing
    };
    const message = messages[event.error];
    if (message !== null) {
      onError?.(message || "Voice-to-text ran into a problem. Please try again.");
    }
  };

  return {
    start: () => recognition.start(),
    stop: () => recognition.stop(),
  };
}
