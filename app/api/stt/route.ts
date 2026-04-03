import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const SARVAM_API_KEY = process.env.SARVAM_API_KEY;

/**
 * Receives a WAV audio chunk from the browser, sends to Sarvam.ai REST STT,
 * and writes the transcript to Firestore.
 */
export async function POST(request: Request) {
  if (!SARVAM_API_KEY) {
    return NextResponse.json({ error: "SARVAM_API_KEY not set" }, { status: 500 });
  }

  try {
    const formData = await request.formData();
    const audio = formData.get("audio") as File | null;
    const callId = formData.get("callId") as string;
    const speaker = formData.get("speaker") as "customer" | "agent";

    if (!audio || !callId || !speaker) {
      return NextResponse.json({ error: "Missing audio, callId, or speaker" }, { status: 400 });
    }

    console.log(`[stt] Received ${speaker} audio: ${(audio.size / 1024).toFixed(1)}KB, type=${audio.type}`);

    // Forward WAV directly to Sarvam.ai
    const sarvamForm = new FormData();
    sarvamForm.append("file", audio, "speech.wav");
    sarvamForm.append("model", "saarika:v2.5");
    sarvamForm.append("language_code", "unknown");

    const sarvamRes = await fetch("https://api.sarvam.ai/speech-to-text", {
      method: "POST",
      headers: { "api-subscription-key": SARVAM_API_KEY },
      body: sarvamForm,
    });

    if (!sarvamRes.ok) {
      const err = await sarvamRes.text();
      console.error("[stt] Sarvam.ai error:", sarvamRes.status, err);
      return NextResponse.json({ error: "STT failed", details: err }, { status: 502 });
    }

    const result = await sarvamRes.json();
    const transcript = result.transcript?.trim();

    if (!transcript) {
      return NextResponse.json({ transcript: "" });
    }

    console.log(`[stt] ${speaker}: "${transcript}"`);

    // Write to Firestore
    const callRef = getAdminDb().collection("calls").doc(callId);
    await callRef.update({
      transcript: FieldValue.arrayUnion({
        speaker,
        text: transcript,
        timestamp: Date.now(),
      }),
    });

    return NextResponse.json({ transcript, language: result.language_code });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[stt] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
