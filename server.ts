import { createServer, IncomingMessage, ServerResponse } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer, WebSocket } from 'ws';
import { createSarvamSTTConnection } from './lib/sarvam';
import { getAdminDb } from './lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

// ---------------------------------------------------------------------------
// Next.js setup
// ---------------------------------------------------------------------------
const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// ---------------------------------------------------------------------------
// Audio helpers
// ---------------------------------------------------------------------------

/**
 * Upsample PCM 16-bit audio from 8 kHz to 16 kHz using simple linear
 * interpolation (insert one interpolated sample between every pair).
 *
 * Input : Int16Array at 8 kHz
 * Output: Buffer containing PCM 16-bit LE samples at 16 kHz
 */
function upsample8kTo16k(pcm8k: Int16Array): Buffer {
  const length = pcm8k.length;
  if (length === 0) return Buffer.alloc(0);

  // Output has roughly 2x the samples
  const out = new Int16Array(length * 2 - 1);

  for (let i = 0; i < length - 1; i++) {
    out[i * 2] = pcm8k[i];
    // Linear interpolation between adjacent samples
    out[i * 2 + 1] = ((pcm8k[i] + pcm8k[i + 1]) >> 1);
  }
  // Last original sample
  out[(length - 1) * 2] = pcm8k[length - 1];

  // Convert Int16Array to a Node.js Buffer (little-endian, which is native)
  return Buffer.from(out.buffer, out.byteOffset, out.byteLength);
}

/**
 * Write a transcript chunk to Firestore under calls/{callId}.
 */
async function writeTranscriptToFirestore(
  callId: string,
  text: string,
  isFinal: boolean,
  speaker: 'customer' | 'agent',
): Promise<void> {
  try {
    const callRef = getAdminDb().collection('calls').doc(callId);

    await callRef.update({
      transcript: FieldValue.arrayUnion({
        speaker,
        text,
        timestamp: Date.now(),
        isFinal,
      }),
    });

    console.log(`[firestore] Wrote ${speaker} transcript chunk for call ${callId}`);
  } catch (err) {
    console.error(`[firestore] Failed to write ${speaker} transcript for call ${callId}:`, err);
  }
}

// ---------------------------------------------------------------------------
// Active call bridge state
// ---------------------------------------------------------------------------

interface CallBridge {
  exotelWs: WebSocket | null;
  agentWs: WebSocket | null;
  sarvamCustomerWs: WebSocket | null; // STT for customer audio
  sarvamAgentWs: WebSocket | null;    // STT for agent audio
  streamSid: string | null;           // Exotel stream SID — required in responses
}

const activeCalls = new Map<string, CallBridge>();

/**
 * Get or create a bridge entry for a given callId.
 */
function getOrCreateBridge(callId: string): CallBridge {
  let bridge = activeCalls.get(callId);
  if (!bridge) {
    bridge = {
      exotelWs: null,
      agentWs: null,
      sarvamCustomerWs: null,
      sarvamAgentWs: null,
      streamSid: null,
    };
    activeCalls.set(callId, bridge);
    console.log(`[bridge] Created bridge for call ${callId}`);
  }
  return bridge;
}

/**
 * Clean up all resources for a call and remove it from the active map.
 */
function cleanupBridge(callId: string): void {
  const bridge = activeCalls.get(callId);
  if (!bridge) return;

  // Close Sarvam customer STT
  if (bridge.sarvamCustomerWs && bridge.sarvamCustomerWs.readyState === WebSocket.OPEN) {
    bridge.sarvamCustomerWs.close(1000, 'Bridge cleanup');
  }
  bridge.sarvamCustomerWs = null;

  // Close Sarvam agent STT
  if (bridge.sarvamAgentWs && bridge.sarvamAgentWs.readyState === WebSocket.OPEN) {
    bridge.sarvamAgentWs.close(1000, 'Bridge cleanup');
  }
  bridge.sarvamAgentWs = null;

  // Only remove the bridge if both WebSocket endpoints are gone
  if (!bridge.exotelWs && !bridge.agentWs) {
    activeCalls.delete(callId);
    console.log(`[bridge] Removed bridge for call ${callId}`);
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
app.prepare().then(() => {
  // Create the HTTP server that serves Next.js
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const parsedUrl = parse(req.url || '/', true);
    handle(req, res, parsedUrl);
  });

  // -------------------------------------------------------------------------
  // WebSocket servers -- two paths for Exotel and browser agent
  // -------------------------------------------------------------------------
  // Disable perMessageDeflate — Exotel's Go client doesn't support compression negotiation
  const exotelWss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  const agentWss = new WebSocketServer({ noServer: true, perMessageDeflate: false });

  // Handle HTTP upgrade requests and route to the correct WSS
  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url || '/', true);

    // Match /ws/exotel/:callId OR /ws/exotel/stream (static URL for Exotel dashboard)
    const exotelMatch = pathname?.match(/^\/ws\/exotel\/([^/]+)$/);
    if (exotelMatch) {
      const callIdOrStream = exotelMatch[1];
      exotelWss.handleUpgrade(req, socket, head, (ws) => {
        // If path is /ws/exotel/stream, callId will be resolved from the Exotel "start" event
        // If path is /ws/exotel/{callId}, use the callId directly
        exotelWss.emit('connection', ws, req, callIdOrStream === 'stream' ? null : callIdOrStream);
      });
      return;
    }

    // Match /ws/agent/:callId
    const agentMatch = pathname?.match(/^\/ws\/agent\/([^/]+)$/);
    if (agentMatch) {
      agentWss.handleUpgrade(req, socket, head, (ws) => {
        agentWss.emit('connection', ws, req, agentMatch[1]);
      });
      return;
    }

    // All other upgrade requests (e.g. Next.js HMR /_next/webpack-hmr)
    // are left alone -- Next.js handles them internally via its own upgrade listener.
  });

  // -------------------------------------------------------------------------
  // Exotel WebSocket handler -- /ws/exotel/:callId
  // Receives JSON events: connected, start, media, stop
  // -------------------------------------------------------------------------
  exotelWss.on('connection', (ws: WebSocket, req: IncomingMessage, initialCallId: string | null) => {
    console.log(`[exotel] WebSocket connected${initialCallId ? ` for call ${initialCallId}` : ' (awaiting start event for callId)'}`);
    console.log(`[exotel] Headers:`, JSON.stringify({
      upgrade: req.headers.upgrade,
      origin: req.headers.origin,
      host: req.headers.host,
      'sec-websocket-protocol': req.headers['sec-websocket-protocol'],
      'sec-websocket-version': req.headers['sec-websocket-version'],
      'user-agent': req.headers['user-agent'],
    }));

    let callId = initialCallId;
    let bridge: CallBridge | null = callId ? getOrCreateBridge(callId) : null;
    if (bridge) bridge.exotelWs = ws;

    let customerAudioChunkCount = 0;

    function initBridge(resolvedCallId: string) {
      callId = resolvedCallId;
      bridge = getOrCreateBridge(callId);
      bridge.exotelWs = ws;

      // Open Sarvam.ai STT connection for customer audio
      bridge.sarvamCustomerWs = createSarvamSTTConnection(callId, (text, isFinal) => {
        writeTranscriptToFirestore(callId!, text, isFinal, 'customer');
      });

      console.log(`[exotel] Bridge initialized for call ${callId}`);
    }

    // If callId was provided in the URL, initialize immediately
    if (callId && bridge) {
      bridge.sarvamCustomerWs = createSarvamSTTConnection(callId, (text, isFinal) => {
        writeTranscriptToFirestore(callId!, text, isFinal, 'customer');
      });
    }

    // --- Exotel -> Server pipeline ---
    ws.on('message', (data: Buffer | string) => {
      let message: string;

      if (Buffer.isBuffer(data)) {
        message = data.toString('utf-8');
      } else {
        message = data.toString();
      }

      // Log every raw message for debugging
      console.log(`[exotel] RAW message (${message.length} chars): ${message.slice(0, 300)}`);

      try {
        const event = JSON.parse(message);

        switch (event.event) {
          case 'connected': {
            console.log(`[exotel] Stream connected event${callId ? ` for call ${callId}` : ''}`);
            break;
          }

          case 'start': {
            // Extract callId from CustomField if not already known
            const customField = event.start?.custom_parameters?.CustomField
              ?? event.start?.customParameters?.CustomField
              ?? event.start?.CustomField
              ?? event.customParameters?.CustomField;

            if (!callId && customField) {
              console.log(`[exotel] Resolved callId from start event: ${customField}`);
              initBridge(customField);
            }

            // Capture stream_sid — required when sending audio back
            const streamSid = event.start?.stream_sid ?? event.stream_sid;
            if (bridge && streamSid) {
              bridge.streamSid = streamSid;
              console.log(`[exotel] Captured streamSid: ${streamSid}`);
            }

            console.log(`[exotel] Stream start event for call ${callId ?? 'unknown'}:`, JSON.stringify(event.start));
            break;
          }

          case 'media': {
            if (!bridge) break; // Not yet initialized — drop audio

            // event.media.payload is base64-encoded PCM 16-bit, 8kHz, mono
            const base64Payload = event.media?.payload;
            if (!base64Payload) break;

            customerAudioChunkCount++;

            if (customerAudioChunkCount % 50 === 1) {
              console.log(
                `[exotel] Customer audio chunk #${customerAudioChunkCount} for call ${callId ?? 'unknown'}`,
              );
            }

            // Decode base64 -> raw PCM 16-bit 8kHz buffer
            const pcm8kBuffer = Buffer.from(base64Payload, 'base64');

            // Convert buffer to Int16Array for upsampling
            const pcm8k = new Int16Array(
              pcm8kBuffer.buffer,
              pcm8kBuffer.byteOffset,
              pcm8kBuffer.byteLength / 2,
            );

            // Upsample 8kHz -> 16kHz for Sarvam.ai STT
            const pcm16k = upsample8kTo16k(pcm8k);

            // Forward upsampled audio to Sarvam.ai STT (customer transcription)
            if (bridge.sarvamCustomerWs && bridge.sarvamCustomerWs.readyState === WebSocket.OPEN) {
              bridge.sarvamCustomerWs.send(pcm16k);
            }

            break;
          }

          case 'stop': {
            console.log(`[exotel] Stream stop event for call ${callId ?? 'unknown'} (${customerAudioChunkCount} customer audio chunks)`);

            if (bridge) {
              // Close Sarvam.ai connections on stream stop
              if (bridge.sarvamCustomerWs && bridge.sarvamCustomerWs.readyState === WebSocket.OPEN) {
                bridge.sarvamCustomerWs.close(1000, 'Exotel stream stopped');
              }
              bridge.sarvamCustomerWs = null;

              if (bridge.sarvamAgentWs && bridge.sarvamAgentWs.readyState === WebSocket.OPEN) {
                bridge.sarvamAgentWs.close(1000, 'Exotel stream stopped');
              }
              bridge.sarvamAgentWs = null;
            }

            break;
          }

          default: {
            console.log(`[exotel] Unknown event "${event.event}" for call ${callId ?? 'unknown'}:`, JSON.stringify(event));
          }
        }
      } catch {
        console.log(`[exotel] Non-JSON message for call ${callId ?? 'unknown'}:`, message.slice(0, 200));
      }
    });

    // --- Cleanup on Exotel disconnect ---
    ws.on('close', (code: number, reason: Buffer) => {
      console.log(
        `[exotel] WebSocket disconnected for call ${callId ?? 'unknown'} -- code=${code} reason=${reason.toString()} (${customerAudioChunkCount} customer chunks)`,
      );

      if (bridge) {
        bridge.exotelWs = null;

        if (bridge.sarvamCustomerWs && bridge.sarvamCustomerWs.readyState === WebSocket.OPEN) {
          bridge.sarvamCustomerWs.close(1000, 'Exotel disconnected');
        }
        bridge.sarvamCustomerWs = null;

        if (bridge.sarvamAgentWs && bridge.sarvamAgentWs.readyState === WebSocket.OPEN) {
          bridge.sarvamAgentWs.close(1000, 'Exotel disconnected');
        }
        bridge.sarvamAgentWs = null;
      }

      if (callId) cleanupBridge(callId);
    });

    ws.on('error', (err: Error) => {
      console.error(`[exotel] WebSocket error for call ${callId ?? 'unknown'}:`, err.message);
    });
  });

  // -------------------------------------------------------------------------
  // Agent browser WebSocket handler -- /ws/agent/:callId
  // Receives raw binary PCM 16-bit, 8kHz, mono from browser AudioWorklet
  // -------------------------------------------------------------------------
  agentWss.on('connection', (ws: WebSocket, _req: IncomingMessage, callId: string) => {
    console.log(`[agent] Browser WebSocket connected for call ${callId}`);

    const bridge = getOrCreateBridge(callId);
    bridge.agentWs = ws;

    let agentAudioChunkCount = 0;

    // Open Sarvam.ai STT connection for agent audio
    bridge.sarvamAgentWs = createSarvamSTTConnection(callId, (text, isFinal) => {
      writeTranscriptToFirestore(callId, text, isFinal, 'agent');
    });

    // --- Agent browser audio -> Server pipeline ---
    ws.on('message', (data: Buffer | string, isBinary: boolean) => {
      if (!isBinary && !Buffer.isBuffer(data)) {
        // Text frame -- log and ignore
        console.log(`[agent] Text message from browser for call ${callId}:`, data.toString().slice(0, 200));
        return;
      }

      const rawPcm8k = Buffer.isBuffer(data) ? data : Buffer.from(data);
      agentAudioChunkCount++;

      if (agentAudioChunkCount % 50 === 1) {
        console.log(
          `[agent] Audio chunk #${agentAudioChunkCount} for call ${callId} (${rawPcm8k.length} bytes)`,
        );
      }

      // --- Forward to Exotel (so customer hears the agent) ---
      // Encode raw PCM as base64 and wrap in Exotel's media event JSON
      // Must include streamSid in the response per Exotel AgentStream docs
      if (bridge.exotelWs && bridge.exotelWs.readyState === WebSocket.OPEN) {
        const base64Payload = rawPcm8k.toString('base64');
        const mediaEvent: Record<string, unknown> = {
          event: 'media',
          media: { payload: base64Payload },
        };
        if (bridge.streamSid) {
          mediaEvent.streamSid = bridge.streamSid;
        }
        bridge.exotelWs.send(JSON.stringify(mediaEvent));
      }

      // --- Forward to Sarvam.ai STT (for agent transcription) ---
      // Upsample 8kHz -> 16kHz for Sarvam
      const pcm8k = new Int16Array(
        rawPcm8k.buffer,
        rawPcm8k.byteOffset,
        rawPcm8k.byteLength / 2,
      );
      const pcm16k = upsample8kTo16k(pcm8k);

      if (bridge.sarvamAgentWs && bridge.sarvamAgentWs.readyState === WebSocket.OPEN) {
        bridge.sarvamAgentWs.send(pcm16k);
      }
    });

    // --- Cleanup on agent browser disconnect ---
    ws.on('close', (code: number, reason: Buffer) => {
      console.log(
        `[agent] Browser WebSocket disconnected for call ${callId} -- code=${code} reason=${reason.toString()} (${agentAudioChunkCount} agent chunks)`,
      );

      bridge.agentWs = null;

      // Close agent STT but leave the customer STT running (Exotel may still be connected)
      if (bridge.sarvamAgentWs && bridge.sarvamAgentWs.readyState === WebSocket.OPEN) {
        bridge.sarvamAgentWs.close(1000, 'Agent disconnected');
      }
      bridge.sarvamAgentWs = null;

      cleanupBridge(callId);
    });

    ws.on('error', (err: Error) => {
      console.error(`[agent] Browser WebSocket error for call ${callId}:`, err.message);
    });
  });

  // -------------------------------------------------------------------------
  // Start listening
  // -------------------------------------------------------------------------
  server.listen(port, () => {
    console.log(`> Server listening on http://${hostname}:${port}`);
    console.log(`> Exotel WebSocket endpoint: ws://${hostname}:${port}/ws/exotel/:callId`);
    console.log(`> Agent WebSocket endpoint:  ws://${hostname}:${port}/ws/agent/:callId`);
    console.log(`> Environment: ${dev ? 'development' : 'production'}`);
  });
});
