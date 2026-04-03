"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Peer from "peerjs";
import { Phone, PhoneOff, Mic } from "lucide-react";

export default function CustomerCallPage() {
  const params = useParams<{ callId: string }>();
  const callId = params.callId;

  const [status, setStatus] = useState<"connecting" | "ringing" | "connected" | "ended">("connecting");
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const peerRef = useRef<Peer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let destroyed = false;

    async function joinCall() {
      // Get mic
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
      } catch {
        setError("Microphone permission denied. Please allow mic access.");
        return;
      }

      if (destroyed) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;

      // Connect as a random peer
      const peer = new Peer();
      peerRef.current = peer;

      peer.on("open", () => {
        if (destroyed) return;
        setStatus("ringing");

        // Call the agent's peer
        const agentPeerId = `agent-${callId}`;
        const call = peer.call(agentPeerId, stream);

        call.on("stream", (agentStream) => {
          if (destroyed) return;
          setStatus("connected");
          // Play agent's audio
          if (audioRef.current) {
            audioRef.current.srcObject = agentStream;
            audioRef.current.play().catch(() => {});
          }
        });

        call.on("close", () => {
          setStatus("ended");
        });

        call.on("error", (err) => {
          setError(err.message);
        });
      });

      peer.on("error", (err) => {
        setError(err.message);
      });
    }

    joinCall();

    return () => {
      destroyed = true;
      peerRef.current?.destroy();
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [callId]);

  function handleHangUp() {
    peerRef.current?.destroy();
    streamRef.current?.getTracks().forEach(t => t.stop());
    setStatus("ended");
  }

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-[#0a0a0a] text-white gap-6 font-mono">
      <audio ref={audioRef} autoPlay />

      {status === "connecting" && (
        <>
          <div className="size-16 border-4 border-[#333] border-t-[#00ff88] rounded-full animate-spin" />
          <p className="text-[#888]">Connecting to call...</p>
        </>
      )}

      {status === "ringing" && (
        <>
          <div className="size-16 border-4 border-[#333] border-t-yellow-500 rounded-full animate-spin" />
          <p className="text-yellow-500">Ringing agent...</p>
        </>
      )}

      {status === "connected" && (
        <>
          <div className="flex items-center gap-3">
            <span className="relative flex size-3">
              <span className="absolute inline-flex h-full w-full animate-ping bg-[#00ff88] opacity-75 rounded-full" />
              <span className="relative inline-flex size-3 bg-[#00ff88] rounded-full" />
            </span>
            <Mic className="size-5 text-[#00ff88]" />
            <span className="text-[#00ff88] text-lg">Connected</span>
          </div>
          <p className="text-[#666] text-sm">You are in a call with the sales agent</p>
          <button
            onClick={handleHangUp}
            className="mt-8 flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-semibold"
          >
            <PhoneOff className="size-4" />
            Hang Up
          </button>
        </>
      )}

      {status === "ended" && (
        <>
          <Phone className="size-8 text-[#555]" />
          <p className="text-[#888]">Call ended</p>
        </>
      )}

      {error && (
        <p className="text-red-400 text-sm mt-4">{error}</p>
      )}
    </div>
  );
}
