"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Phone, PhoneOff, Link2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TranscriptFeed } from "@/components/TranscriptFeed";
import { TeleprompterBlock } from "@/components/TeleprompterBlock";
import { useCallCopilot } from "@/hooks/useCallCopilot";
import { useWebRTCCall } from "@/hooks/useWebRTCCall";

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export default function LiveCallPage() {
  const params = useParams<{ callId: string }>();
  const callId = params.callId;

  const {
    transcript,
    teleprompterLine,
    isGenerating,
    callStatus,
    contactName,
    contactCompany,
    startedAt,
    endCall,
  } = useCallCopilot(callId);

  const { isReady, isOnCall, callLink, callError, remoteStream, hangUp } =
    useWebRTCCall(callId, callStatus === "active");

  const audioRef = useRef<HTMLAudioElement>(null);
  const [duration, setDuration] = useState(0);
  const [isEnding, setIsEnding] = useState(false);
  const [copied, setCopied] = useState(false);

  // Play customer audio through speakers
  useEffect(() => {
    if (remoteStream && audioRef.current) {
      audioRef.current.srcObject = remoteStream;
      audioRef.current.play().catch(() => {});
    }
  }, [remoteStream]);

  // Duration timer
  useEffect(() => {
    if (!startedAt || callStatus === "ended") return;
    const initialElapsed = Math.floor((Date.now() - startedAt) / 1000);
    setDuration(Math.max(0, initialElapsed));
    const interval = setInterval(() => {
      setDuration(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt, callStatus]);

  async function handleEndCall() {
    setIsEnding(true);
    hangUp();
    await endCall();
  }

  async function handleCopyLink() {
    if (!callLink) return;
    await navigator.clipboard.writeText(callLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0a] text-white overflow-hidden">
      {/* Hidden audio element for customer voice */}
      <audio ref={audioRef} autoPlay />

      {/* Top bar */}
      <header className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-[#333] shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping bg-[#00ff88] opacity-75" />
              <span className="relative inline-flex size-2 bg-[#00ff88]" />
            </span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-[#00ff88] font-mono">
              Live
            </span>
          </div>
          <div className="flex items-center gap-2 ml-2">
            <Phone className="size-3.5 text-[#555]" />
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-white leading-tight">
                {contactName || "Loading..."}
              </span>
              {contactCompany && (
                <span className="text-[10px] text-[#666] font-mono">{contactCompany}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            {isOnCall ? (
              <Mic className="size-3.5 text-[#00ff88]" />
            ) : (
              <MicOff className="size-3.5 text-[#555]" />
            )}
            <span className={`size-2 rounded-full ${isOnCall ? "bg-[#00ff88]" : isReady ? "bg-yellow-500" : "bg-[#555]"}`} />
            <span className="text-[10px] font-mono text-[#666]">
              {isOnCall ? "Connected" : isReady ? "Waiting for customer" : "Initializing..."}
            </span>
          </div>

          <span className="text-sm font-mono text-[#888] tabular-nums">
            {formatDuration(duration)}
          </span>

          <Button
            onClick={handleEndCall}
            disabled={isEnding || callStatus === "ended"}
            className="h-8 px-3 bg-red-600 text-white font-semibold text-xs uppercase tracking-wider hover:bg-red-500 border-0 rounded-none transition-colors disabled:opacity-50"
          >
            {isEnding ? (
              <span className="flex items-center gap-1.5">
                <span className="size-3 border-2 border-white/40 border-t-white animate-spin" />
                Ending...
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <PhoneOff className="size-3.5" />
                End Call
              </span>
            )}
          </Button>
        </div>
      </header>

      {/* Call link banner — show until customer joins */}
      {callLink && !isOnCall && (
        <div className="flex items-center gap-3 px-4 py-3 bg-[#111] border-b border-[#333] shrink-0">
          <Link2 className="size-4 text-[#00ff88] shrink-0" />
          <span className="text-xs text-[#888] font-mono">Send this link to the customer:</span>
          <code className="text-xs text-[#00ff88] bg-[#1a1a1a] px-2 py-1 border border-[#333] flex-1 truncate">
            {callLink}
          </code>
          <Button
            onClick={handleCopyLink}
            variant="ghost"
            className="h-7 px-2 text-xs font-mono text-[#00ff88] hover:bg-[#1a1a1a]"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      )}

      {callError && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-900/40 border-b border-red-700 text-red-300 text-xs font-mono shrink-0">
          <MicOff className="size-3.5 shrink-0" />
          <span>{callError}</span>
        </div>
      )}

      {/* Transcript — top 55% */}
      <div className="flex-[55] min-h-0 flex flex-col overflow-hidden">
        <TranscriptFeed transcript={transcript} />
      </div>

      {/* Teleprompter — bottom 45% */}
      <div className="flex-[45] min-h-0 overflow-y-auto bg-[#0d0d0d]">
        <TeleprompterBlock line={teleprompterLine} isGenerating={isGenerating} />
      </div>
    </div>
  );
}
