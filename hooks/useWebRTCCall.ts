"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Peer, { MediaConnection } from "peerjs";

interface UseWebRTCCallReturn {
  /** PeerJS is initialized and ready */
  isReady: boolean;
  /** Audio call is active with the remote peer */
  isOnCall: boolean;
  /** The link the customer should open to join */
  callLink: string | null;
  /** Error message */
  callError: string | null;
  /** Remote audio stream (customer's voice) — attach to an <audio> element */
  remoteStream: MediaStream | null;
  /** Local audio stream (agent's mic) */
  localStream: MediaStream | null;
  /** Hang up the call */
  hangUp: () => void;
}

export function useWebRTCCall(callId: string, isActive: boolean): UseWebRTCCallReturn {
  const [isReady, setIsReady] = useState(false);
  const [isOnCall, setIsOnCall] = useState(false);
  const [callLink, setCallLink] = useState<string | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const peerRef = useRef<Peer | null>(null);
  const callRef = useRef<MediaConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!isActive) return;

    let destroyed = false;

    async function init() {
      // Get mic access
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch {
        setCallError("Microphone permission denied");
        return;
      }

      if (destroyed) { stream.getTracks().forEach(t => t.stop()); return; }

      localStreamRef.current = stream;
      setLocalStream(stream);

      // Create PeerJS peer with callId as the peer ID
      const peerId = `agent-${callId}`;
      const peer = new Peer(peerId);
      peerRef.current = peer;

      peer.on("open", (id) => {
        if (destroyed) return;
        console.log("[webrtc] Peer open:", id);
        setIsReady(true);

        // Generate the customer join link
        const baseUrl = window.location.origin;
        setCallLink(`${baseUrl}/call/${callId}`);
      });

      peer.on("error", (err) => {
        console.error("[webrtc] Peer error:", err.message);
        // If peer ID is taken (page refresh), use random suffix
        if (err.type === "unavailable-id") {
          setCallError("Call session already exists. Refresh and try again.");
        } else {
          setCallError(err.message);
        }
      });

      // When customer calls us (they initiate the call to our peer ID)
      peer.on("call", (incomingCall) => {
        console.log("[webrtc] Incoming call from customer");
        // Answer with our mic stream
        incomingCall.answer(stream);
        callRef.current = incomingCall;

        incomingCall.on("stream", (customerStream) => {
          console.log("[webrtc] Got customer audio stream");
          setRemoteStream(customerStream);
          setIsOnCall(true);
        });

        incomingCall.on("close", () => {
          console.log("[webrtc] Call closed");
          setIsOnCall(false);
          setRemoteStream(null);
        });

        incomingCall.on("error", (err) => {
          console.error("[webrtc] Call error:", err.message);
          setCallError(err.message);
        });
      });
    }

    init();

    return () => {
      destroyed = true;
      callRef.current?.close();
      peerRef.current?.destroy();
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      setIsReady(false);
      setIsOnCall(false);
      setRemoteStream(null);
      setLocalStream(null);
    };
  }, [callId, isActive]);

  const hangUp = useCallback(() => {
    callRef.current?.close();
    peerRef.current?.destroy();
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    setIsOnCall(false);
    setRemoteStream(null);
  }, []);

  return { isReady, isOnCall, callLink, callError, remoteStream, localStream, hangUp };
}
