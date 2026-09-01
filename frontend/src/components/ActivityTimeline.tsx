import type { BookingActivityLogEntry } from "../api/types";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Requested",
  CONFIRMED: "Confirmed",
  IN_PROGRESS: "In Progress",
  QUALITY_CHECK: "Quality Check",
  READY: "Ready",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/** A numbered vertical "who did what, when" trail from BookingActivityLog. */
export function ActivityTimeline({ entries }: { entries: BookingActivityLogEntry[] }) {
  if (entries.length === 0) {
    return <div className="text-sm text-slate-400">No status changes recorded yet.</div>;
  }

  return (
    <ol className="space-y-0">
      {entries.map((entry, idx) => (
        <li key={entry.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white">
              {idx + 1}
            </div>
            {idx < entries.length - 1 && <div className="w-px flex-1 bg-slate-200" />}
          </div>
          <div className="pb-5">
            <div className="text-sm font-medium text-slate-800">
              {STATUS_LABELS[entry.fromStatus] ?? entry.fromStatus} → {STATUS_LABELS[entry.toStatus] ?? entry.toStatus}
            </div>
            <div className="text-xs text-slate-500">
              {new Date(entry.createdAt).toLocaleString()} — by{" "}
              {entry.changedByUser ? `${entry.changedByUser.name} (${entry.changedByUser.role})` : "customer"}
            </div>
            {entry.notes && <div className="mt-1 text-xs text-slate-500 italic">"{entry.notes}"</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
