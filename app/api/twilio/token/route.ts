import { NextResponse } from "next/server";
import twilio from "twilio";

export async function POST(request: Request) {
  const { identity } = await request.json();

  const accessToken = new twilio.jwt.AccessToken(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_API_KEY_SID!,
    process.env.TWILIO_API_KEY_SECRET!,
    { identity: identity || "demo-agent" }
  );

  const voiceGrant = new twilio.jwt.AccessToken.VoiceGrant({
    outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID!,
    incomingAllow: false,
  });

  accessToken.addGrant(voiceGrant);

  return NextResponse.json({ token: accessToken.toJwt() });
}
