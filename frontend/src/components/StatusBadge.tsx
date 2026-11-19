const COLORS: Record<string, string> = {
  PENDING: "bg-neutral-800 text-neutral-200",
  CONFIRMED: "bg-red-950 text-red-400",
  IN_PROGRESS: "bg-red-950 text-red-300",
  QUALITY_CHECK: "bg-red-950 text-red-300",
  READY: "bg-red-950 text-red-300",
  COMPLETED: "bg-red-950 text-red-400",
  CANCELLED: "bg-red-950 text-red-400",
  AVAILABLE: "bg-red-950 text-red-400",
  OCCUPIED: "bg-red-950 text-red-300",
  MAINTENANCE: "bg-red-950 text-red-400",
  UNPAID: "bg-red-950 text-red-400",
  PARTIALLY_PAID: "bg-red-950 text-red-300",
  PAID: "bg-red-950 text-red-400",
  PENDING_VERIFICATION: "bg-red-950 text-red-300",
  VERIFIED: "bg-red-950 text-red-400",
  REJECTED: "bg-red-950 text-red-400",
};

export function StatusBadge({ status }: { status: string }) {
  const cls = COLORS[status] ?? "bg-neutral-800 text-neutral-200";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
