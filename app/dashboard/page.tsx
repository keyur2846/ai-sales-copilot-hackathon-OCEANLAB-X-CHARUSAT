"use client";

import { DEMO_CONTACTS } from "@/types";
import { ContactCard } from "@/components/ContactCard";

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <header className="mb-12">
          <h1 className="text-3xl font-bold tracking-tight text-white font-mono">
            AI Sales Copilot
          </h1>
          <p className="mt-2 text-sm text-[#888] font-mono">
            Select a contact to start a call
          </p>
          <div className="mt-4 h-px w-full bg-[#333]" />
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {DEMO_CONTACTS.map((contact) => (
            <ContactCard key={contact.id} contact={contact} />
          ))}
        </div>
      </div>
    </div>
  );
}
