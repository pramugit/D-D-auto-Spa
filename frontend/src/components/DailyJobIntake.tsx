import { formatMinutes, packageMinutes } from "../utils/duration";
import { VEHICLE_TYPES, formatMileage, vehicleTypeLabel } from "../config/vehicleTypes";
import { forwardRef, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import * as bookingsApi from "../api/bookings";
import * as customersApi from "../api/customers";
import * as catalogApi from "../api/catalog";
import * as jobCardsApi from "../api/jobCards";
import * as damageTypesApi from "../api/damageTypes";
import * as usersApi from "../api/users";
import type {
  Customer,
  DamageMarking,
  DamageType,
  JobCard,
  Service,
  ServicePackage,
  StaffUser,
  Vehicle,
  VehicleType,
} from "../api/types";
import { apiErrorMessage } from "../api/client";
import { DailyFlowStep } from "./DailyFlowStep";
import { DamageInspectionDiagram, type NewMarkingDraft } from "./DamageInspectionDiagram";
import { EmailField, MileageField, NameField, PhoneField, PlateNumberField, mileageValue } from "./FormFields";


/** 0 Register · 1 Technicians · 2 Inspection · 3 Services/Packages · 4 Create job card */
type IntakeStage = 0 | 1 | 2 | 3 | 4;

const money = (n: number) => `Rs. ${n.toFixed(2).replace(/\.00$/, "")}`;

export function servicePrice(s: Service, vehicleType?: VehicleType): number | null {
  const p = s.pricing?.find((x) => x.vehicleType === vehicleType) ?? s.pricing?.[0];
  return p ? Number(p.price) : null;
}

/**
 * Steps 1–5 of Daily Jobs' top-to-bottom flow, inline on the page:
 *   1. Register customer & vehicle
 *   2. Assign technicians — who will work on this vehicle
 *   3. Vehicle inspection — mark existing damage on the 3D model (or skip)
 *   4. Select packages or services
 *   5. Create job card — review, create, then assign the technicians and
 *      save the inspection to it
 * Once the page has a current job (`activeJob`), all five collapse to a
 * summary of that job, with "+ Next customer" to start over.
 */
export const DailyJobIntake = forwardRef<
  HTMLElement,
  {
    activeJob: JobCard | null;
    canAct: boolean;
    /** `warning` is set when the job card exists but a follow-up step
     *  (technician assignment, inspection) failed. */
    onCreated: (jobCard: JobCard, warning?: string) => void;
    onNextCustomer: () => void;
  }
>(function DailyJobIntake({ activeJob, canAct, onCreated, onNextCustomer }, ref) {
  const [stage, setStage] = useState<IntakeStage>(0);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [damageTypes, setDamageTypes] = useState<DamageType[]>([]);
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [technicians, setTechnicians] = useState<Pick<StaffUser, "id" | "name">[]>([]);
  // Open job cards per technician, so staff can spread the work evenly.
  const [techLoad, setTechLoad] = useState<Record<string, number>>({});
  const [selectedTechs, setSelectedTechs] = useState<Set<string>>(new Set());
  const [markings, setMarkings] = useState<NewMarkingDraft[]>([]);
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
  const [selectedPackages, setSelectedPackages] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [isNewCustomer, setIsNewCustomer] = useState(false);
  // If the customer saves but the vehicle doesn't (e.g. bad plate), retrying
  // only creates the vehicle instead of a duplicate customer.
  const [registeredCustomerId, setRegisteredCustomerId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newMake, setNewMake] = useState("");
  const [newModel, setNewModel] = useState("");
  const [newYear, setNewYear] = useState(new Date().getFullYear());
  const [newPlateNumber, setNewPlateNumber] = useState("");
  const [newColor, setNewColor] = useState("");
  // Odometer when the vehicle arrives — saved on the job and the vehicle.
  const [mileage, setMileage] = useState("");
  const [newVehicleType, setNewVehicleType] = useState<VehicleType>("SEDAN");

  useEffect(() => {
    customersApi.listCustomers().then(setCustomers).catch(() => {});
    catalogApi.listServices({ active: true }).then(setServices).catch(() => {});
    catalogApi
      .listPackages()
      .then((ps) => setPackages(ps.filter((p) => p.active)))
      .catch(() => {});
    damageTypesApi.listDamageTypes().then(setDamageTypes).catch(() => {});
    usersApi.listTechnicians().then(setTechnicians).catch(() => {});
  }, []);

  // Refresh technician workload whenever the technician step opens.
  useEffect(() => {
    if (stage !== 1) return;
    jobCardsApi
      .listJobCards()
      .then((cards) => {
        const load: Record<string, number> = {};
        for (const c of cards) {
          if (c.status === "COMPLETED" || c.status === "CANCELLED") continue;
          for (const t of c.technicians) load[t.userId] = (load[t.userId] ?? 0) + 1;
        }
        setTechLoad(load);
      })
      .catch(() => {});
  }, [stage]);

  useEffect(() => {
    setVehicleId("");
    if (!customerId) {
      setVehicles([]);
      return;
    }
    customersApi
      .listVehicles(customerId)
      .then((vs) => {
        setVehicles(vs);
        if (vs.length === 1) setVehicleId(vs[0].id);
      })
      .catch(() => {});
  }, [customerId]);

  function resetForm() {
    setStage(0);
    setMileage("");
    setSearch("");
    setCustomerId("");
    setMarkings([]);
    setSelectedTechs(new Set());
    setSelectedServices(new Set());
    setSelectedPackages(new Set());
    setError(null);
    setIsNewCustomer(false);
    setRegisteredCustomerId(null);
    setNewName("");
    setNewPhone("");
    setNewEmail("");
    setNewMake("");
    setNewModel("");
    setNewYear(new Date().getFullYear());
    setNewPlateNumber("");
    setNewColor("");
    setNewVehicleType("SEDAN");
  }

  function goTo(s: IntakeStage) {
    setError(null);
    setStage(s);
  }

  // Matches name, email, number plate, or phone — phone by digits only, so
  // "077 123 4567", "0771234567" and "+94 77 123 4567" all find the same customer.
  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    const plain = q.replace(/[\s-]/g, "");
    let digits = q.replace(/\D/g, "");
    if (digits.startsWith("94") && digits.length > 2) digits = "0" + digits.slice(2);
    return customers.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      if (c.email?.toLowerCase().includes(q)) return true;
      if (digits.length >= 3) {
        let phone = c.phone.replace(/\D/g, "");
        if (phone.startsWith("94")) phone = "0" + phone.slice(2);
        if (phone.includes(digits) || phone.includes(digits.replace(/^0/, ""))) return true;
      }
      return !!c.vehicles?.some((v) => v.plateNumber.toLowerCase().replace(/[\s-]/g, "").includes(plain));
    });
  }, [customers, search]);

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const vehicleType = selectedVehicle?.vehicleType ?? "SEDAN";
  const chosenServices = services.filter((s) => selectedServices.has(s.id));
  const chosenPackages = packages.filter((p) => selectedPackages.has(p.id));
  const estimate =
    chosenServices.reduce((sum, s) => sum + (servicePrice(s, vehicleType) ?? 0), 0) +
    chosenPackages.reduce((sum, p) => sum + Number(p.discountedPrice), 0);
  // Same time rules as the schedule: services + packages + repair offers marked at inspection.
  const workMinutes =
    chosenServices.reduce((sum, s) => sum + s.durationMinutes, 0) + chosenPackages.reduce((sum, p) => sum + packageMinutes(p), 0);
  const repairMins = markings
    .filter((m) => m.isAdditionalRepairOffer)
    .reduce((sum, m) => sum + (damageTypes.find((t) => t.id === m.damageTypeId)?.repairMinutes ?? 0), 0);
  const groups: [string, Service[]][] = [
    ["Exterior", services.filter((s) => s.category?.name === "EXTERIOR")],
    ["Interior", services.filter((s) => s.category?.name === "INTERIOR")],
    ["Other", services.filter((s) => s.category?.name !== "EXTERIOR" && s.category?.name !== "INTERIOR")],
  ];

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  async function confirmRegister() {
    setError(null);
    if (!isNewCustomer) {
      if (!customerId || !vehicleId) {
        setError('Select a customer and vehicle, or press "+ Register new customer"');
        return;
      }
      setStage(1);
      return;
    }
    if (!newName.trim() || !newPhone.trim() || !newMake.trim() || !newModel.trim() || !newPlateNumber.trim()) {
      setError("Fill in the customer's name, phone, and the vehicle's make, model, and plate number");
      return;
    }
    setSaving(true);
    try {
      let custId = registeredCustomerId;
      if (!custId) {
        const customer = await customersApi.createCustomer({
          name: newName,
          phone: newPhone,
          email: newEmail || undefined,
        });
        custId = customer.id;
        setRegisteredCustomerId(custId);
        setCustomers((prev) => [customer, ...prev]);
      }
      await customersApi.createVehicle(custId, {
        make: newMake,
        model: newModel,
        year: newYear,
        plateNumber: newPlateNumber,
        color: newColor || undefined,
        vehicleType: newVehicleType,
        mileage: mileageValue(mileage),
      });
      // The customerId effect reloads this customer's vehicles and
      // auto-selects the only one — the vehicle just registered.
      setCustomerId(custId);
      setIsNewCustomer(false);
      setStage(1);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function confirmTechnicians() {
    setError(null);
    if (selectedTechs.size === 0) {
      setError("Assign at least one technician");
      return;
    }
    setStage(2);
  }

  function confirmItems() {
    setError(null);
    if (selectedServices.size === 0 && selectedPackages.size === 0) {
      setError("Select at least one package or service");
      return;
    }
    setStage(4);
  }

  async function createJobCard() {
    setError(null);
    if (!customerId || !vehicleId) {
      setError("Go back to step 1 and choose the customer's vehicle");
      return;
    }
    setSaving(true);
    try {
      const booking = await bookingsApi.createWalkInJob({
        customerId,
        vehicleId,
        items: [
          ...Array.from(selectedPackages).map((id) => ({ packageId: id })),
          ...Array.from(selectedServices).map((id) => ({ serviceId: id })),
        ],
        mileage: mileageValue(mileage),
      });
      const cards = await jobCardsApi.listJobCards(undefined, true);
      const card = cards.find((j) => j.bookingId === booking.id);
      if (!card) throw new Error("Job card was created but could not be loaded — refresh the page");
      // The job card exists either way from here on — a failure below is
      // reported but doesn't strand the user on this step.
      const problems: string[] = [];
      try {
        await jobCardsApi.assignTechnicians(card.id, Array.from(selectedTechs));
      } catch (err) {
        problems.push(`technicians weren't assigned (${apiErrorMessage(err)}) — assign them with Start Job`);
      }
      // Always saved — with no markers it records "No damage found",
      // which is different from "never inspected".
      try {
        await jobCardsApi.createDamageInspection(card.id, "PRE_SERVICE", markings);
      } catch (err) {
        problems.push(`the inspection didn't save (${apiErrorMessage(err)})`);
      }
      const fresh = await jobCardsApi.getJobCard(card.id).catch(() => card);
      resetForm();
      onCreated(fresh, problems.length > 0 ? `Job card created, but ${problems.join("; ")}` : undefined);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const errorBox = error && <div className="mt-3 rounded-md bg-red-950 px-3 py-2 text-sm text-red-500">{error}</div>;
  const vehicleText = selectedVehicle
    ? `${selectedVehicle.plateNumber} — ${selectedVehicle.make} ${selectedVehicle.model} (${vehicleTypeLabel(selectedVehicle.vehicleType)})${mileage ? ` · ${formatMileage(Number(mileage))}` : ""}`
    : "loading vehicle...";

  // ── A current job is selected: steps 1–5 are done; show what was done. ──
  if (activeJob) {
    const b = activeJob.booking;
    const pre = activeJob.damageInspections.find((d) => d.stage === "PRE_SERVICE");
    return (
      <>
        <DailyFlowStep
          ref={ref}
          n={1}
          title="Register customer & vehicle"
          state="done"
          summary={
            <>
              <span className="font-medium text-white">{b.customer?.name}</span>
              {b.customer?.phone ? ` · ${b.customer.phone}` : ""} — {b.vehicle?.plateNumber} {b.vehicle?.make}{" "}
              {b.vehicle?.model}
            </>
          }
          action={
            canAct && (
              <button onClick={onNextCustomer} className={primaryBtn}>
                + Next customer
              </button>
            )
          }
        />
        <DailyFlowStep
          n={2}
          title="Assign technicians"
          state="done"
          summary={activeJob.technicians.map((t) => t.user.name).join(", ") || "No technician assigned yet."}
        />
        <DailyFlowStep
          n={3}
          title="Vehicle inspection"
          state="done"
          summary={
            pre
              ? `${pre.markings.length} damage mark${pre.markings.length === 1 ? "" : "s"} recorded before the work started.`
              : "No damage recorded."
          }
        />
        <DailyFlowStep
          n={4}
          title="Packages & services"
          state="done"
          summary={b.services?.map((s) => s.package?.name ?? s.service?.name).join(", ") || "—"}
        />
        <DailyFlowStep
          n={5}
          title="Create job card"
          state="done"
          summary={
            <Link to={`/job-board/${activeJob.id}`} className="text-red-400 hover:underline">
              Open full job card
            </Link>
          }
        />
      </>
    );
  }

  if (!canAct) {
    return (
      <DailyFlowStep
        ref={ref}
        n={1}
        title="Register customer & vehicle"
        state="locked"
        summary="You don't have permission to create daily jobs. Pick a job on the board below to continue with it."
      />
    );
  }

  const stepState = (s: IntakeStage) => (stage > s ? "done" : stage === s ? "active" : "locked");
  const editBtn = (s: IntakeStage) =>
    stage > s && (
      <button onClick={() => goTo(s)} className={secondaryBtn}>
        Change
      </button>
    );

  // Draft markings in the saved-record shape the diagram displays.
  const previewMarkings: DamageMarking[] = markings.map((m, idx) => ({
    id: `draft-${idx}`,
    damageInspectionId: "",
    view: "FRONT",
    x: m.x,
    y: m.y,
    z: m.z,
    damageTypeId: m.damageTypeId ?? null,
    damageType: damageTypes.find((t) => t.id === m.damageTypeId) ?? null,
    note: m.note ?? null,
    suggestedPrice: m.isAdditionalRepairOffer ? String(m.suggestedPrice ?? 0) : null,
    isAdditionalRepairOffer: m.isAdditionalRepairOffer,
    approvalStatus: m.isAdditionalRepairOffer ? "PENDING" : "NOT_APPLICABLE",
    severity: m.severity,
    photoUrl: m.photoUrl ?? null,
    createdAt: new Date().toISOString(),
    decidedAt: null,
  }));

  return (
    <>
      {/* ── Step 1: Register ── */}
      <DailyFlowStep
        ref={ref}
        n={1}
        title="Register customer & vehicle"
        state={stepState(0)}
        summary={
          stage > 0 && (
            <>
              <span className="font-medium text-white">{selectedCustomer?.name}</span> — {vehicleText}
            </>
          )
        }
        action={
          stage > 0 ? (
            editBtn(0)
          ) : (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setIsNewCustomer((p) => !p);
              }}
              className="text-xs font-medium text-red-500 hover:underline"
            >
              {isNewCustomer ? "Pick an existing customer instead" : "+ Register new customer"}
            </button>
          )
        }
      >
        {stage === 0 && (
          <>
            {isNewCustomer ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <NameField label="Customer name" required value={newName} onChange={setNewName} />
                  <PhoneField label="Phone (WhatsApp)" required value={newPhone} onChange={setNewPhone} />
                </div>
                <EmailField label="Email (optional)" value={newEmail} onChange={setNewEmail} />
                <div className="border-t border-neutral-800 pt-3 text-xs font-semibold uppercase text-neutral-500">
                  Vehicle details
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <PlateNumberField label="Plate number" required value={newPlateNumber} onChange={setNewPlateNumber} />
                  <NameField label="Make" required value={newMake} onChange={setNewMake} />
                  <NameField label="Model" required value={newModel} onChange={setNewModel} />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-300">Year</label>
                    <input
                      type="number"
                      min={1900}
                      max={2100}
                      value={newYear}
                      onChange={(e) => setNewYear(Number(e.target.value))}
                      className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-300">Color (optional)</label>
                    <input
                      value={newColor}
                      onChange={(e) => setNewColor(e.target.value)}
                      className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-300">Vehicle type</label>
                    <select
                      value={newVehicleType}
                      onChange={(e) => setNewVehicleType(e.target.value as VehicleType)}
                      className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
                    >
                      {VEHICLE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {vehicleTypeLabel(t)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <MileageField label="Mileage now (optional)" value={mileage} onChange={setMileage} />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedCustomer ? (
                  <div className="flex items-center justify-between gap-3 rounded-md border border-red-700 bg-neutral-950 px-3 py-2">
                    <div className="min-w-0 text-sm">
                      <span className="font-semibold text-white">{selectedCustomer.name}</span>
                      <span className="text-neutral-400"> — {selectedCustomer.phone}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomerId("");
                        setSearch("");
                      }}
                      className="shrink-0 text-xs font-medium text-neutral-400 hover:text-red-400"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div>
                    <input
                      type="search"
                      autoFocus
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && filteredCustomers.length > 0) {
                          e.preventDefault();
                          setCustomerId(filteredCustomers[0].id);
                        }
                      }}
                      placeholder="Search customer by name, phone or number plate..."
                      className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
                    />
                    <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-neutral-800">
                      {filteredCustomers.length === 0 ? (
                        <p className="px-3 py-3 text-sm text-neutral-500">
                          {customers.length === 0 ? "No customers yet." : `No customer matches “${search.trim()}”.`}{" "}
                          Use “+ Register new customer” above.
                        </p>
                      ) : (
                        filteredCustomers.slice(0, 50).map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setCustomerId(c.id)}
                            className="flex w-full flex-wrap items-center justify-between gap-x-3 border-b border-neutral-800 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-neutral-800"
                          >
                            <span>
                              <span className="font-medium text-white">{c.name}</span>
                              <span className="text-neutral-400"> — {c.phone}</span>
                            </span>
                            {c.vehicles && c.vehicles.length > 0 && (
                              <span className="text-xs text-neutral-500">
                                {c.vehicles.map((v) => v.plateNumber).join(", ")}
                              </span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                    {filteredCustomers.length > 50 && (
                      <p className="mt-1 text-xs text-neutral-500">
                        Showing 50 of {filteredCustomers.length} — type more to narrow it down.
                      </p>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <select
                    disabled={!customerId}
                    value={vehicleId}
                    onChange={(e) => setVehicleId(e.target.value)}
                    className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm disabled:bg-neutral-800"
                  >
                    <option value="">Select vehicle...</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.plateNumber} — {v.make} {v.model} ({vehicleTypeLabel(v.vehicleType)})
                      </option>
                    ))}
                  </select>
                </div>
                {vehicleId && (
                  <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
                    <MileageField label="Mileage today (optional)" value={mileage} onChange={setMileage} />
                    <p className="pb-2 text-xs text-neutral-500 sm:col-span-2">
                      {selectedVehicle?.mileage != null
                        ? `Last recorded: ${formatMileage(selectedVehicle.mileage)}`
                        : "No mileage recorded for this vehicle yet."}
                    </p>
                  </div>
                )}
                {customerId && vehicles.length === 0 && (
                  <p className="text-xs text-neutral-500">
                    This customer has no vehicles yet —{" "}
                    <Link to={`/customers/${customerId}`} className="text-red-500 hover:underline">
                      add one on their profile
                    </Link>
                    .
                  </p>
                )}
              </div>
            )}
            {errorBox}
            <div className="mt-4 flex justify-end">
              <button onClick={confirmRegister} disabled={saving} className={primaryBtn}>
                {saving ? "Registering..." : isNewCustomer ? "Register & continue ↓" : "Continue ↓"}
              </button>
            </div>
          </>
        )}
      </DailyFlowStep>

      {/* ── Step 2: Assign technicians ── */}
      <DailyFlowStep
        n={2}
        title="Assign technicians"
        state={stepState(1)}
        summary={
          stage < 1
            ? "Finish step 1 first."
            : stage > 1
              ? technicians
                  .filter((t) => selectedTechs.has(t.id))
                  .map((t) => t.name)
                  .join(", ")
              : "Choose who will work on this vehicle. The number shows how many open jobs each technician already has."
        }
        action={editBtn(1)}
      >
        {stage === 1 && (
          <>
            {technicians.length === 0 ? (
              <div className="text-sm text-neutral-500">No technicians on staff yet — add them under Staff.</div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {[...technicians]
                  .sort((a, b) => (techLoad[a.id] ?? 0) - (techLoad[b.id] ?? 0))
                  .map((t) => {
                    const on = selectedTechs.has(t.id);
                    const load = techLoad[t.id] ?? 0;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggle(selectedTechs, setSelectedTechs, t.id)}
                        className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition ${
                          on ? "border-red-600 bg-red-950/40 text-white" : "border-neutral-800 text-neutral-300 hover:border-neutral-600"
                        }`}
                      >
                        <span className="font-medium">
                          {on ? "✓ " : ""}
                          {t.name}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] ${
                            load === 0 ? "bg-green-950 text-green-400" : "bg-neutral-800 text-neutral-400"
                          }`}
                          title="Open jobs right now"
                        >
                          {load === 0 ? "free" : `${load} job${load === 1 ? "" : "s"}`}
                        </span>
                      </button>
                    );
                  })}
              </div>
            )}
            {errorBox}
            <div className="mt-4 flex justify-end">
              <button onClick={confirmTechnicians} className={primaryBtn}>
                Continue ↓
              </button>
            </div>
          </>
        )}
      </DailyFlowStep>

      {/* ── Step 3: Vehicle inspection ── */}
      <DailyFlowStep
        n={3}
        title="Vehicle inspection"
        state={stepState(2)}
        summary={
          stage < 2
            ? "Assign technicians first."
            : stage > 2
              ? markings.length > 0
                ? `${markings.length} damage mark${markings.length === 1 ? "" : "s"} recorded.`
                : "No damage recorded."
              : "Walk around the vehicle with the customer. Click the 3D model where there is existing damage (scratch, dent...) and add a close-up photo. Skip if there is no damage."
        }
        action={editBtn(2)}
      >
        {stage === 2 && (
          <>
            <DamageInspectionDiagram
              markings={previewMarkings}
              editable
              damageTypes={damageTypes}
              vehicleType={vehicleType}
              onAddMarking={(m) => setMarkings((prev) => [...prev, m])}
              onUploadPhoto={async (file) => {
                const { url } = await jobCardsApi.uploadDamagePhoto(file);
                return url;
              }}
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-neutral-400">
                {markings.length} mark{markings.length === 1 ? "" : "s"}
                {markings.length > 0 && (
                  <button onClick={() => setMarkings([])} className="ml-3 text-xs text-red-400 hover:underline">
                    Clear all
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                {markings.length === 0 && (
                  <button onClick={() => goTo(3)} className={secondaryBtnLg}>
                    No damage — skip ↓
                  </button>
                )}
                <button onClick={() => goTo(3)} disabled={markings.length === 0} className={primaryBtn}>
                  Save inspection & continue ↓
                </button>
              </div>
            </div>
          </>
        )}
      </DailyFlowStep>

      {/* ── Step 4: Packages & services ── */}
      <DailyFlowStep
        n={4}
        title="Select packages or services"
        state={stepState(3)}
        summary={
          stage < 3
            ? "Finish the inspection first."
            : stage > 3
              ? `${[...chosenPackages.map((p) => p.name), ...chosenServices.map((s) => s.name)].join(", ")} — est. ${money(estimate)}`
              : `Prices shown for: ${vehicleTypeLabel(vehicleType)}.`
        }
        action={editBtn(3)}
      >
        {stage === 3 && (
          <>
            {packages.length > 0 && (
              <>
                <div className="mb-2 text-xs font-semibold uppercase text-neutral-500">Packages</div>
                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {packages.map((p) => {
                    const on = selectedPackages.has(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggle(selectedPackages, setSelectedPackages, p.id)}
                        className={`rounded-md border p-3 text-left transition ${
                          on ? "border-red-600 bg-red-950/40" : "border-neutral-800 hover:border-neutral-600"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium text-white">
                            {on ? "✓ " : ""}
                            {p.name}
                          </span>
                          <span className="text-sm font-semibold text-red-400">{money(Number(p.discountedPrice))}</span>
                        </div>
                        <div className="mt-1 text-xs text-neutral-400">
                          {p.services.map((l) => l.service.name).join(" · ")}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            <div className="mb-2 text-xs font-semibold uppercase text-neutral-500">Single services</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {groups
                .filter(([title, items]) => items.length > 0 || title !== "Other")
                .map(([title, items]) => (
                  <div key={title} className="rounded-md border border-neutral-800 p-2">
                    <div className="mb-1 text-xs font-semibold uppercase text-neutral-500">{title}</div>
                    {items.map((s) => {
                      const price = servicePrice(s, vehicleType);
                      return (
                        <label key={s.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-black">
                          <input
                            type="checkbox"
                            checked={selectedServices.has(s.id)}
                            onChange={() => toggle(selectedServices, setSelectedServices, s.id)}
                          />
                          <span className="flex-1">{s.name}</span>
                          {price !== null && <span className="text-xs text-neutral-400">{money(price)}</span>}
                        </label>
                      );
                    })}
                    {items.length === 0 && <div className="px-2 py-1 text-xs text-neutral-500">None</div>}
                  </div>
                ))}
            </div>
            {errorBox}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-neutral-300">
                Estimated total: <span className="font-semibold text-white">{money(estimate)}</span>
                <span className="ml-1 text-xs text-neutral-500">(before tax)</span>
              </div>
              <button onClick={confirmItems} className={primaryBtn}>
                Continue ↓
              </button>
            </div>
          </>
        )}
      </DailyFlowStep>

      {/* ── Step 5: Create job card ── */}
      <DailyFlowStep
        n={5}
        title="Create job card"
        state={stepState(4)}
        summary={stage < 4 && "Choose the packages or services first."}
      >
        {stage === 4 && (
          <>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-md border border-neutral-800 bg-black p-3 text-sm sm:grid-cols-2">
              <Row label="Customer" value={`${selectedCustomer?.name ?? ""} · ${selectedCustomer?.phone ?? ""}`} />
              <Row label="Vehicle" value={vehicleText} />
              <Row
                label="Technicians"
                value={technicians
                  .filter((t) => selectedTechs.has(t.id))
                  .map((t) => t.name)
                  .join(", ")}
              />
              <Row
                label="Inspection"
                value={markings.length > 0 ? `${markings.length} damage mark(s)` : "No damage recorded"}
              />
              <Row
                label="Work"
                value={[...chosenPackages.map((p) => p.name), ...chosenServices.map((s) => s.name)].join(", ")}
              />
              <Row
                label="Estimated time"
                value={`${formatMinutes(workMinutes + repairMins)}${repairMins ? ` (incl. ${formatMinutes(repairMins)} damage repairs)` : ""} · ready around ${new Date(Date.now() + (workMinutes + repairMins) * 60000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`}
              />
              <Row label="Estimated total" value={`${money(estimate)} + tax`} />
            </dl>
            <p className="mt-3 text-xs text-neutral-500">
              The customer gets a WhatsApp message that the job has been received.
            </p>
            {errorBox}
            <div className="mt-4 flex justify-end">
              <button onClick={createJobCard} disabled={saving} className={primaryBtn}>
                {saving ? "Creating..." : "Create job card ↓"}
              </button>
            </div>
          </>
        )}
      </DailyFlowStep>
    </>
  );
});

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase text-neutral-500">{label}</dt>
      <dd className="text-neutral-200">{value}</dd>
    </div>
  );
}

const primaryBtn =
  "rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50";
const secondaryBtn =
  "rounded-md border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-800";
const secondaryBtnLg =
  "rounded-md border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-800";
