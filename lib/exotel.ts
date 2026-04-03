const EXOTEL_API_KEY = process.env.EXOTEL_API_KEY!;
const EXOTEL_API_TOKEN = process.env.EXOTEL_API_TOKEN!;
const EXOTEL_ACCOUNT_SID = process.env.EXOTEL_ACCOUNT_SID!;
const EXOTEL_AGENT_NUMBER = process.env.EXOTEL_AGENT_NUMBER!;
const EXOTEL_APP_ID = process.env.EXOTEL_APP_ID;

const BASE_URL = `https://api.exotel.com/v1/Accounts/${EXOTEL_ACCOUNT_SID}`;

function getAuthHeader(): string {
  const credentials = Buffer.from(
    `${EXOTEL_API_KEY}:${EXOTEL_API_TOKEN}`
  ).toString("base64");
  return `Basic ${credentials}`;
}

/**
 * Initiates an outbound call via Exotel, routing through a flow that
 * contains a Voicebot applet (bidirectional WebSocket streaming).
 */
export async function initiateCall(
  customerPhone: string,
  callId: string,
  webhookBaseUrl: string
) {
  if (!EXOTEL_APP_ID) {
    console.warn("[Exotel] EXOTEL_APP_ID is not set — skipping call.");
    return null;
  }

  const flowUrl = `http://my.exotel.com/${EXOTEL_ACCOUNT_SID}/exoml/start_voice/${EXOTEL_APP_ID}`;

  const formData = new URLSearchParams({
    From: customerPhone,
    CallerId: EXOTEL_AGENT_NUMBER,
    Url: flowUrl,
    CallType: "trans",
    StatusCallback: `${webhookBaseUrl}/api/exotel/webhook`,
    CustomField: callId,
  });

  console.log("[Exotel] Initiating call", {
    customerPhone,
    callId,
    flowUrl,
    callerId: EXOTEL_AGENT_NUMBER,
  });

  const response = await fetch(`${BASE_URL}/Calls/connect.json`, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  });

  const responseBody = await response.text();

  if (!response.ok) {
    console.error("[Exotel] API error", { status: response.status, body: responseBody });
    throw new Error(`Exotel API error: ${response.status} ${responseBody}`);
  }

  const data = JSON.parse(responseBody);
  console.log("[Exotel] Call initiated", {
    callSid: data?.Call?.Sid ?? "unknown",
    status: data?.Call?.Status ?? "unknown",
  });

  return data;
}
