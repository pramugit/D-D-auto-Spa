import { useEffect, useRef, useState } from "react";
import { Modal } from "./Modal";

interface CameraDevice {
  deviceId: string;
  label: string;
}

/**
 * Live in-browser camera capture — works the same way for a phone's front/
 * back camera and a laptop's built-in/USB webcam, since it talks to
 * getUserMedia directly instead of leaving the choice to the OS's file
 * picker (which desktop browsers mostly ignore for <input capture>).
 *
 * Needs a secure context (HTTPS, or http://localhost) — browsers refuse
 * getUserMedia on a plain http://<lan-ip> origin, which is how this dev
 * server is usually reached from a phone. See README for enabling HTTPS
 * in dev (a tunnel, or Vite's --https) if that's how this is being tested.
 */
export function CameraCaptureModal({
  onCapture,
  onClose,
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // De-dupes the mount-time getUserMedia call. React 18 StrictMode
  // double-invokes effects in dev (mount -> cleanup -> mount again) before
  // the first async call even resolves, so without this a SECOND real
  // getUserMedia() request goes out while the first is still opening the
  // device. Most Windows webcam drivers can't service two concurrent opens
  // of the same camera, and whichever request loses that race fails with
  // "Failed to allocate videosource" — reproducing on every click, since
  // the stray stream from the "losing" mount can also end up orphaned
  // (never stopped) and keep the camera locked for later attempts too.
  const initialRequestRef = useRef<Promise<MediaStream> | null>(null);
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function populateDevices(stream: MediaStream, preferredDeviceId: string | null) {
    // Device labels are only available after permission is granted, so
    // this runs after the first successful getUserMedia call.
    const all = await navigator.mediaDevices.enumerateDevices();
    const cams = all
      .filter((d) => d.kind === "videoinput")
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }));
    setDevices(cams);
    const activeTrackSettings = stream.getVideoTracks()[0]?.getSettings();
    setDeviceId(preferredDeviceId ?? activeTrackSettings?.deviceId ?? null);
  }

  function describeError(err: unknown): string {
    if (err instanceof Error && err.name === "NotReadableError") {
      return "The camera is already in use by another app or browser tab (Zoom, Teams, Windows Camera, another tab, etc). Close it and try again.";
    }
    if (err instanceof Error && err.name === "NotAllowedError") {
      return "Camera permission was denied. Allow camera access for this site and try again.";
    }
    return err instanceof Error ? err.message : "Could not access the camera";
  }

  // User-driven calls (switching camera from the dropdown) — StrictMode
  // doesn't double-invoke event handlers, only effects, so no dedup needed
  // here.
  async function switchCamera(newDeviceId: string) {
    setError(null);
    setReady(false);
    stopStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: newDeviceId } } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setReady(true);
      await populateDevices(stream, newDeviceId);
    } catch (err) {
      setError(describeError(err));
    }
  }

  useEffect(() => {
    let cancelled = false;
    let acquiredStream: MediaStream | null = null;

    async function init() {
      setError(null);
      setReady(false);
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera access isn't supported in this browser");
        }
        if (!initialRequestRef.current) {
          initialRequestRef.current = navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
          });
        }
        const stream = await initialRequestRef.current;
        if (cancelled) {
          // This mount was already cleaned up (StrictMode's synthetic
          // double-invoke) — release immediately instead of leaking it.
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        acquiredStream = stream;
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);
        await populateDevices(stream, null);
      } catch (err) {
        if (!cancelled) setError(describeError(err));
      } finally {
        initialRequestRef.current = null;
      }
    }

    init();

    return () => {
      cancelled = true;
      if (acquiredStream) {
        acquiredStream.getTracks().forEach((t) => t.stop());
        if (streamRef.current === acquiredStream) streamRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryToken]);

  function handleCapture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        stopStream();
        onCapture(new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.9
    );
  }

  function handleClose() {
    stopStream();
    onClose();
  }

  function handleRetry() {
    stopStream();
    setRetryToken((t) => t + 1);
  }

  return (
    <Modal title="Take Photo" onClose={handleClose}>
      <div className="space-y-3">
        {error ? (
          <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-600">
            {error} You can still use "Files" to upload a photo instead.
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-md bg-black">
              <video ref={videoRef} className="aspect-video w-full" playsInline muted />
            </div>
            {devices.length > 1 && (
              <select
                value={deviceId ?? ""}
                onChange={(e) => switchCamera(e.target.value)}
                className="w-full rounded-md border border-neutral-700 px-2 py-1.5 text-sm"
              >
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))}
              </select>
            )}
          </>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleClose}
            className="flex-1 rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-black"
          >
            Cancel
          </button>
          {error ? (
            <button
              onClick={handleRetry}
              className="flex-1 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Retry
            </button>
          ) : (
            <button
              onClick={handleCapture}
              disabled={!ready}
              className="flex-1 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              Capture
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
