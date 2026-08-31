import type { BookingStatus } from "../api/types";

const STEPS: { status: BookingStatus; label: string }[] = [
  { status: "PENDING", label: "Requested" },
  { status: "CONFIRMED", label: "Confirmed" },
  { status: "IN_PROGRESS", label: "In Progress" },
  { status: "QUALITY_CHECK", label: "Quality Check" },
  { status: "READY", label: "Ready" },
  { status: "COMPLETED", label: "Completed" },
];

export function StatusStepper({ status }: { status: BookingStatus }) {
  if (status === "CANCELLED") {
    return (
      <div className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
        This booking was cancelled.
      </div>
    );
  }

  const currentIndex = STEPS.findIndex((s) => s.status === status);

  return (
    <div className="flex items-center">
      {STEPS.map((step, idx) => {
        const done = idx < currentIndex;
        const active = idx === currentIndex;
        return (
          <div key={step.status} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  done
                    ? "bg-green-600 text-white"
                    : active
                      ? "bg-slate-800 text-white"
                      : "bg-slate-200 text-slate-500"
                }`}
              >
                {done ? "✓" : idx + 1}
              </div>
              <div className={`mt-1 whitespace-nowrap text-[11px] ${active ? "font-semibold text-slate-800" : "text-slate-400"}`}>
                {step.label}
              </div>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`mx-1 h-0.5 flex-1 ${idx < currentIndex ? "bg-green-600" : "bg-slate-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
