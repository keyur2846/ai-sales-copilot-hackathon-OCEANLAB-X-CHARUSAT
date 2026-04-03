export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { streamTeleprompterResponse } from '@/lib/gemini';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

interface TeleprompterRequestBody {
  callId: string;
  customerUtterance: string;
  history: Array<{ speaker: string; text: string }>;
}

function isValidRequestBody(body: unknown): body is TeleprompterRequestBody {
  if (typeof body !== 'object' || body === null) return false;
  const obj = body as Record<string, unknown>;
  return (
    typeof obj.callId === 'string' &&
    typeof obj.customerUtterance === 'string' &&
    Array.isArray(obj.history) &&
    obj.history.every(
      (entry: unknown) =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as Record<string, unknown>).speaker === 'string' &&
        typeof (entry as Record<string, unknown>).text === 'string'
    )
  );
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();

    if (!isValidRequestBody(body)) {
      return NextResponse.json(
        { error: 'Invalid request body. Required: callId (string), customerUtterance (string), history (array).' },
        { status: 400 }
      );
    }

    const { callId, customerUtterance, history } = body;

    const geminiStream = await streamTeleprompterResponse(customerUtterance, history);

    let fullResponse = '';
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of geminiStream) {
            const text = chunk.text ?? '';
            fullResponse += text;
            controller.enqueue(new TextEncoder().encode(text));
          }
          controller.close();

          // Persist the completed response to Firestore after the stream finishes
          await adminDb.collection('calls').doc(callId).update({
            teleprompterHistory: FieldValue.arrayUnion(fullResponse),
          });
        } catch (streamError) {
          controller.error(streamError);
        }
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (error) {
    console.error('Teleprompter API error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
