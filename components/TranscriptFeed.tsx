"use client";

import { useEffect, useRef } from "react";
import type { TranscriptEntry } from "@/types";

interface TranscriptFeedProps {
  transcript: TranscriptEntry[];
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

export function TranscriptFeed({ transcript }: TranscriptFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript.length]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-4 py-3 space-y-3 font-mono text-sm"
    >
      {transcript.length === 0 && (
        <div className="flex items-center justify-center h-full">
          <p className="text-[#555] text-sm">
            Call started. Waiting for conversation...
          </p>
        </div>
      )}

      {transcript.map((entry, index) => {
        const isCustomer = entry.speaker === "customer";

        return (
          <div
            key={`${entry.timestamp}-${index}`}
            className={`flex flex-col gap-0.5 ${
              isCustomer ? "items-start" : "items-end"
            }`}
          >
            <span
              className={`text-[10px] uppercase tracking-widest ${
                isCustomer ? "text-[#666]" : "text-[#00ff88]/60"
              }`}
            >
              {isCustomer ? "Customer" : "You"}
            </span>

            <div
              className={`max-w-[85%] px-3 py-2 border ${
                isCustomer
                  ? "border-[#333] text-[#999] bg-[#111]"
                  : "border-[#00ff88]/20 text-[#00ff88] bg-[#00ff88]/5"
              }`}
            >
              <p className="leading-relaxed break-words">{entry.text}</p>
            </div>

            <span className="text-[9px] text-[#444] tabular-nums">
              {formatTime(entry.timestamp)}
            </span>
          </div>
        );
      })}

      <div ref={bottomRef} />
    </div>
  );
}
