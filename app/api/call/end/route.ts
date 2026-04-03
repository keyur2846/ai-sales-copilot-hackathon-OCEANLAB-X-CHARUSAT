export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { generateCallSummary } from '@/lib/gemini';
import { adminDb } from '@/lib/firebase-admin';
import type { Call } from '@/types';

interface EndCallRequestBody {
  callId: string;
}

function isValidRequestBody(body: unknown): body is EndCallRequestBody {
  if (typeof body !== 'object' || body === null) return false;
  return typeof (body as Record<string, unknown>).callId === 'string';
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();

    if (!isValidRequestBody(body)) {
      return NextResponse.json(
        { error: 'Invalid request body. Required: callId (string).' },
        { status: 400 }
      );
    }

    const { callId } = body;

    // Read the call document from Firestore
    const callDoc = await adminDb.collection('calls').doc(callId).get();

    if (!callDoc.exists) {
      return NextResponse.json(
        { error: 'Call not found.' },
        { status: 404 }
      );
    }

    const callData = callDoc.data() as Omit<Call, 'id'>;

    // Generate the call summary via Gemini
    const summary = await generateCallSummary(
      callData.transcript,
      callData.contactName,
      callData.contactCompany
    );

    // Update the call document with ended status and summary
    await adminDb.collection('calls').doc(callId).update({
      status: 'ended',
      endedAt: Date.now(),
      summary,
    });

    return NextResponse.json({ success: true, summary });
  } catch (error) {
    console.error('End call API error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
