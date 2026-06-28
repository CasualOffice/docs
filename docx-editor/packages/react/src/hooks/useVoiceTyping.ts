/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Voice typing — Web Speech API wrapper.
 *
 * Wraps `webkitSpeechRecognition` / `SpeechRecognition` into a React
 * hook with a tight surface: `start()`, `stop()`, `isListening`,
 * `supported`. The host (DocxEditor) wires `onFinalText` to insert
 * the recognized text into the editor at the cursor.
 *
 * Browser support: Chrome / Edge / Brave (full), Safari iOS (partial),
 * Firefox (no). On unsupported browsers `supported` is false and the
 * UI can hide / disable the menu entry. We don't fall back to a
 * server-side recognizer — that would need a paid API, and voice
 * typing is a nice-to-have not a critical feature.
 *
 * Recognition mode: continuous + interimResults so the user sees
 * words as they speak. Only `final` results are emitted via
 * `onFinalText` (interim text is mirrored via `interimText` for the
 * indicator UI). Recognition restarts itself on the `end` event
 * while `isListening` is true so the user can pause mid-sentence
 * without the session dying.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// Lazy typing — the Web Speech API isn't in lib.dom.d.ts as a
// stable type yet. Treat the constructor + instance as `unknown`
// and narrow inline.
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((this: SpeechRecognitionLike) => void) | null;
  onend: ((this: SpeechRecognitionLike) => void) | null;
  onresult:
    | ((
        this: SpeechRecognitionLike,
        e: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }
      ) => void)
    | null;
  onerror: ((this: SpeechRecognitionLike, e: { error: string }) => void) | null;
};

function getRecognitionConstructor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseVoiceTypingOptions {
  /** Called whenever a final (committed) recognition result comes
   *  through. The host inserts the text into the document. */
  onFinalText?: (text: string) => void;
  /** BCP-47 language tag. Defaults to navigator.language so the
   *  user's OS locale is the starting point. */
  lang?: string;
}

export interface UseVoiceTypingReturn {
  /** True when the browser exposes a SpeechRecognition constructor. */
  supported: boolean;
  /** True while the engine is actively listening. */
  isListening: boolean;
  /** Latest *non-final* (interim) transcript. Cleared on each new
   *  final result. UI uses this for a "you said..." preview. */
  interimText: string;
  /** Most recent error message from the engine (e.g. 'not-allowed',
   *  'no-speech'). Null when the last session ended cleanly. */
  error: string | null;
  /** Start listening. Does nothing if unsupported / already running. */
  start(): void;
  /** Stop listening. Does nothing if not running. */
  stop(): void;
  /** Toggle — start if stopped, stop if started. */
  toggle(): void;
}

export function useVoiceTyping(options: UseVoiceTypingOptions = {}): UseVoiceTypingReturn {
  const { onFinalText, lang } = options;
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const supported = getRecognitionConstructor() !== null;
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Track the latest onFinalText so the recognition handler (set up
  // once when start() is called) always calls the current handler
  // — not the one captured at session start.
  const onFinalTextRef = useRef(onFinalText);
  useEffect(() => {
    onFinalTextRef.current = onFinalText;
  }, [onFinalText]);
  // Mirror isListening so the `end` auto-restart can decide whether
  // the user actually wanted to stop (vs. the engine ending its
  // current chunk).
  const wantsToListenRef = useRef(false);

  const stop = useCallback((): void => {
    wantsToListenRef.current = false;
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {
        // Already stopped — fine.
      }
    }
    setIsListening(false);
    setInterimText('');
  }, []);

  const start = useCallback((): void => {
    const Ctor = getRecognitionConstructor();
    if (!Ctor) return;
    if (recognitionRef.current) return; // already running
    setError(null);
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang ?? (typeof navigator !== 'undefined' ? navigator.language : 'en-US');

    rec.onstart = () => {
      wantsToListenRef.current = true;
      setIsListening(true);
    };
    rec.onend = () => {
      setIsListening(false);
      setInterimText('');
      // If the user hasn't asked to stop, restart — Web Speech
      // recognition naturally ends after silence; users expect a
      // continuous dictation session until they hit Stop.
      const wants = wantsToListenRef.current;
      recognitionRef.current = null;
      if (wants) {
        try {
          start();
        } catch {
          // Some browsers throw if start() is called too quickly
          // after end. Best-effort.
        }
      }
    };
    rec.onresult = (e) => {
      let interim = '';
      let finalChunk = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalChunk += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (finalChunk) onFinalTextRef.current?.(finalChunk);
      setInterimText(interim);
    };
    rec.onerror = (e) => {
      setError(e.error ?? 'unknown');
      // Permission denied / network errors are terminal; don't auto-
      // restart, drop wantsToListen so onend doesn't loop.
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        wantsToListenRef.current = false;
      }
    };

    recognitionRef.current = rec;
    try {
      rec.start();
    } catch {
      recognitionRef.current = null;
      setError('start-failed');
    }
  }, [lang]);

  const toggle = useCallback((): void => {
    if (isListening) stop();
    else start();
  }, [isListening, start, stop]);

  // Stop on unmount so the mic doesn't keep listening after the
  // editor unmounts (e.g. SPA navigation away from the doc).
  useEffect(() => {
    return () => {
      wantsToListenRef.current = false;
      const rec = recognitionRef.current;
      if (rec) {
        try {
          rec.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return { supported, isListening, interimText, error, start, stop, toggle };
}
