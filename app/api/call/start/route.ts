import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { DEMO_CONTACTS, DEMO_AGENT_ID } from "@/types";

interface StartCallRequestBody {
  contactId: string;
}

export async function POST(request: Request) {
  try {
    const body: StartCallRequestBody = await request.json();
    const { contactId } = body;

    if (!contactId) {
      return NextResponse.json(
        { error: "contactId is required" },
        { status: 400 }
      );
    }

    const contact = DEMO_CONTACTS.find((c) => c.id === contactId);

    if (!contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 }
      );
    }

    const callDoc = await adminDb.collection("calls").add({
      agentId: DEMO_AGENT_ID,
      contactId,
      contactName: contact.name,
      contactCompany: contact.company,
      contactPhone: contact.phone,
      status: "active",
      startedAt: Date.now(),
      endedAt: null,
      transcript: [],
      teleprompterHistory: [],
      summary: null,
    });

    // Return callId + phone — browser will initiate the call via Twilio Device
    return NextResponse.json({
      callId: callDoc.id,
      phone: contact.phone,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed to start call:", message);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
