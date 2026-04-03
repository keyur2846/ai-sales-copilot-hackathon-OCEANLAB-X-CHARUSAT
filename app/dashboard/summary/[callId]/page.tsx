"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { doc, getDoc } from "firebase/firestore";
import { ArrowLeft, Clock, Calendar, Loader2 } from "lucide-react";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import type { Call, TranscriptEntry } from "@/types";

function formatDuration(startedAt: number, endedAt: number | null): string {
  if (!endedAt) return "--:--";
  const totalSeconds = Math.floor((endedAt - startedAt) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function StatusBadge({ status }: { status: Call["status"] }) {
  const isActive = status === "active";
  return (
    <span
      className={`border px-2 py-0.5 text-xs font-mono ${
        isActive
          ? "border-[#00ff88] text-[#00ff88]"
          : "border-[#333] text-[#888]"
      }`}
    >
      {status.toUpperCase()}
    </span>
  );
}

function TranscriptLine({ entry }: { entry: TranscriptEntry }) {
  const isAgent = entry.speaker === "agent";

  return (
    <div
      className={`flex ${isAgent ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[75%] border px-4 py-3 ${
          isAgent
            ? "border-[#00ff88]/30 bg-[#00ff88]/5 text-[#00ff88]"
            : "border-[#333] bg-[#111] text-[#ccc]"
        }`}
      >
        <p className="mb-1 text-[10px] uppercase tracking-wider text-[#666]">
          {entry.speaker}
        </p>
        <p className="font-mono text-xs leading-relaxed">{entry.text}</p>
      </div>
    </div>
  );
}

function SummaryLoadingState() {
  return (
    <div className="flex items-center gap-3 border border-[#333] p-6">
      <Loader2 className="size-5 animate-spin text-[#00ff88]" />
      <span className="animate-pulse text-[#888] font-mono text-sm">
        Generating summary...
      </span>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="animate-pulse space-y-8">
          <div className="h-8 w-48 bg-[#1a1a1a]" />
          <div className="h-4 w-64 bg-[#1a1a1a]" />
          <div className="h-px w-full bg-[#333]" />
          <div className="flex gap-4">
            <div className="h-6 w-24 bg-[#1a1a1a]" />
            <div className="h-6 w-32 bg-[#1a1a1a]" />
            <div className="h-6 w-16 bg-[#1a1a1a]" />
          </div>
          <div className="h-32 w-full bg-[#1a1a1a]" />
          <div className="space-y-3">
            <div className="h-16 w-3/4 bg-[#1a1a1a]" />
            <div className="ml-auto h-16 w-3/4 bg-[#1a1a1a]" />
            <div className="h-16 w-3/4 bg-[#1a1a1a]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="border border-red-500/30 p-6">
          <p className="font-mono text-sm text-red-400">{message}</p>
          <Link
            href="/dashboard"
            className="mt-4 inline-flex items-center gap-2 font-mono text-sm text-[#00ff88] hover:underline"
          >
            <ArrowLeft className="size-3.5" />
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function CallSummaryPage() {
  const params = useParams<{ callId: string }>();
  const callId = params.callId;

  const [call, setCall] = useState<Call | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCall = useCallback(async () => {
    if (!callId) return;

    try {
      const snap = await getDoc(doc(db, "calls", callId));
      if (snap.exists()) {
        setCall({ id: snap.id, ...snap.data() } as Call);
      } else {
        setError("Call not found.");
      }
    } catch (err) {
      console.error("Failed to load call:", err);
      setError("Failed to load call data.");
    } finally {
      setLoading(false);
    }
  }, [callId]);

  useEffect(() => {
    loadCall();
  }, [loadCall]);

  if (loading) {
    return <PageSkeleton />;
  }

  if (error || !call) {
    return <ErrorState message={error ?? "Call not found."} />;
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-white font-mono">
            Call Summary
          </h1>
          <p className="mt-2 text-sm text-[#888] font-mono">
            {call.contactName} &middot; {call.contactCompany}
          </p>
          <div className="mt-4 h-px w-full bg-[#333]" />
        </header>

        {/* Metadata row */}
        <div className="mb-8 flex flex-wrap items-center gap-4 font-mono text-sm text-[#888]">
          <div className="flex items-center gap-1.5">
            <Clock className="size-3.5" />
            <span>{formatDuration(call.startedAt, call.endedAt)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar className="size-3.5" />
            <span>{formatDate(call.startedAt)}</span>
          </div>
          <StatusBadge status={call.status} />
        </div>

        {/* AI Summary */}
        <section className="mb-10">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-[#666]">
            AI Summary
          </h2>
          {call.summary ? (
            <div className="border border-[#333] p-6">
              <p className="text-lg leading-relaxed text-white whitespace-pre-wrap">
                {call.summary}
              </p>
            </div>
          ) : (
            <SummaryLoadingState />
          )}
        </section>

        {/* Full Transcript */}
        <section className="mb-10">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-[#666]">
            Full Transcript
          </h2>
          {call.transcript.length > 0 ? (
            <div className="max-h-[600px] space-y-3 overflow-y-auto border border-[#333] p-4">
              {call.transcript.map((entry, index) => (
                <TranscriptLine key={index} entry={entry} />
              ))}
            </div>
          ) : (
            <div className="border border-[#333] p-6">
              <p className="font-mono text-sm text-[#666]">
                No transcript available.
              </p>
            </div>
          )}
        </section>

        {/* Back to Dashboard */}
        <div className="h-px w-full bg-[#333]" />
        <div className="mt-6">
          <Link href="/dashboard">
            <Button
              variant="ghost"
              className="gap-2 font-mono text-sm text-[#00ff88] hover:bg-[#00ff88]/10 hover:text-[#00ff88] px-0"
            >
              <ArrowLeft className="size-4" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
