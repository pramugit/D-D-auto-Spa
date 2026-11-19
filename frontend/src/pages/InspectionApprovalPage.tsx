import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import * as inspectionsApi from "../api/inspections";
import type { PublicInspection, PublicInspectionMarking } from "../api/inspections";
import { API_URL, apiErrorMessage } from "../api/client";
import type { DamageMarking } from "../api/types";
import { DamageInspectionDiagram } from "../components/DamageInspectionDiagram";

const money = (v: string | number | null | undefined) =>
  `Rs. ${Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SEVERITY: Record<string, { label: string; cls: string }> = {
  MINOR: { label: "Minor", cls: "bg-neutral-800 text-neutral-300" },
  MODERATE: { label: "Moderate", cls: "bg-yellow-950 text-yellow-300" },
  SEVERE: { label: "Severe", cls: "bg-red-950 text-red-300" },
};

/**
 * The customer's no-login damage report (step 3 of the inspection flow),
 * opened from the WhatsApp link or on the shop's device. Shows every
 * damage point with its close-up photo, lets them approve/decline optional
 * paid repairs, and confirm the report — which is what lets the job start.
 */
export function InspectionApprovalPage() {
  const { token = "" } = useParams();
  const [data, setData] = useState<PublicInspection | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, boolean>>({});
  const [comment, setComment] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justConfirmed, setJustConfirmed] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  useEffect(() => {
    inspectionsApi
      .getPublicInspection(token)
      .then(setData)
      .catch((err) => setLoadError(apiErrorMessage(err)));
  }, [token]);

  const pending = useMemo(
    () => data?.markings.filter((m) => m.isAdditionalRepairOffer && m.approvalStatus === "PENDING") ?? [],
    [data],
  );
  const needsAnswer = !!data && (!data.confirmed || pending.length > 0);

  // The 3D diagram expects saved-marking records; the public view carries the fields it draws.
  const diagramMarkings = useMemo(
    () =>
      (data?.markings ?? []).map(
        (m) =>
          ({
            ...m,
            damageInspectionId: "",
            damageTypeId: m.damageType?.id ?? null,
          }) as unknown as DamageMarking,
      ),
    [data],
  );

  if (loadError) {
    return (
      <Shell>
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-6 text-center">
          <div className="mb-2 text-3xl">🔗</div>
          <h1 className="text-lg font-semibold text-white">Link not valid</h1>
          <p className="mt-1 text-sm text-neutral-400">{loadError}. Please contact the service station for a new link.</p>
        </div>
      </Shell>
    );
  }
  if (!data) {
    return (
      <Shell>
        <p className="py-20 text-center text-sm text-neutral-400">Loading your inspection report…</p>
      </Shell>
    );
  }

  const isPre = data.stage === "PRE_SERVICE";
  const offers = data.markings.filter((m) => m.isAdditionalRepairOffer);
  const allDecided = pending.every((m) => decisions[m.id] !== undefined);
  const approvedTotal = offers.reduce((sum, m) => {
    const approved = m.approvalStatus === "APPROVED" || (m.approvalStatus === "PENDING" && decisions[m.id] === true);
    return approved ? sum + Number(m.suggestedPrice ?? 0) : sum;
  }, 0);

  async function submit() {
    setError(null);
    if (!allDecided) return setError("Please approve or decline each repair above.");
    if (!agreed) return setError("Please tick the box to confirm you've reviewed the report.");
    setSubmitting(true);
    try {
      const updated = await inspectionsApi.respondToInspection(
        token,
        pending.map((m) => ({ markingId: m.id, approved: decisions[m.id] })),
        comment || undefined,
      );
      setData(updated);
      setJustConfirmed(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Shell>
      <header className="mb-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-red-500">
          {isPre ? "Before-service inspection" : "After-service inspection"}
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-white">
          {data.vehicle.make} {data.vehicle.model}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-neutral-400">
          <span className="rounded bg-white px-2 py-0.5 font-mono text-xs font-bold text-black">{data.vehicle.plateNumber}</span>
          {data.vehicle.color && <span>{data.vehicle.color}</span>}
          <span>· Inspected {new Date(data.inspectedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
        </div>
      </header>

      {justConfirmed && (
        <div className="mb-5 rounded-xl bg-green-900/40 p-4 text-center ring-1 ring-green-800">
          <div className="text-3xl">✓</div>
          <div className="mt-1 font-semibold text-green-300">Thank you, {data.customerFirstName}!</div>
          <div className="text-sm text-green-200/80">
            {isPre ? "We'll start work on your vehicle now." : "Your confirmation has been saved."}
          </div>
        </div>
      )}

      {!justConfirmed && needsAnswer && (
        <p className="mb-5 text-sm text-neutral-300">
          Hi {data.customerFirstName}, {isPre ? "before we start work, " : ""}we checked your vehicle and recorded what we found
          {data.markings.length > 0 ? " — please look through the photos" : ""}
          {pending.length > 0 ? ", choose which optional repairs you'd like" : ""} and confirm at the bottom.
        </p>
      )}

      {data.markings.length === 0 ? (
        <div className="mb-5 rounded-xl bg-green-950/50 p-5 text-center ring-1 ring-green-900">
          <div className="text-3xl">✓</div>
          <div className="mt-1 font-semibold text-green-300">No damage found</div>
          <div className="text-sm text-neutral-400">Your vehicle was checked all around.</div>
        </div>
      ) : (
        <>
          <section className="mb-5 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950">
            <div className="px-4 pt-3 text-xs text-neutral-500">Drag to rotate — numbered markers show where each damage is.</div>
            <DamageInspectionDiagram markings={diagramMarkings} vehicleType={data.vehicle.vehicleType} />
          </section>

          <section className="mb-5 space-y-3">
            <h2 className="text-sm font-semibold uppercase text-neutral-400">
              {data.markings.length} damage point{data.markings.length === 1 ? "" : "s"}
            </h2>
            {data.markings.map((m, i) => (
              <DamageCard
                key={m.id}
                n={i + 1}
                m={m}
                decision={decisions[m.id]}
                onDecide={(ok) => setDecisions((d) => ({ ...d, [m.id]: ok }))}
                onZoom={setZoom}
              />
            ))}
          </section>

          {offers.length > 0 && (
            <div className="mb-5 flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3">
              <span className="text-sm text-neutral-300">Approved repairs total</span>
              <span className="text-lg font-semibold text-white">{money(approvedTotal)}</span>
            </div>
          )}
        </>
      )}

      {needsAnswer ? (
        <section className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Anything you'd like to tell us? (optional)"
            className="w-full rounded-lg border border-neutral-700 bg-black px-3 py-2 text-sm text-white"
          />
          <label className="flex items-start gap-3 text-sm text-neutral-200">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-red-600" />
            <span>
              {isPre
                ? data.markings.length > 0
                  ? "I've reviewed this report and agree the damage shown was already on my vehicle before service."
                  : "I've reviewed this report."
                : "I've reviewed the condition of my vehicle after the service."}
            </span>
          </label>
          {error && <div className="rounded-lg bg-red-950 px-3 py-2 text-sm text-red-400">{error}</div>}
          <button
            onClick={submit}
            disabled={submitting}
            className="w-full rounded-xl bg-red-600 py-3.5 text-base font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Confirm"}
          </button>
        </section>
      ) : (
        !justConfirmed && (
          <div className="rounded-xl bg-green-950/50 p-4 text-center text-sm text-green-300 ring-1 ring-green-900">
            ✓ You confirmed this report
            {data.confirmedAt && ` on ${new Date(data.confirmedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`}.
            {data.customerComment && <div className="mt-2 text-neutral-300">Your comment: “{data.customerComment}”</div>}
          </div>
        )
      )}

      {zoom && (
        <button onClick={() => setZoom(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" aria-label="Close photo">
          <img src={zoom} alt="Damage close-up" className="max-h-full max-w-full rounded-lg" />
        </button>
      )}
    </Shell>
  );
}

function DamageCard({
  n,
  m,
  decision,
  onDecide,
  onZoom,
}: {
  n: number;
  m: PublicInspectionMarking;
  decision: boolean | undefined;
  onDecide: (approved: boolean) => void;
  onZoom: (url: string) => void;
}) {
  const sev = SEVERITY[m.severity] ?? SEVERITY.MINOR;
  const photo = m.photoUrl ? `${API_URL}${m.photoUrl}` : null;
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950">
      {photo && (
        <button onClick={() => onZoom(photo)} className="block w-full">
          <img src={photo} alt={`Damage ${n}`} className="max-h-72 w-full object-cover" loading="lazy" />
        </button>
      )}
      <div className="p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">{n}</span>
          <span className="font-medium text-white">{m.damageType?.name ?? "Damage"}</span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${sev.cls}`}>{sev.label}</span>
        </div>
        {m.note && <p className="mt-2 text-sm text-neutral-300">{m.note}</p>}
        {!photo && <p className="mt-2 text-xs text-neutral-500">No photo for this point.</p>}

        {m.isAdditionalRepairOffer && (
          <div className="mt-3 rounded-lg border border-neutral-800 bg-black p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-300">Optional repair</span>
              <span className="font-semibold text-white">{money(m.suggestedPrice)}</span>
            </div>
            {m.approvalStatus === "PENDING" ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => onDecide(true)}
                  className={`rounded-lg py-2.5 text-sm font-semibold ${
                    decision === true ? "bg-green-600 text-white" : "text-green-400 ring-1 ring-green-800"
                  }`}
                >
                  {decision === true ? "✓ " : ""}Yes, repair it
                </button>
                <button
                  onClick={() => onDecide(false)}
                  className={`rounded-lg py-2.5 text-sm font-semibold ${
                    decision === false ? "bg-neutral-600 text-white" : "text-neutral-300 ring-1 ring-neutral-700"
                  }`}
                >
                  {decision === false ? "✓ " : ""}No, thanks
                </button>
              </div>
            ) : (
              <div className={`mt-2 text-sm font-medium ${m.approvalStatus === "APPROVED" ? "text-green-400" : "text-neutral-500"}`}>
                {m.approvalStatus === "APPROVED" ? "✓ You approved this repair" : "You declined this repair"}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="border-b border-neutral-900 px-4 py-3">
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <img src="/brand/favicon-192.png" alt="" className="h-7 w-7 rounded" />
          <span className="font-semibold">D &amp; D Auto Spa</span>
        </div>
      </div>
      <main className="mx-auto max-w-xl px-4 py-6">{children}</main>
    </div>
  );
}
