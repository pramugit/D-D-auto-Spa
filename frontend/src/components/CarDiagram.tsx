import { useState } from "react";
import type { DamageMarking } from "../api/types";

interface CarDiagramProps {
  markings: DamageMarking[];
  editable?: boolean;
  onAddMarking?: (marking: DamageMarking) => void;
  height?: number;
}

/**
 * A simple top-down car silhouette (rounded rectangle body + a narrower
 * "cabin" band) used as a click target for marking damage locations.
 * Coordinates are stored as 0-100 percentages of the SVG viewBox so they
 * remain meaningful regardless of render size.
 */
export function CarDiagram({ markings, editable, onAddMarking, height = 380 }: CarDiagramProps) {
  const [pendingPoint, setPendingPoint] = useState<{ x: number; y: number } | null>(null);
  const [note, setNote] = useState("");

  function handleSvgClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!editable) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPendingPoint({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
    setNote("");
  }

  function confirmMarking() {
    if (!pendingPoint || !note.trim() || !onAddMarking) return;
    onAddMarking({ x: pendingPoint.x, y: pendingPoint.y, note: note.trim() });
    setPendingPoint(null);
    setNote("");
  }

  return (
    <div>
      <svg
        viewBox="0 0 100 200"
        width="100%"
        height={height}
        onClick={handleSvgClick}
        className={`rounded-lg border border-slate-200 bg-slate-50 ${editable ? "cursor-crosshair" : ""}`}
      >
        {/* Car body silhouette, top-down */}
        <rect x="15" y="10" width="70" height="180" rx="28" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5" />
        {/* Cabin/windshield band */}
        <rect x="24" y="55" width="52" height="70" rx="14" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="1" />
        {/* Front/rear bumper hints */}
        <rect x="20" y="10" width="60" height="10" rx="4" fill="#94a3b8" opacity="0.5" />
        <rect x="20" y="180" width="60" height="10" rx="4" fill="#94a3b8" opacity="0.5" />
        <text x="50" y="24" textAnchor="middle" fontSize="6" fill="#64748b">
          FRONT
        </text>
        <text x="50" y="192" textAnchor="middle" fontSize="6" fill="#64748b">
          REAR
        </text>

        {markings.map((m, idx) => (
          <g key={idx}>
            <circle cx={m.x} cy={(m.y / 100) * 200} r="3.2" fill="#dc2626" stroke="white" strokeWidth="0.8" />
            <text x={m.x} y={(m.y / 100) * 200 - 5} textAnchor="middle" fontSize="5" fill="#dc2626" fontWeight="600">
              {idx + 1}
            </text>
          </g>
        ))}

        {pendingPoint && (
          <circle
            cx={pendingPoint.x}
            cy={(pendingPoint.y / 100) * 200}
            r="3.2"
            fill="#f59e0b"
            stroke="white"
            strokeWidth="0.8"
          />
        )}
      </svg>

      {editable && pendingPoint && (
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                confirmMarking();
              }
            }}
            placeholder="e.g. scratch, dent, chip..."
            className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={confirmMarking}
            className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            Add Marker
          </button>
          <button
            type="button"
            onClick={() => setPendingPoint(null)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      )}

      {markings.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {markings.map((m, idx) => (
            <li key={idx} className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-xs font-semibold text-red-600">
                {idx + 1}
              </span>
              <span className="text-slate-600">{m.note}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
