"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Device, Call } from "@twilio/voice-sdk";

interface UseTwilioCallReturn {
  isReady: boolean;
  isOnCall: boolean;
  callError: string | null;
  makeCall: (to: string, callId: string) => Promise<void>;
  hangUp: () => void;
}

export function useTwilioCall(): UseTwilioCallReturn {
  const [isReady, setIsReady] = useState(false);
  const [isOnCall, setIsOnCall] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);

  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);

  // Initialize Twilio Device on mount
  useEffect(() => {
    async function init() {
      try {
        // Get access token from our server
        const res = await fetch("/api/twilio/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identity: "demo-agent" }),
        });
        const { token } = await res.json();

        // Create and register the device
        const device = new Device(token, {
          codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
        });

        device.on("registered", () => {
          console.log("[twilio] Device registered");
          setIsReady(true);
        });

        device.on("error", (err) => {
          console.error("[twilio] Device error:", err.message);
          setCallError(err.message);
        });

        device.on("tokenWillExpire", async () => {
          const res = await fetch("/api/twilio/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ identity: "demo-agent" }),
          });
          const { token } = await res.json();
          device.updateToken(token);
        });

        await device.register();
        deviceRef.current = device;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to initialize Twilio";
        console.error("[twilio] Init error:", msg);
        setCallError(msg);
      }
    }

    init();

    return () => {
      deviceRef.current?.destroy();
    };
  }, []);

  const makeCall = useCallback(async (to: string, callId: string) => {
    if (!deviceRef.current) {
      setCallError("Twilio device not ready");
      return;
    }

    setCallError(null);

    try {
      const call = await deviceRef.current.connect({
        params: { To: to, callId },
      });

      callRef.current = call;
      setIsOnCall(true);

      call.on("accept", () => {
        console.log("[twilio] Call accepted");
      });

      call.on("disconnect", () => {
        console.log("[twilio] Call disconnected");
        setIsOnCall(false);
        callRef.current = null;
      });

      call.on("error", (err) => {
        console.error("[twilio] Call error:", err.message);
        setCallError(err.message);
        setIsOnCall(false);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to connect call";
      setCallError(msg);
    }
  }, []);

  const hangUp = useCallback(() => {
    callRef.current?.disconnect();
    setIsOnCall(false);
    callRef.current = null;
  }, []);

  return { isReady, isOnCall, callError, makeCall, hangUp };
}
