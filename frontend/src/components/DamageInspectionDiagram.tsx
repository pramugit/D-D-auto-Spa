import { formatMinutes } from "../utils/duration";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { formatMoney } from "../utils/money";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { ContactShadows, Environment, Html, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { AnimatePresence, motion } from "framer-motion";
import type { DamageMarking, DamageSeverity, DamageType, VehicleType } from "../api/types";
import { getVehicleModel } from "../config/vehicleModels";
import { API_URL, apiErrorMessage } from "../api/client";
import { formatNote, validateNote, validatePrice } from "../utils/validators";
import { CameraCaptureModal } from "./CameraCaptureModal";

// A point on the vehicle's 3D model surface, in that model's own local
// (un-normalized) coordinate space — see VehicleModel below for why that
// space, not screen or world space, is what gets stored. "view" stays on
// the wire only because the DB column is still NOT NULL; it's never
// shown to the user (see the conversation that replaced the 4-view
// diagram set with a single photo, then that photo with this rotatable
// 3D model).
export interface NewMarkingDraft {
  /** Set for a marker that's already saved (editing an inspection). */
  id?: string;
  x: number;
  y: number;
  z: number;
  damageTypeId?: string;
  note?: string;
  suggestedPrice?: number;
  isAdditionalRepairOffer: boolean;
  severity: DamageSeverity;
  photoUrl?: string;
}

interface DamageInspectionDiagramProps {
  vehicleType: VehicleType;
  markings: DamageMarking[];
  editable?: boolean;
  /** Required when editable — the catalog staff pick a damage type from
   *  (dropdown, never free text). */
  damageTypes?: DamageType[];
  onAddMarking?: (marking: NewMarkingDraft) => void;
  /** Editable mode: change the marker at this list index (form reopens prefilled). */
  onEditMarking?: (index: number, marking: NewMarkingDraft) => void;
  /** Editable mode: delete the marker at this list index. */
  onRemoveMarking?: (index: number) => void;
  /** Uploads a close-up of the spot being marked and resolves to its URL
   *  — required when editable if photo attachment should be offered. */
  onUploadPhoto?: (file: File) => Promise<string>;
  /** Customer's binary decision on a PENDING additional-repair offer. */
  onDecide?: (markingId: string, approved: boolean) => void;
  decidingId?: string | null;
  /** Staff-only correction path for an already-decided offer. */
  onReset?: (markingId: string) => void;
  resettingId?: string | null;
  height?: number;
}

const NOTE_MAX_LENGTH = 300;

const SEVERITY_META: Record<DamageSeverity, { label: string; color: string }> = {
  MINOR: { label: "Minor", color: "#f87171" },
  MODERATE: { label: "Moderate", color: "#dc2626" },
  SEVERE: { label: "Severe", color: "#7f1d1d" },
};

type DamageIconKind = "scratch" | "dent" | "paint-chip" | "rust" | "generic";

/** A DamageType's name is free-text (staff-managed catalog), so the icon
 *  is picked by keyword rather than a fixed enum. */
function iconKindForDamageType(name?: string | null): DamageIconKind {
  if (!name) return "generic";
  const n = name.toLowerCase();
  if (n.includes("scratch")) return "scratch";
  if (n.includes("dent")) return "dent";
  if (n.includes("paint") || n.includes("chip")) return "paint-chip";
  if (n.includes("rust")) return "rust";
  return "generic";
}

function DamageIcon({ kind }: { kind: DamageIconKind }) {
  switch (kind) {
    case "scratch":
      return (
        <svg width="10" height="10" viewBox="0 0 10 10">
          <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    case "dent":
      return (
        <svg width="10" height="10" viewBox="0 0 10 10">
          <circle cx="5" cy="5" r="2.6" fill="none" stroke="white" strokeWidth="1.4" />
        </svg>
      );
    case "paint-chip":
      return (
        <svg width="10" height="10" viewBox="0 0 10 10">
          <circle cx="5" cy="5" r="1.8" fill="white" />
        </svg>
      );
    case "rust":
      return (
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M1 5 L3.3 2 L5.5 4.5 L9 1.5" fill="none" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return null;
  }
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: "#9a9a9a",
  APPROVED: "#dc2626",
  DECLINED: "#525252",
  NOT_APPLICABLE: "#3a3a3a",
};

/**
 * One marking pin's HTML content (drei's <Html> handles projecting this
 * onto the right screen position for the 3D point it's attached to — see
 * the <Html center> usage below). Handles its own status-transition
 * animation: a pending marker pulses continuously, and the instant it
 * resolves plays a one-shot checkmark (approved) or shake-to-gray
 * (declined) before settling into a static color.
 */
function Marker({ marking, number }: { marking: DamageMarking; number: number }) {
  const prevStatusRef = useRef(marking.approvalStatus);
  const [justResolved, setJustResolved] = useState<"APPROVED" | "DECLINED" | null>(null);

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = marking.approvalStatus;
    if (prev === "PENDING" && (marking.approvalStatus === "APPROVED" || marking.approvalStatus === "DECLINED")) {
      setJustResolved(marking.approvalStatus);
      const t = setTimeout(() => setJustResolved(null), 900);
      return () => clearTimeout(t);
    }
  }, [marking.approvalStatus]);

  const color = STATUS_COLOR[marking.approvalStatus] ?? STATUS_COLOR.NOT_APPLICABLE;
  const severity = marking.severity ?? "MINOR";
  const severityColor = SEVERITY_META[severity].color;
  const iconKind = iconKindForDamageType(marking.damageType?.name);
  const pulsing = marking.approvalStatus === "PENDING" && !justResolved;

  return (
    <motion.div
      className="relative"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 15 }}
    >
      {pulsing && (
        <motion.div
          className="absolute left-1/2 top-1/2 rounded-full"
          style={{ border: `2px solid ${color}`, width: 22, height: 22, marginLeft: -11, marginTop: -11 }}
          animate={{ scale: [0.7, 1.6, 0.7], opacity: [0.7, 0, 0.7] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      {/* Severity — a colored ring around the pin, independent of the
          fill color above (which tracks the approval/billing status). */}
      <div
        className="relative flex h-6 w-6 items-center justify-center rounded-full border-2 border-white shadow"
        style={{ backgroundColor: color, boxShadow: `0 0 0 2px ${severityColor}` }}
        title={`${SEVERITY_META[severity].label} severity`}
      >
        <DamageIcon kind={iconKind} />
      </div>
      {marking.photoUrl && (
        <div
          className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white bg-neutral-800 text-[7px]"
          title="Photo attached"
        >
          📷
        </div>
      )}
      <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-[11px] font-bold" style={{ color }}>
        {number}
      </div>

      <AnimatePresence>
        {justResolved === "APPROVED" && (
          <motion.div
            className="absolute left-1/2 top-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-red-600"
            style={{ marginLeft: -16, marginTop: -16 }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.3, opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16">
              <path d="M3 8.5 L6.5 12 L13 4" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </motion.div>
        )}
        {justResolved === "DECLINED" && (
          <motion.div
            className="absolute left-1/2 top-1/2 h-6 w-6 rounded-full bg-neutral-600"
            style={{ marginLeft: -12, marginTop: -12 }}
            initial={{ x: 0 }}
            animate={{ x: [0, -4, 4, -3, 3, 0] }}
            transition={{ duration: 0.5 }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// A single shared "clay render" material — soft off-white, low
interface VehicleModelProps {
  modelPath: string;
  editable: boolean;
  onSurfaceClick: (point: THREE.Vector3) => void;
  onFloorY?: (y: number) => void;
  children?: React.ReactNode;
}

/**
 * Loads and centers a vehicle .glb, and turns clicks on its surface into
 * a point in the model's own local coordinate space.
 *
 * Markings are stored in that RAW, un-normalized space (the coordinates
 * baked into the .glb file itself) rather than in scaled/centered
 * "world" space, because the centering/scaling below is a display choice
 * (fit every model to roughly the same on-screen size) that could
 * plausibly change later — raw mesh-space coordinates stay correct
 * regardless, since they're read out via groupRef.worldToLocal(), which
 * strips exactly the centering transform applied to this group.
 */
function VehicleModel({ modelPath, editable, onSurfaceClick, onFloorY, children }: VehicleModelProps) {
  const { scene } = useGLTF(modelPath);
  const groupRef = useRef<THREE.Group>(null!);
  const downPos = useRef<{ x: number; y: number } | null>(null);

  const cloned = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      // These models (see public/vehicle-models/CREDITS.txt) are
      // procedurally built in-house with the body/glass/trim/wheel
      // materials and smooth-shaded normals already correct per mesh
      // (see "3D vehicle models GLB/vehicles.js"'s extrude() helper) —
      // unlike the earlier downloaded low-poly kits, there's no baked
      // texture/PBR inconsistency or flat-shading to fix up here.
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    return c;
  }, [scene]);

  const { scale, position, floorY } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const s = 4 / maxDim;
    // Where the model's lowest point (wheels) lands in world space once
    // centered and scaled — lets the contact shadow sit exactly under
    // the model instead of a guessed constant that would float or clip
    // depending on each model's proportions.
    const fy = (box.min.y - center.y) * s;
    return { scale: s, position: [-center.x * s, -center.y * s, -center.z * s] as [number, number, number], floorY: fy };
  }, [cloned]);

  useEffect(() => {
    onFloorY?.(floorY);
  }, [floorY, onFloorY]);

  function handlePointerDown(e: ThreeEvent<PointerEvent>) {
    downPos.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
  }

  function handleClick(e: ThreeEvent<MouseEvent>) {
    if (!editable || !groupRef.current) return;
    const down = downPos.current;
    if (down) {
      const dx = e.nativeEvent.clientX - down.x;
      const dy = e.nativeEvent.clientY - down.y;
      // A camera-rotate drag ends with a native click too — ignore it so
      // orbiting the model never accidentally drops a marker.
      if (Math.hypot(dx, dy) > 6) return;
    }
    e.stopPropagation();
    const local = groupRef.current.worldToLocal(e.point.clone());
    onSurfaceClick(local);
  }

  return (
    <group ref={groupRef} scale={scale} position={position}>
      <primitive
        object={cloned}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
        onPointerOver={editable ? () => (document.body.style.cursor = "crosshair") : undefined}
        onPointerOut={editable ? () => (document.body.style.cursor = "auto") : undefined}
      />
      {children}
    </group>
  );
}

function Loading3DFallback() {
  return (
    <Html center>
      <div className="text-xs text-neutral-500">Loading model…</div>
    </Html>
  );
}

/**
 * A rotatable 3D model of the vehicle's category (CC0 assets — see
 * public/vehicle-models/CREDITS.txt) — drag to orbit 360° around it,
 * click anywhere on the body to mark damage. Replaced the earlier
 * single-photo and, before that, 4-view SVG diagram approaches, which
 * couldn't show damage from an arbitrary angle the way a real walk-
 * around inspection can.
 */
export function DamageInspectionDiagram({
  vehicleType,
  markings,
  editable,
  damageTypes = [],
  onAddMarking,
  onEditMarking,
  onRemoveMarking,
  onUploadPhoto,
  onDecide,
  decidingId,
  onReset,
  resettingId,
  height = 320,
}: DamageInspectionDiagramProps) {
  const [pendingPoint, setPendingPoint] = useState<THREE.Vector3 | null>(null);
  const [damageTypeId, setDamageTypeId] = useState("");
  const [note, setNote] = useState("");
  const [price, setPrice] = useState("");
  const [isOffer, setIsOffer] = useState(false);
  const [severity, setSeverity] = useState<DamageSeverity>("MINOR");
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [floorY, setFloorY] = useState(-1);
  // Index of the marker being edited (null = adding a new one).
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  function startEdit(idx: number) {
    const m = markings[idx];
    if (m.x == null || m.y == null || m.z == null) return;
    setPendingPoint(new THREE.Vector3(m.x, m.y, m.z));
    setDamageTypeId(m.damageTypeId ?? "");
    setNote(m.note ?? "");
    setPrice(m.suggestedPrice != null ? String(m.suggestedPrice) : "");
    setIsOffer(m.isAdditionalRepairOffer);
    setSeverity(m.severity ?? "MINOR");
    setPhotoUrl(m.photoUrl ?? undefined);
    setFormError(null);
    setEditingIndex(idx);
  }

  function resetForm() {
    setDamageTypeId("");
    setNote("");
    setPrice("");
    setIsOffer(false);
    setSeverity("MINOR");
    setPhotoUrl(undefined);
    setFormError(null);
  }

  function handleSurfaceClick(point: THREE.Vector3) {
    // While editing a marker, a click on the model moves it there.
    setPendingPoint(point);
    if (editingIndex === null) resetForm();
  }

  function cancelForm() {
    setPendingPoint(null);
    setEditingIndex(null);
    resetForm();
  }

  function handleSelectDamageType(idVal: string) {
    setDamageTypeId(idVal);
    const type = damageTypes.find((t) => t.id === idVal);
    if (type) setPrice(type.defaultPrice);
  }

  async function handlePhotoFile(file: File) {
    if (!onUploadPhoto) return;
    setFormError(null);
    setPhotoBusy(true);
    try {
      const url = await onUploadPhoto(file);
      setPhotoUrl(url);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setPhotoBusy(false);
    }
  }

  function confirmMarking() {
    if (!pendingPoint) return;
    if (editingIndex === null ? !onAddMarking : !onEditMarking) return;
    if (!damageTypeId && !note.trim()) {
      setFormError("Pick a damage type or add a note describing the spot");
      return;
    }
    const noteError = note ? validateNote(note, NOTE_MAX_LENGTH) : null;
    if (noteError) {
      setFormError(noteError);
      return;
    }
    if (isOffer) {
      const priceError = validatePrice(price);
      if (priceError) {
        setFormError(priceError);
        return;
      }
    }

    const draft: NewMarkingDraft = {
      x: pendingPoint.x,
      y: pendingPoint.y,
      z: pendingPoint.z,
      damageTypeId: damageTypeId || undefined,
      note: note.trim() ? formatNote(note) : undefined,
      suggestedPrice: isOffer ? Number(price) : undefined,
      isAdditionalRepairOffer: isOffer,
      severity,
      photoUrl,
    };
    if (editingIndex === null) onAddMarking!(draft);
    else onEditMarking!(editingIndex, draft);
    cancelForm();
  }

  const markingsWithCoords = markings
    .map((m, idx) => ({ m, number: idx + 1 }))
    .filter(({ m }) => m.x != null && m.y != null && m.z != null);

  return (
    <div>
      <div
        className="relative overflow-hidden rounded-lg border border-neutral-800"
        style={{
          height,
          background: "radial-gradient(circle at 50% 38%, #2b2b2b 0%, #161616 55%, #050505 100%)",
        }}
      >
        <Canvas camera={{ position: [4.5, 2.8, 5.5], fov: 40 }} dpr={[1, 2]} shadows>
          {/* Soft studio rig: a bright key light, a dim cool fill on the
              opposite side, and a rim light behind to separate the model
              from the background — aiming for the reference mockup's
              clean product-render look rather than flat game lighting. */}
          <ambientLight intensity={0.2} />
          <directionalLight
            position={[5, 8, 4]}
            intensity={0.9}
            castShadow
            shadow-mapSize={[1024, 1024]}
            shadow-bias={-0.0005}
          />
          <directionalLight position={[-6, 3, -3]} intensity={0.2} color="#f5f5f5" />
          <directionalLight position={[-2, 4, -6]} intensity={0.25} />
          <Suspense fallback={<Loading3DFallback />}>
            {/* A studio HDRI is what actually sells the "product render"
                look — it's the source of the soft reflected highlights and
                gradients on curved panels that flat directional lights
                alone can't fake, which is most of the gap between the flat
                low-poly look and the reference mockup's glossy paint. */}
            <Environment preset="studio" environmentIntensity={0.35} />
            <VehicleModel
              modelPath={getVehicleModel(vehicleType)}
              editable={!!editable}
              onSurfaceClick={handleSurfaceClick}
              onFloorY={setFloorY}
            >
              {markingsWithCoords.map(({ m, number }) => (
                <Html key={m.id} position={[m.x!, m.y!, m.z!]} center style={{ pointerEvents: "none" }}>
                  <Marker marking={m} number={number} />
                </Html>
              ))}
              {pendingPoint && (
                <Html position={[pendingPoint.x, pendingPoint.y, pendingPoint.z]} center style={{ pointerEvents: "none" }}>
                  <div
                    className="h-6 w-6 rounded-full border-2 border-white shadow"
                    style={{ backgroundColor: "#ef4444" }}
                  />
                </Html>
              )}
            </VehicleModel>
            <ContactShadows position={[0, floorY, 0]} opacity={0.45} scale={10} blur={2.2} far={2} resolution={512} />
          </Suspense>
          <OrbitControls
            makeDefault
            enablePan={false}
            minDistance={3}
            maxDistance={11}
            minPolarAngle={Math.PI * 0.12}
            maxPolarAngle={Math.PI * 0.5}
          />
        </Canvas>
        {editable && (
          <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-neutral-900/85 px-2 py-1 text-[11px] text-neutral-400 shadow-sm">
            Drag to rotate · click the model to mark damage
          </div>
        )}
      </div>

      {editable && pendingPoint && (
        <div className="mt-2 space-y-3 rounded-md border border-red-900 bg-red-950/40 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-red-300">{editingIndex === null ? "Report Damage at This Spot" : `Edit Marker ${editingIndex + 1} — click the model to move it`}</div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-400">Damage Type</label>
              <select
                value={damageTypeId}
                onChange={(e) => handleSelectDamageType(e.target.value)}
                className="w-full rounded-md border border-neutral-700 px-2 py-1.5 text-sm focus:border-red-600 focus:outline-none"
              >
                <option value="">— none / see note —</option>
                {damageTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({formatMoney(t.defaultPrice)} · {formatMinutes(t.repairMinutes)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-400">Severity</label>
              <div className="flex gap-1">
                {(Object.keys(SEVERITY_META) as DamageSeverity[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSeverity(s)}
                    className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition ${
                      severity === s ? "text-white shadow-sm" : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-black"
                    }`}
                    style={severity === s ? { backgroundColor: SEVERITY_META[s].color, borderColor: SEVERITY_META[s].color } : undefined}
                  >
                    {SEVERITY_META[s].label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">Note (optional, max {NOTE_MAX_LENGTH})</label>
            <input
              autoFocus
              value={note}
              maxLength={NOTE_MAX_LENGTH}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. scratch near left mirror, ~4cm"
              className="w-full rounded-md border border-neutral-700 px-2 py-1.5 text-sm focus:border-red-600 focus:outline-none"
            />
          </div>

          {onUploadPhoto && (
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-400">Close-up Photo (optional)</label>
              {photoUrl ? (
                <div className="flex items-center gap-2">
                  <img src={`${API_URL}${photoUrl}`} alt="Damage close-up" className="h-14 w-14 rounded-md border border-neutral-800 object-cover" />
                  <button
                    type="button"
                    onClick={() => setPhotoUrl(undefined)}
                    className="text-xs text-red-500 underline hover:no-underline"
                  >
                    Remove photo
                  </button>
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCameraOpen(true)}
                    disabled={photoBusy}
                    className="flex-1 rounded-md border border-neutral-700 px-2 py-1.5 text-center text-xs text-neutral-300 hover:bg-black disabled:opacity-50"
                  >
                    📷 Camera
                  </button>
                  <label className="flex-1 cursor-pointer rounded-md border border-neutral-700 px-2 py-1.5 text-center text-xs text-neutral-300 hover:bg-black">
                    {photoBusy ? "Uploading…" : "🖼️ File"}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={photoBusy}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handlePhotoFile(file);
                        e.target.value = "";
                      }}
                      className="sr-only"
                    />
                  </label>
                </div>
              )}
            </div>
          )}

          <label className="flex items-center gap-2 rounded-md border border-red-900 bg-red-950/60 px-2.5 py-2 text-sm text-neutral-200">
            <input type="checkbox" checked={isOffer} onChange={(e) => setIsOffer(e.target.checked)} className="accent-red-600" />
            This is additional repair work requiring customer approval
          </label>

          {isOffer && (
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-400">Repair Cost (Rs.)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-32 rounded-md border border-neutral-700 px-2 py-1.5 text-sm focus:border-red-600 focus:outline-none"
              />
            </div>
          )}

          {formError && <div className="text-xs text-red-600">{formError}</div>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={confirmMarking}
              disabled={photoBusy}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {editingIndex === null ? "Add Marker" : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={cancelForm}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-black"
            >
              Cancel
            </button>
          </div>

          {cameraOpen && (
            <CameraCaptureModal
              onClose={() => setCameraOpen(false)}
              onCapture={(file) => {
                setCameraOpen(false);
                handlePhotoFile(file);
              }}
            />
          )}
        </div>
      )}

      {markings.length > 0 && (
        <ul className="mt-3 space-y-2">
          {markings.map((m, idx) => {
            const severity = m.severity ?? "MINOR";
            return (
            <li key={m.id ?? idx} className="rounded-lg border border-neutral-800 bg-neutral-900 p-2.5">
              <div className="flex gap-2.5">
                {m.photoUrl && (
                  <a href={`${API_URL}${m.photoUrl}`} target="_blank" rel="noreferrer" className="shrink-0">
                    <img
                      src={`${API_URL}${m.photoUrl}`}
                      alt="Damage close-up"
                      className="h-12 w-12 rounded-md border border-neutral-800 object-cover"
                    />
                  </a>
                )}
                <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-red-300">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-950 text-[10px] font-bold text-red-300">
                    {idx + 1}
                  </span>
                  {m.damageType?.name ?? "Damage"}
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold text-white"
                    style={{ backgroundColor: SEVERITY_META[severity].color }}
                  >
                    {SEVERITY_META[severity].label}
                  </span>
                </span>
                {editable && (onEditMarking || onRemoveMarking) ? (
                  <span className="flex shrink-0 gap-2 text-[11px]">
                    {onEditMarking && (
                      <button type="button" onClick={() => startEdit(idx)} className="text-neutral-300 hover:text-white hover:underline">
                        Edit
                      </button>
                    )}
                    {onRemoveMarking && (
                      <button
                        type="button"
                        onClick={() => {
                          if (editingIndex === idx) cancelForm();
                          else if (editingIndex !== null && editingIndex > idx) setEditingIndex(editingIndex - 1);
                          onRemoveMarking(idx);
                        }}
                        className="text-red-400 hover:text-red-300 hover:underline"
                      >
                        ✕ Remove
                      </button>
                    )}
                  </span>
                ) : (
                  m.createdAt && <span className="text-[10px] text-neutral-500">{new Date(m.createdAt).toLocaleDateString()}</span>
                )}
              </div>

              {m.note && <div className="mt-0.5 text-xs italic text-neutral-400">"{m.note}"</div>}
              {m.isAdditionalRepairOffer && m.suggestedPrice != null && (
                <div className="mt-0.5 text-xs text-neutral-500">Suggested repair cost: {formatMoney(m.suggestedPrice)}</div>
              )}

              {m.isAdditionalRepairOffer && (
                <div className="mt-1.5">
                  {m.approvalStatus === "APPROVED" ? (
                    <span className="flex items-center gap-1.5">
                      <span className="rounded-full bg-red-950 px-2 py-0.5 text-xs font-medium text-red-400">Approved</span>
                      {onReset && (
                        <button
                          type="button"
                          disabled={resettingId === m.id}
                          onClick={() => onReset(m.id)}
                          className="text-xs text-neutral-500 hover:text-neutral-300 hover:underline disabled:opacity-50"
                        >
                          Reset
                        </button>
                      )}
                    </span>
                  ) : m.approvalStatus === "DECLINED" ? (
                    <span className="flex items-center gap-1.5">
                      <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs font-medium text-neutral-400">Declined</span>
                      {onReset && (
                        <button
                          type="button"
                          disabled={resettingId === m.id}
                          onClick={() => onReset(m.id)}
                          className="text-xs text-neutral-500 hover:text-neutral-300 hover:underline disabled:opacity-50"
                        >
                          Reset
                        </button>
                      )}
                    </span>
                  ) : onDecide ? (
                    <span className="flex gap-1">
                      <button
                        type="button"
                        disabled={decidingId === m.id}
                        onClick={() => onDecide(m.id, true)}
                        className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        Yes, repair this ({formatMoney(m.suggestedPrice)})
                      </button>
                      <button
                        type="button"
                        disabled={decidingId === m.id}
                        onClick={() => onDecide(m.id, false)}
                        className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-black disabled:opacity-50"
                      >
                        No, skip this
                      </button>
                    </span>
                  ) : (
                    <span className="rounded-full bg-red-950 px-2 py-0.5 text-xs font-medium text-red-300">Pending customer decision</span>
                  )}
                </div>
              )}
                </div>
              </div>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
