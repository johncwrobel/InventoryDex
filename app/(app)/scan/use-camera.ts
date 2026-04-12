"use client";

import { useRef, useState, useCallback, useEffect } from "react";

export type CameraError =
  | "not-supported"
  | "permission-denied"
  | "not-found"
  | "interrupted"
  | "unknown";

interface UseCameraReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  error: CameraError | null;
  ready: boolean;
  start: () => Promise<void>;
  stop: () => void;
  capture: () => Promise<Blob | null>;
}

export function useCamera(): UseCameraReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<CameraError | null>(null);
  const [ready, setReady] = useState(false);

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStream(null);
    setReady(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setReady(false);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("not-supported");
      return;
    }

    // Stop any existing stream before starting a new one.
    stop();

    let mediaStream: MediaStream;
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
    } catch (err) {
      if (err instanceof DOMException) {
        if (
          err.name === "NotAllowedError" ||
          err.name === "PermissionDeniedError"
        ) {
          setError("permission-denied");
        } else if (
          err.name === "NotFoundError" ||
          err.name === "DevicesNotFoundError"
        ) {
          setError("not-found");
        } else {
          setError("unknown");
        }
      } else {
        setError("unknown");
      }
      return;
    }

    streamRef.current = mediaStream;
    setStream(mediaStream);

    // Listen for the camera track ending unexpectedly (e.g., phone call,
    // tab switch on some browsers).
    const track = mediaStream.getVideoTracks()[0];
    if (track) {
      track.addEventListener("ended", () => {
        stop();
        setError("interrupted");
      });
    }

    if (videoRef.current) {
      videoRef.current.srcObject = mediaStream;
      videoRef.current.setAttribute("playsinline", "true"); // required on iOS
      videoRef.current.setAttribute("muted", "true");
      try {
        await videoRef.current.play();
      } catch {
        // Autoplay blocked in some contexts — not fatal.
      }
      setReady(true);
    }
  }, [stop]);

  // Capture the current video frame and return it as a Blob.
  const capture = useCallback(async (): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || !streamRef.current) return null;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);

    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.9);
    });
  }, []);

  // Clean up the stream when the component using this hook unmounts.
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return { videoRef, stream, error, ready, start, stop, capture };
}
