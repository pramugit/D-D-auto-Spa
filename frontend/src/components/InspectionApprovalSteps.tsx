import { useEffect, useState } from "react";
import * as inspectionsApi from "../api/inspections";
import * as jobCardsApi from "../api/jobCards";
import { apiErrorMessage } from "../api/client";
import type { DamageInspection } from "../api/types";

const POLL_MS = 10_000;

const money = (v: string | number | null | undefined) =>
  `Rs. ${Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const VIA_LABEL: Record<string, string> = {
  CUSTOMER_LINK: "by the customer on the approval link",
  CUSTOMER_PORTAL: "by the customer in the portal",
  STAFF_IN_PERSON: "in person at the counter",
};

function Step({ n, done, active, label, sub }: { n: number; done: boolean; active: boolean; label: string; sub?: string }) {
  return (
    <div className="flex min-w-0 flex-1 items-start gap-2">
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          done ? "bg-green-600 text-white" : active ? "bg-red-600 text-white" : "bg-neutral-800 text-neutral-500"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <div className="min-w-0">
        <div className={`text-xs font-semibold ${done ? "text-green-400" : active ? "text-white" : "text-neutral-500"}`}>{label}</div>
        {sub && <div className="truncate text-[11px] text-neutral-500">{sub}</div>}
      </div>
    </div>
  );
}

/**
 * Steps 2 & 3 under a saved damage inspection on the job card:
 *   ① Inspected (markers + photos) → ② Sent to customer → ③ Customer confirmed.
 * Sending WhatsApps a no-login approval link; "Open on this device" lets a
 * customer at the counter use the same page on the shop tablet; "Record in
 * person" is the front-desk fallback. While waiting, it polls so the card
 * flips to "confirmed" on its own when the customer answers.
 */
export function InspectionApprovalSteps({
  inspection,
  jobCardId,
  customerPhone,
  canEdit,
  onChanged,
}: {
  inspection: DamageInspection;
  jobCardId: string;
  customerPhone?: string | null;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<null | "send" | "copy" | "open" | "confirm">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inPerson, setInPerson] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, boolean>>({});
  const [comment, setComment] = useState("");

  const markings = inspection.markings;
  const pending = markings.filter((m) => m.isAdditionalRepairOffer && m.approvalStatus === "PENDING");
  const offers = markings.filter((m) => m.isAdditionalRepairOffer);
  const missingPhotos = markings.filter((m) => !m.photoUrl).length;
  const noDamage = markings.length === 0;
  const confirmed = inspection.customerAcknowledged && pending.length === 0;
  const sent = !!inspection.sentToCustomerAt;
  const isPre = inspection.stage === "PRE_SERVICE";

  // Poll while the customer has the link and hasn't answered yet.
  useEffect(() => {
    if (confirmed || (!sent && !inspection.approvalToken)) return;
    const t = window.setInterval(async () => {
      try {
        const jc = await jobCardsApi.getJobCard(jobCardId);
        const fresh = jc.damageInspections.find((d) => d.id === inspection.id);
        const freshPending = fresh?.markings.filter((m) => m.isAdditionalRepairOffer && m.approvalStatus === "PENDING").length ?? 0;
        if (fresh && fresh.customerAcknowledged && freshPending === 0) onChanged();
      } catch {
        /* keep waiting quietly */
      }
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [confirmed, sent, inspection.approvalToken, inspection.id, jobCardId, onChanged]);

  async function run(kind: NonNullable<typeof busy>, fn: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const send = () =>
    run("send", async () => {
      await inspectionsApi.sendToCustomer(inspection.id);
      setNotice("Sent on WhatsApp — waiting for the customer to confirm.");
      onChanged();
    });

  const copy = () =>
    run("copy", async () => {
      const { url } = await inspectionsApi.getApprovalLink(inspection.id);
      try {
        await navigator.clipboard.writeText(url);
        setNotice("Link copied — paste it into SMS, Viber, email…");
      } catch {
        window.prompt("Copy this link:", url);
      }
      if (!inspection.approvalToken) onChanged();
    });

  const openHere = () =>
    run("open", async () => {
      const { url } = await inspectionsApi.getApprovalLink(inspection.id);
      window.open(url, "_blank", "noopener");
      if (!inspection.approvalToken) onChanged();
    });

  const recordInPerson = () =>
    run("confirm", async () => {
      if (pending.some((m) => decisions[m.id] === undefined)) throw new Error("Pick approve or decline for every repair first");
      await inspectionsApi.confirmInPerson(
        inspection.id,
        pending.map((m) => ({ markingId: m.id, approved: decisions[m.id] })),
        comment || undefined,
      );
      setInPerson(false);
      onChanged();
    });

  const approvedTotal = offers
    .filter((m) => m.approvalStatus === "APPROVED")
    .reduce((s, m) => s + Number(m.suggestedPrice ?? 0), 0);
  const btn = "rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50";

  return (
    <div className="mt-3 rounded-lg border border-neutral-800 bg-black p-3">
      <div className="mb-3 flex gap-2">
        <Step
          n={1}
          done
          active={false}
          label="Inspected"
          sub={noDamage ? "No damage" : `${markings.length} damage · ${markings.length - missingPhotos} photo${markings.length - missingPhotos === 1 ? "" : "s"}`}
        />
        <Step
          n={2}
          done={sent || confirmed}
          active={!sent && !confirmed}
          label="Sent to customer"
          sub={inspection.sentToCustomerAt ? new Date(inspection.sentToCustomerAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : undefined}
        />
        <Step
          n={3}
          done={confirmed}
          active={sent && !confirmed}
          label="Customer confirmed"
          sub={inspection.acknowledgedAt && confirmed ? new Date(inspection.acknowledgedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : undefined}
        />
      </div>

      {missingPhotos > 0 && !confirmed && (
        <div className="mb-2 rounded-md bg-yellow-950/40 px-3 py-1.5 text-xs text-yellow-300">
          {missingPhotos} damage point{missingPhotos === 1 ? " has" : "s have"} no photo — photos protect you if the customer disputes it later.
        </div>
      )}

      {confirmed ? (
        <div className="space-y-2 text-xs">
          <div className="rounded-md bg-green-950/50 px-3 py-2 text-green-300">
            ✓ Confirmed {VIA_LABEL[inspection.acknowledgedVia ?? ""] ?? ""}
            {isPre && " — work can start."}
          </div>
          {offers.length > 0 && (
            <ul className="divide-y divide-neutral-800 rounded-md border border-neutral-800">
              {offers.map((m) => (
                <li key={m.id} className="flex justify-between px-3 py-1.5">
                  <span className="text-neutral-300">{m.damageType?.name ?? m.note ?? "Repair"}</span>
                  <span className={m.approvalStatus === "APPROVED" ? "text-green-400" : "text-neutral-500"}>
                    {m.approvalStatus === "APPROVED" ? `Approved · ${money(m.suggestedPrice)}` : "Declined"}
                  </span>
                </li>
              ))}
              <li className="flex justify-between px-3 py-1.5 font-semibold">
                <span className="text-neutral-300">Approved repairs added to the bill</span>
                <span className="text-white">{money(approvedTotal)}</span>
              </li>
            </ul>
          )}
          {inspection.customerComment && (
            <div className="rounded-md border border-neutral-800 px-3 py-2 text-neutral-300">
              💬 “{inspection.customerComment}”
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-neutral-400">
            {noDamage
              ? isPre
                ? "No damage found — customer confirmation isn't required to start. You can still send them the report."
                : "No damage found. You can send the customer the report."
              : sent
                ? "⏳ Waiting for the customer to review the photos" + (pending.length > 0 ? ` and decide on ${pending.length} repair${pending.length === 1 ? "" : "s"}` : "") + ". This updates by itself."
                : isPre
                  ? "Send the report to the customer. Work can't start until they confirm it."
                  : "Send the report to the customer to confirm at pickup."}
          </p>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={send}
                disabled={!!busy || !customerPhone}
                title={customerPhone ? `WhatsApp ${customerPhone}` : "Customer has no phone number"}
                className={`${btn} bg-green-700 text-white hover:bg-green-600`}
              >
                {busy === "send" ? "Sending…" : sent ? "Resend on WhatsApp" : "Send on WhatsApp"}
              </button>
              <button onClick={copy} disabled={!!busy} className={`${btn} text-neutral-200 ring-1 ring-neutral-700 hover:bg-neutral-900`}>
                Copy link
              </button>
              <button onClick={openHere} disabled={!!busy} className={`${btn} text-neutral-200 ring-1 ring-neutral-700 hover:bg-neutral-900`}>
                Open on this device
              </button>
              {!noDamage && (
                <button
                  onClick={() => setInPerson((v) => !v)}
                  disabled={!!busy}
                  className={`${btn} text-neutral-400 underline hover:text-neutral-200`}
                >
                  Customer is here — record in person
                </button>
              )}
            </div>
          )}

          {inPerson && (
            <div className="space-y-2 rounded-md border border-neutral-800 p-3 text-xs">
              <p className="text-neutral-400">Walk the customer through the photos, then record what they agreed.</p>
              {pending.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-neutral-200">
                    {m.damageType?.name ?? m.note ?? "Repair"} · {money(m.suggestedPrice)}
                  </span>
                  <span className="flex gap-1">
                    {[true, false].map((ok) => (
                      <button
                        key={String(ok)}
                        onClick={() => setDecisions((d) => ({ ...d, [m.id]: ok }))}
                        className={`rounded-full px-3 py-1 ${
                          decisions[m.id] === ok
                            ? ok
                              ? "bg-green-600 text-white"
                              : "bg-neutral-600 text-white"
                            : "ring-1 ring-neutral-700 text-neutral-300"
                        }`}
                      >
                        {ok ? "Approve" : "Decline"}
                      </button>
                    ))}
                  </span>
                </div>
              ))}
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={500}
                placeholder="Customer's comment (optional)"
                className="w-full rounded-md border border-neutral-700 bg-black px-2 py-1.5"
              />
              <button onClick={recordInPerson} disabled={!!busy} className={`${btn} bg-red-600 text-white hover:bg-red-700`}>
                {busy === "confirm" ? "Saving…" : "Customer has seen and agreed"}
              </button>
            </div>
          )}
        </div>
      )}

      {notice && <div className="mt-2 text-xs text-green-400">{notice}</div>}
      {error && <div className="mt-2 text-xs text-red-500">{error}</div>}
    </div>
  );
}
