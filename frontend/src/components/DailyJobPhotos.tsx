import { useState } from "react";
import * as jobCardsApi from "../api/jobCards";
import type { JobCard, Photo, PhotoType } from "../api/types";
import { API_URL, apiErrorMessage } from "../api/client";
import { CameraCaptureModal } from "./CameraCaptureModal";

/**
 * Camera + file-picker pair used by Daily Jobs' photo steps. Camera opens a
 * live preview (works for phone cameras and laptop webcams); Files is the
 * normal picker / phone gallery.
 */
function PhotoButtons({ busy, onFile, label }: { busy: boolean; onFile: (f: File) => void; label: string }) {
  const [camera, setCamera] = useState(false);
  return (
    <div className="flex gap-2">
      <button type="button" disabled={busy} onClick={() => setCamera(true)} className={photoBtn}>
        📷 {label} (camera)
      </button>
      <label className={`${photoBtn} cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`}>
        🖼️ {label} (file)
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
      </label>
      {camera && (
        <CameraCaptureModal
          onClose={() => setCamera(false)}
          onCapture={(f) => {
            setCamera(false);
            onFile(f);
          }}
        />
      )}
    </div>
  );
}

function Thumb({ photo, children }: { photo: Photo; children?: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border border-neutral-800 bg-black">
      <a href={`${API_URL}${photo.url}`} target="_blank" rel="noreferrer">
        <img src={`${API_URL}${photo.url}`} alt="" className="h-28 w-full object-cover" />
      </a>
      <div className="flex items-center justify-between gap-1 px-2 py-1 text-[11px] text-neutral-400">
        <span>{new Date(photo.uploadedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        {children}
      </div>
    </div>
  );
}

/** Step 6 — while the work is going on: snap a photo and it goes straight
 *  to the customer on WhatsApp (stored as a PROGRESS photo). */
export function ProgressPhotos({ jobCard, canAct, onChanged }: { jobCard: JobCard; canAct: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const photos = jobCard.photos
    .filter((p) => p.type === "PROGRESS")
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

  async function upload(file: File) {
    setBusy(true);
    setMsg(null);
    try {
      const photo = await jobCardsApi.uploadPhoto(jobCard.id, file, "PROGRESS");
      await jobCardsApi.sendPhotoWhatsApp(jobCard.id, photo.id);
      setMsg({ ok: true, text: `Photo sent to ${jobCard.booking.customer?.name} on WhatsApp` });
      onChanged();
    } catch (err) {
      setMsg({ ok: false, text: apiErrorMessage(err) });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-neutral-800 bg-black p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium text-white">
          Progress photos for {jobCard.booking.vehicle?.plateNumber}
          <span className="ml-2 text-xs font-normal text-neutral-500">each photo is sent to the customer right away</span>
        </div>
        {canAct && <PhotoButtons busy={busy} onFile={upload} label={busy ? "Sending..." : "Send photo"} />}
      </div>
      {msg && <div className={`mb-2 text-xs ${msg.ok ? "text-green-400" : "text-red-500"}`}>{msg.text}</div>}
      {photos.length === 0 ? (
        <div className="text-xs text-neutral-500">No progress photos yet.</div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {photos.map((p) => (
            <Thumb key={p.id} photo={p}>
              <span className="text-green-500">sent</span>
            </Thumb>
          ))}
        </div>
      )}
    </div>
  );
}

/** Step 8 — before and after photos side by side; each can be sent on
 *  WhatsApp, or both latest ones together as a before/after pair. */
export function BeforeAfterPhotos({ jobCard, canAct, onChanged }: { jobCard: JobCard; canAct: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState<PhotoType | "SEND" | string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const byNewest = (t: PhotoType) =>
    jobCard.photos.filter((p) => p.type === t).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  const before = byNewest("BEFORE");
  const after = byNewest("AFTER");

  async function upload(file: File, type: PhotoType) {
    setBusy(type);
    setMsg(null);
    try {
      await jobCardsApi.uploadPhoto(jobCard.id, file, type);
      onChanged();
    } catch (err) {
      setMsg({ ok: false, text: apiErrorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  async function send(photos: Photo[]) {
    setBusy(photos.length === 1 ? photos[0].id : "SEND");
    setMsg(null);
    try {
      for (const p of photos) {
        await jobCardsApi.sendPhotoWhatsApp(jobCard.id, p.id);
        setSent((prev) => new Set(prev).add(p.id));
      }
      setMsg({
        ok: true,
        text: `${photos.length === 1 ? "Photo" : "Before & after photos"} sent to ${jobCard.booking.customer?.name} on WhatsApp`,
      });
    } catch (err) {
      setMsg({ ok: false, text: apiErrorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  const column = (type: PhotoType, title: string, hint: string, photos: Photo[]) => (
    <div className="rounded-md border border-neutral-800 bg-black p-3">
      <div className="mb-1 font-medium text-white">
        {title} <span className="text-xs font-normal text-neutral-500">({photos.length})</span>
      </div>
      <div className="mb-2 text-xs text-neutral-500">{hint}</div>
      {canAct && <PhotoButtons busy={busy !== null} onFile={(f) => upload(f, type)} label={busy === type ? "Uploading..." : "Add"} />}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {photos.map((p) => (
          <Thumb key={p.id} photo={p}>
            {sent.has(p.id) ? (
              <span className="text-green-500">sent ✓</span>
            ) : (
              canAct && (
                <button onClick={() => send([p])} disabled={busy !== null} className="text-red-400 hover:underline">
                  {busy === p.id ? "..." : "WhatsApp"}
                </button>
              )
            )}
          </Thumb>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {column("BEFORE", "Before", "Take these before the work starts.", before)}
        {column("AFTER", "After", "Same angles, once the work is finished.", after)}
      </div>
      {msg && <div className={`mt-2 text-xs ${msg.ok ? "text-green-400" : "text-red-500"}`}>{msg.text}</div>}
      {canAct && (
        <div className="mt-3 flex justify-end">
          <button
            onClick={() => send([before[0], after[0]])}
            disabled={busy !== null || before.length === 0 || after.length === 0}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-40"
          >
            {busy === "SEND" ? "Sending..." : "Send before & after on WhatsApp"}
          </button>
        </div>
      )}
    </div>
  );
}

const photoBtn =
  "rounded-md bg-red-950 px-2.5 py-1.5 text-xs font-medium text-red-300 hover:bg-red-900 disabled:opacity-50";
