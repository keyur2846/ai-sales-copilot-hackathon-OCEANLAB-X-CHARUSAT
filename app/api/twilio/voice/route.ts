import twilio from "twilio";

/**
 * TwiML webhook — Twilio calls this when the browser client initiates a call.
 * Returns TwiML that tells Twilio to dial the customer's phone number.
 */
export async function POST(request: Request) {
  const formData = await request.formData();
  const to = formData.get("To")?.toString() || "";
  const callId = formData.get("callId")?.toString() || "";

  console.log("[twilio/voice] Incoming call request", { to, callId });

  const response = new twilio.twiml.VoiceResponse();

  if (to) {
    const dial = response.dial({
      callerId: process.env.TWILIO_PHONE_NUMBER!,
      answerOnBridge: true,
    });
    dial.number(to);
  } else {
    response.say("No phone number provided.");
  }

  return new Response(response.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
}
