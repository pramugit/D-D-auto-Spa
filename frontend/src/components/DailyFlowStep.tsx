import { forwardRef, type ReactNode } from "react";

export type FlowStepState = "done" | "active" | "locked";

/**
 * One numbered step in Daily Jobs' top-to-bottom flow: a number bubble with
 * a connector line running down to the next step, and the step's content
 * beside it. "done" steps collapse to a short summary, "active" is the one
 * to work on now, "locked" ones explain what has to happen first.
 */
export const DailyFlowStep = forwardRef<
  HTMLElement,
  {
    n: number;
    title: string;
    state: FlowStepState;
    summary?: ReactNode;
    action?: ReactNode;
    last?: boolean;
    children?: ReactNode;
  }
>(function DailyFlowStep({ n, title, state, summary, action, last, children }, ref) {
  return (
    <section ref={ref} className={`no-print relative flex gap-4 ${last ? "" : "pb-6"} scroll-mt-6`}>
      {!last && (
        <div
          className={`absolute left-[17px] top-10 bottom-0 w-0.5 ${state === "done" ? "bg-red-600" : "bg-neutral-800"}`}
        />
      )}
      <div
        className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
          state === "done"
            ? "bg-red-600 text-white"
            : state === "active"
              ? "bg-white text-black ring-4 ring-red-600/40"
              : "bg-neutral-800 text-neutral-500"
        }`}
      >
        {state === "done" ? "✓" : n}
      </div>
      <div
        className={`min-w-0 flex-1 rounded-lg border p-4 ${
          state === "active" ? "border-red-700 bg-neutral-900" : "border-neutral-800 bg-neutral-900/60"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={`text-base font-semibold ${state === "locked" ? "text-neutral-500" : "text-white"}`}>
            <span className="mr-2 text-xs font-medium uppercase tracking-wide text-red-500">Step {n}</span>
            {title}
          </h2>
          {action}
        </div>
        {summary && <div className="mt-2 text-sm text-neutral-300">{summary}</div>}
        {children && <div className="mt-4">{children}</div>}
      </div>
    </section>
  );
});
