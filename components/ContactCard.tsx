"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Contact } from "@/types";

interface ContactCardProps {
  contact: Contact;
}

export function ContactCard({ contact }: ContactCardProps) {
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);

  async function handleStartCall() {
    setIsStarting(true);

    try {
      const response = await fetch("/api/call/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contact.id }),
      });

      if (!response.ok) {
        throw new Error(`Failed to start call: ${response.status}`);
      }

      const data: { callId: string } = await response.json();
      router.push(`/dashboard/live-call/${data.callId}`);
    } catch (error) {
      console.error("Failed to start call:", error);
      setIsStarting(false);
    }
  }

  return (
    <div className="border border-[#333] bg-[#0a0a0a] p-6 rounded-sm transition-colors hover:border-[#555]">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <h3 className="text-lg font-semibold tracking-tight text-white">
              {contact.name}
            </h3>
            <div className="flex items-center gap-2 text-sm text-[#888]">
              <Building2 className="size-3.5" />
              <span>{contact.company}</span>
            </div>
          </div>
          <span className="border border-[#333] px-2 py-0.5 text-xs font-mono text-[#888] rounded-sm">
            {contact.role}
          </span>
        </div>

        <div className="flex items-center gap-2 text-sm text-[#666] font-mono">
          <Phone className="size-3.5" />
          <span>{contact.phone}</span>
        </div>

        <Button
          onClick={handleStartCall}
          disabled={isStarting}
          className="w-full h-10 rounded-sm bg-[#00ff88] text-black font-semibold hover:bg-[#00cc6a] border-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isStarting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              <span>Starting Call...</span>
            </>
          ) : (
            <>
              <Phone className="size-4" />
              <span>Start Call</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
