"use client";

import { useEffect, useRef } from "react";

const SILENCE_THRESHOLD = 0.015;
const SILENCE_DURATION_MS = 800;
const MIN_SPEECH_SAMPLES = 8000; // ~0.5s at 16kHz

/**
 * VAD-based STT: captures raw PCM from a MediaStream via AudioWorklet-like approach,
 * detects silence, encodes as WAV, and sends to /api/stt.
 *
 * Uses ScriptProcessorNode (deprecated but universally supported) to get raw PCM,
 * which we encode as a proper WAV file — no MediaRecorder webm issues.
 */
export function useStreamSTT(
  stream: MediaStream | null,
  callId: string,
  speaker: "customer" | "agent",
  isActive: boolean
) {
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!stream || !isActive || !callId) return;

    let destroyed = false;
    let audioContext: AudioContext | null = null;
    let scriptNode: ScriptProcessorNode | null = null;

    // Accumulate PCM samples during speech
    let speechBuffer: Float32Array[] = [];
    let isSpeaking = false;
    let silenceStart = 0;
    let isProcessing = false;

    function setup() {
      if (!stream) return;

      audioContext = new AudioContext({ sampleRate: 16000 }); // Sarvam wants 16kHz
      const source = audioContext.createMediaStreamSource(stream);

      // ScriptProcessor to capture raw PCM
      scriptNode = audioContext.createScriptProcessor(4096, 1, 1);

      scriptNode.onaudioprocess = (e) => {
        if (destroyed) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const now = Date.now();

        // Calculate RMS
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
        const rms = Math.sqrt(sum / inputData.length);

        if (rms > SILENCE_THRESHOLD) {
          // Sound detected
          if (!isSpeaking) {
            isSpeaking = true;
            speechBuffer = [];
          }
          speechBuffer.push(new Float32Array(inputData));
          silenceStart = 0;
        } else if (isSpeaking) {
          // Silence during speech — keep buffering briefly
          speechBuffer.push(new Float32Array(inputData));

          if (silenceStart === 0) {
            silenceStart = now;
          } else if (now - silenceStart >= SILENCE_DURATION_MS) {
            // Speaker stopped — send accumulated audio
            isSpeaking = false;
            silenceStart = 0;

            const totalSamples = speechBuffer.reduce((s, b) => s + b.length, 0);
            if (totalSamples >= MIN_SPEECH_SAMPLES && !isProcessing) {
              const pcm = mergeSpeechBuffer(speechBuffer);
              speechBuffer = [];
              sendAudio(pcm);
            } else {
              speechBuffer = [];
            }
          }
        }
      };

      source.connect(scriptNode);
      scriptNode.connect(audioContext.destination); // Required for scriptProcessor to fire
    }

    function mergeSpeechBuffer(buffers: Float32Array[]): Float32Array {
      const totalLength = buffers.reduce((s, b) => s + b.length, 0);
      const result = new Float32Array(totalLength);
      let offset = 0;
      for (const buf of buffers) {
        result.set(buf, offset);
        offset += buf.length;
      }
      return result;
    }

    function encodeWAV(pcm: Float32Array, sampleRate: number): Blob {
      const numChannels = 1;
      const bitsPerSample = 16;
      const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
      const blockAlign = numChannels * (bitsPerSample / 8);
      const dataSize = pcm.length * (bitsPerSample / 8);
      const headerSize = 44;

      const buffer = new ArrayBuffer(headerSize + dataSize);
      const view = new DataView(buffer);

      // WAV header
      writeString(view, 0, "RIFF");
      view.setUint32(4, 36 + dataSize, true);
      writeString(view, 8, "WAVE");
      writeString(view, 12, "fmt ");
      view.setUint32(16, 16, true); // PCM chunk size
      view.setUint16(20, 1, true); // PCM format
      view.setUint16(22, numChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, byteRate, true);
      view.setUint16(32, blockAlign, true);
      view.setUint16(34, bitsPerSample, true);
      writeString(view, 36, "data");
      view.setUint32(40, dataSize, true);

      // PCM data — convert float32 to int16
      let offset = 44;
      for (let i = 0; i < pcm.length; i++) {
        const sample = Math.max(-1, Math.min(1, pcm[i]));
        const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(offset, int16, true);
        offset += 2;
      }

      return new Blob([buffer], { type: "audio/wav" });
    }

    function writeString(view: DataView, offset: number, str: string) {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    }

    async function sendAudio(pcm: Float32Array) {
      if (isProcessing) return;
      isProcessing = true;

      try {
        const wavBlob = encodeWAV(pcm, 16000);
        console.log(`[stt:${speaker}] Sending ${(wavBlob.size / 1024).toFixed(1)}KB WAV (${(pcm.length / 16000).toFixed(1)}s)`);

        const formData = new FormData();
        formData.append("audio", wavBlob, "speech.wav");
        formData.append("callId", callId);
        formData.append("speaker", speaker);

        const res = await fetch("/api/stt", {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          if (data.transcript) {
            console.log(`[stt:${speaker}] ✓ "${data.transcript}"`);
          }
        } else {
          const err = await res.text();
          console.error(`[stt:${speaker}] HTTP ${res.status}: ${err}`);
        }
      } catch (err) {
        console.error(`[stt:${speaker}] Error:`, err);
      } finally {
        isProcessing = false;
      }
    }

    setup();

    return () => {
      destroyed = true;
      if (scriptNode) {
        scriptNode.disconnect();
        scriptNode.onaudioprocess = null;
      }
      if (audioContext) audioContext.close().catch(() => {});
    };
  }, [stream, callId, speaker, isActive]);
}
