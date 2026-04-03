"use client";

import { useEffect, useRef } from "react";
import { db } from "@/lib/firebase";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";

const SARVAM_API_KEY = process.env.NEXT_PUBLIC_SARVAM_API_KEY ?? "";
const CHUNK_MS = 250;

export interface STTConfig {
  languageCode: string; // "unknown", "hi-IN", "gu-IN", "en-IN", etc.
  mode: string;         // "transcribe", "translit"
}

export const DEFAULT_STT_CONFIG: STTConfig = {
  languageCode: "unknown",
  mode: "transcribe",
};

function buildSarvamUrl(config: STTConfig): string {
  return `wss://api.sarvam.ai/speech-to-text/ws?language-code=${config.languageCode}&model=saaras:v3&mode=${config.mode}`;
}

/**
 * Connects a MediaStream directly to Sarvam.ai's streaming WebSocket.
 * Captures PCM at 16kHz, sends as base64, receives real-time transcripts.
 * Writes each transcript to Firestore.
 */
export function useStreamSTT(
  stream: MediaStream | null,
  callId: string,
  speaker: "customer" | "agent",
  isActive: boolean,
  config: STTConfig = DEFAULT_STT_CONFIG
) {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!stream || !isActive || !callId || !SARVAM_API_KEY) return;

    let destroyed = false;
    let audioContext: AudioContext | null = null;
    let scriptNode: ScriptProcessorNode | null = null;
    let ws: WebSocket | null = null;
    let pcmBuffer: Int16Array[] = [];
    let sendInterval: ReturnType<typeof setInterval> | null = null;

    function float32ToInt16(float32: Float32Array): Int16Array {
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      return int16;
    }

    function int16ToBase64(int16: Int16Array): string {
      const bytes = new Uint8Array(int16.buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    }

    function setup() {
      if (!stream) return;

      // Audio capture at 16kHz
      audioContext = new AudioContext({ sampleRate: 16000 });
      const source = audioContext.createMediaStreamSource(stream);
      scriptNode = audioContext.createScriptProcessor(4096, 1, 1);

      scriptNode.onaudioprocess = (e) => {
        if (destroyed) return;
        const pcm = float32ToInt16(e.inputBuffer.getChannelData(0));
        pcmBuffer.push(pcm);
      };

      source.connect(scriptNode);
      scriptNode.connect(audioContext.destination);

      // Connect to Sarvam.ai WebSocket with subprotocol auth
      const wsUrl = buildSarvamUrl(config);
      ws = new WebSocket(wsUrl, [`api-subscription-key.${SARVAM_API_KEY}`]);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`[stt:${speaker}] Connected to Sarvam.ai streaming`);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === "data" && msg.data?.transcript) {
            const transcript = msg.data.transcript.trim();
            if (transcript) {
              console.log(`[stt:${speaker}] "${transcript}"`);
              // Write to Firestore
              const callRef = doc(db, "calls", callId);
              updateDoc(callRef, {
                transcript: arrayUnion({
                  speaker,
                  text: transcript,
                  timestamp: Date.now(),
                }),
              }).catch((err) => console.error(`[stt:${speaker}] Firestore write error:`, err));
            }
          } else if (msg.type === "error") {
            console.error(`[stt:${speaker}] Sarvam error:`, msg);
          }
        } catch {
          // Non-JSON message, ignore
        }
      };

      ws.onerror = (e) => {
        console.error(`[stt:${speaker}] WebSocket error:`, e);
      };

      ws.onclose = (e) => {
        console.log(`[stt:${speaker}] WebSocket closed: code=${e.code}`);
      };

      // Send accumulated PCM chunks every CHUNK_MS
      sendInterval = setInterval(() => {
        if (!ws || ws.readyState !== WebSocket.OPEN || pcmBuffer.length === 0) return;

        // Merge all buffered PCM chunks
        const totalLen = pcmBuffer.reduce((s, b) => s + b.length, 0);
        const merged = new Int16Array(totalLen);
        let offset = 0;
        for (const buf of pcmBuffer) {
          merged.set(buf, offset);
          offset += buf.length;
        }
        pcmBuffer = [];

        // Send as base64 JSON
        const base64 = int16ToBase64(merged);
        ws.send(JSON.stringify({
          audio: {
            data: base64,
            sample_rate: 16000,
            encoding: "audio/wav",
          },
        }));
      }, CHUNK_MS);
    }

    setup();

    return () => {
      destroyed = true;
      if (sendInterval) clearInterval(sendInterval);
      if (scriptNode) {
        scriptNode.disconnect();
        scriptNode.onaudioprocess = null;
      }
      if (audioContext) audioContext.close().catch(() => {});
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
      wsRef.current = null;
    };
  }, [stream, callId, speaker, isActive, config.languageCode, config.mode]);
}
