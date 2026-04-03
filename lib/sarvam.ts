import WebSocket from 'ws';

const SARVAM_STT_URL = 'wss://api.sarvam.ai/speech-to-text-translate/streaming';

export interface SarvamTranscriptResponse {
  transcript: string;
  is_final: boolean;
}

/**
 * Creates a WebSocket connection to Sarvam.ai Streaming STT API.
 *
 * Sends an initial config message, then accepts PCM 16-bit 16kHz audio
 * chunks as binary data. Returns transcript chunks via the onTranscript
 * callback.
 *
 * If SARVAM_API_KEY is not set, logs a warning and returns a dummy
 * WebSocket that will close immediately -- the server does not crash.
 */
export function createSarvamSTTConnection(
  callId: string,
  onTranscript: (text: string, isFinal: boolean) => void,
): WebSocket | null {
  const apiKey = process.env.SARVAM_API_KEY;

  if (!apiKey) {
    console.warn(
      `[sarvam] SARVAM_API_KEY is not set -- STT will not work for call ${callId}`,
    );
    return null;
  }

  console.log(`[sarvam] Opening STT connection for call ${callId}`);

  const ws = new WebSocket(SARVAM_STT_URL, {
    headers: {
      'api-subscription-key': apiKey,
    },
  });

  ws.on('open', () => {
    console.log(`[sarvam] STT WebSocket connected for call ${callId}`);

    // Send initial config message
    const config = {
      config: {
        language_code: 'unknown',
        sample_rate: 16000,
        encoding: 'pcm16',
        model: 'saarika:v2',
      },
    };

    ws.send(JSON.stringify(config));
    console.log(`[sarvam] Sent config for call ${callId}:`, JSON.stringify(config));
  });

  ws.on('message', (data: WebSocket.Data) => {
    try {
      const message = JSON.parse(data.toString()) as SarvamTranscriptResponse;

      if (message.transcript) {
        console.log(
          `[sarvam] Transcript for call ${callId} (final=${message.is_final}): "${message.transcript}"`,
        );
        onTranscript(message.transcript, message.is_final);
      }
    } catch (err) {
      console.error(`[sarvam] Failed to parse STT response for call ${callId}:`, err);
    }
  });

  ws.on('error', (err: Error) => {
    console.error(`[sarvam] STT WebSocket error for call ${callId}:`, err.message);
  });

  ws.on('close', (code: number, reason: Buffer) => {
    console.log(
      `[sarvam] STT WebSocket closed for call ${callId} -- code=${code} reason=${reason.toString()}`,
    );
  });

  return ws;
}
