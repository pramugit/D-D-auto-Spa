import type { ReactNode } from "react";
import { createPortal } from "react-dom";

export function Modal({
  title,
  onClose,
  children,
  wide,
  accent,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  /** Red header over a black body, with a pop-in — the Customers page look. */
  accent?: boolean;
}) {
  // Rendered into a portal on <body> rather than in place: AppLayout wraps
  // every routed page in a div animated with a transform (animate-fade-in-up,
  // fill-mode "both" keeps `transform: translateY(0)` applied even after it
  // finishes). Per the CSS spec, any ancestor with a non-none transform
  // becomes the containing block for `position: fixed` descendants — so
  // without the portal, this modal's "fixed inset-0" centers within that
  // animated wrapper's box instead of the actual viewport, and visibly
  // drifts off-center depending on how tall the page content is.
  return createPortal(
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${accent ? "bg-black/60 backdrop-blur-sm" : "bg-black/40"}`}>
      <div
        className={`w-full ${wide ? "max-w-3xl" : "max-w-md"} rounded-lg shadow-xl ${
          accent ? "animate-pop-in overflow-hidden bg-neutral-950 ring-1 ring-red-900/50" : "bg-neutral-900"
        }`}
      >
        <div
          className={`flex items-center justify-between px-5 py-3 ${
            accent ? "bg-gradient-to-r from-red-600 to-red-700" : "border-b border-neutral-800"
          }`}
        >
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button
            onClick={onClose}
            className={`rounded-md px-2 py-1 ${
              accent ? "text-white/80 hover:bg-white/15 hover:text-white" : "text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
            }`}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}
