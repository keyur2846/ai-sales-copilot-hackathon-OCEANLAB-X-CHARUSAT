import { NextResponse } from "next/server";

/**
 * Dynamic WebSocket URL callback for Exotel Stream applet.
 *
 * When the Exotel flow's Stream applet is configured with an https:// URL,
 * Exotel POSTs to it and expects a JSON response containing the wss:// URL
 * to connect to for bidirectional audio streaming.
 */
export async function POST(request: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const wsProtocol = appUrl.startsWith("https") ? "wss" : "ws";
  const wsHost = appUrl.replace(/^https?:\/\//, "");

  // Try to extract CustomField (our callId) from the request
  let callId = "stream";
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("json")) {
      const body = await request.json();
      callId = body?.CustomField ?? body?.customParameters?.CustomField ?? "stream";
    } else {
      const formData = await request.formData();
      callId = formData.get("CustomField")?.toString() ?? "stream";
    }
  } catch {
    // Fall back to "stream" — the server will resolve callId from the start event
  }

  const wsUrl = `${wsProtocol}://${wsHost}/ws/exotel/${callId}`;

  console.log(`[exotel/stream-url] Returning WebSocket URL: ${wsUrl}`);

  // Exotel expects a specific response format
  return NextResponse.json({ url: wsUrl });
}

export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const wsProtocol = appUrl.startsWith("https") ? "wss" : "ws";
  const wsHost = appUrl.replace(/^https?:\/\//, "");
  const wsUrl = `${wsProtocol}://${wsHost}/ws/exotel/stream`;

  console.log(`[exotel/stream-url] GET returning WebSocket URL: ${wsUrl}`);

  return NextResponse.json({ url: wsUrl });
}
