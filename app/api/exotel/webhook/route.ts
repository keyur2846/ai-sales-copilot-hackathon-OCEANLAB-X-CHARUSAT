import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

/**
 * Exotel status callback webhook.
 *
 * Exotel sends POST requests with form-encoded bodies when call status
 * changes. We look for terminal statuses (completed, no-answer, failed)
 * and update the corresponding Firestore document.
 *
 * Exotel sends a `CustomField` parameter that we set to our internal
 * callId when initiating the call (see lib/exotel.ts).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const formData = await req.formData();

    // Extract fields from Exotel callback
    const callStatus = formData.get('Status')?.toString()?.toLowerCase() ?? '';
    const callSid = formData.get('CallSid')?.toString() ?? '';
    const customField = formData.get('CustomField')?.toString() ?? '';

    // The callId is passed via CustomField when we initiate the call
    const callId = customField || callSid;

    console.log(
      `[exotel-webhook] Received callback -- callId=${callId} status=${callStatus} callSid=${callSid}`,
    );

    // Log all form data keys for debugging
    const allFields: Record<string, string> = {};
    formData.forEach((value, key) => {
      allFields[key] = value.toString();
    });
    console.log('[exotel-webhook] Full payload:', JSON.stringify(allFields));

    // Handle terminal call statuses
    const terminalStatuses = ['completed', 'no-answer', 'failed', 'busy'];
    if (terminalStatuses.includes(callStatus) && callId) {
      console.log(
        `[exotel-webhook] Call ${callId} reached terminal status: ${callStatus}`,
      );

      const callRef = adminDb.collection('calls').doc(callId);
      await callRef.update({
        status: 'ended',
        endedAt: Date.now(),
        exotelStatus: callStatus,
      });

      console.log(`[exotel-webhook] Updated Firestore for call ${callId}`);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('[exotel-webhook] Error processing callback:', err);

    // Always return 200 to Exotel so it doesn't retry
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
