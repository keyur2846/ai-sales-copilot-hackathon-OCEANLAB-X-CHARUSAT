"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 1000;

interface UseMicCaptureReturn {
  isMicActive: boolean;
  micError: string | null;
  stopMic: () => void;
}

export function useMicCapture(
  callId: string,
  isActive: boolean
): UseMicCaptureReturn {
  const [isMicActive, setIsMicActive] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCleaningUpRef = useRef(false);

  /**
   * Opens a WebSocket connection to the agent audio bridge.
   * Automatically retries up to MAX_RECONNECT_ATTEMPTS on unexpected close.
   */
  const connectWebSocket = useCallback((): WebSocket => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.hostname}:${window.location.port}/ws/agent/${callId}`;
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";

    ws.addEventListener("open", () => {
      reconnectAttemptsRef.current = 0;
    });

    ws.addEventListener("close", () => {
      if (isCleaningUpRef.current) return;

      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current += 1;
        reconnectTimerRef.current = setTimeout(() => {
          if (!isCleaningUpRef.current) {
            wsRef.current = connectWebSocket();
          }
        }, RECONNECT_DELAY_MS);
      } else {
        setMicError("WebSocket connection lost after multiple retries");
        setIsMicActive(false);
      }
    });

    ws.addEventListener("error", () => {
      // The close handler will take care of retry logic.
      // Only surface an error if we have exhausted retries.
    });

    wsRef.current = ws;
    return ws;
  }, [callId]);

  /**
   * Acquires the mic stream, sets up the AudioWorklet pipeline, and opens the
   * WebSocket. PCM buffers produced by the worklet are forwarded directly over
   * the socket as binary messages.
   */
  const startMic = useCallback(async () => {
    setMicError(null);
    isCleaningUpRef.current = false;

    // 1. Acquire microphone stream with echo/noise cancellation
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
        },
      });
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone permission denied. Please allow mic access and try again."
          : "Failed to access microphone. Check browser permissions.";
      setMicError(message);
      return;
    }

    streamRef.current = stream;

    // 2. Create AudioContext at the browser's preferred sample rate
    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;

    // 3. Load the AudioWorklet processor (served from /public)
    try {
      await audioContext.audioWorklet.addModule("/audio-processor.js");
    } catch {
      setMicError("Failed to load audio processor module.");
      stream.getTracks().forEach((t) => t.stop());
      await audioContext.close();
      return;
    }

    // 4. Wire up: mic source -> AudioWorkletNode
    const source = audioContext.createMediaStreamSource(stream);
    const workletNode = new AudioWorkletNode(audioContext, "audio-processor");
    workletNodeRef.current = workletNode;
    source.connect(workletNode);

    // The worklet node does not produce audible output — do NOT connect it to
    // audioContext.destination. That would play the mic back through the
    // speakers and cause feedback.

    // 5. Open WebSocket to the agent audio bridge
    const ws = connectWebSocket();

    // 6. Forward PCM buffers from the worklet to the WebSocket
    workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(event.data);
      } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        // If the original ws reference was replaced by a reconnect, use the
        // current ref instead.
        wsRef.current.send(event.data);
      }
    };

    setIsMicActive(true);
  }, [connectWebSocket]);

  /**
   * Tears down every resource: WebSocket, AudioContext, MediaStream tracks,
   * and reconnection timers.
   */
  const stopMic = useCallback(() => {
    isCleaningUpRef.current = true;

    // Cancel any pending reconnect timer
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Disconnect worklet node
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }

    // Close AudioContext
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {
        // AudioContext.close() can reject if already closed; safe to ignore.
      });
      audioContextRef.current = null;
    }

    // Stop all media tracks (releases the mic indicator in the browser)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    reconnectAttemptsRef.current = 0;
    setIsMicActive(false);
  }, []);

  // Lifecycle: start when active, clean up when inactive or on unmount
  useEffect(() => {
    if (isActive) {
      startMic();
    }

    return () => {
      stopMic();
    };
  }, [isActive, startMic, stopMic]);

  return { isMicActive, micError, stopMic };
}
