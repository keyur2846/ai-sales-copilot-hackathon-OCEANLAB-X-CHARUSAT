export interface Contact {
  id: string;
  name: string;
  company: string;
  phone: string;
  role: string;
}

export interface TranscriptEntry {
  speaker: "customer" | "agent";
  text: string;
  timestamp: number;
}

export interface Call {
  id: string;
  agentId: string;
  contactId: string;
  contactName: string;
  contactCompany: string;
  contactPhone: string;
  status: "active" | "ended";
  startedAt: number;
  endedAt: number | null;
  transcript: TranscriptEntry[];
  teleprompterHistory: string[];
  summary: string | null;
}

export const DEMO_AGENT_ID = "demo-agent";

export const DEMO_CONTACTS: Contact[] = [
  {
    id: "contact-1",
    name: "Rajesh Sharma",
    company: "TechFlow Solutions",
    phone: "+918141206459",
    role: "VP of Engineering",
  },
  {
    id: "contact-2",
    name: "Priya Patel",
    company: "DataSync Corp",
    phone: "+919876543211",
    role: "Head of Operations",
  },
  {
    id: "contact-3",
    name: "Amit Verma",
    company: "CloudNine Analytics",
    phone: "+919876543212",
    role: "CTO",
  },
  {
    id: "contact-4",
    name: "Sneha Reddy",
    company: "FinEdge Systems",
    phone: "+919876543213",
    role: "Director of Product",
  },
];
