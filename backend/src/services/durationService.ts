/**
 * How long a job takes — one place, used by booking creation, slot
 * availability, the day calendar and the job card.
 *
 *   services            → each service's own time (Service catalog)
 *   packages            → the package's own time if set, otherwise its
 *                         services added up
 *   damage repairs      → each repair offer marked on the pre-service
 *                         inspection adds its damage type's repair time,
 *                         while it's waiting for the customer (PENDING —
 *                         keeps the bay reserved) or accepted (APPROVED).
 *                         Declined offers and plain "already damaged"
 *                         notes add nothing.
 */
export const DEFAULT_JOB_MINUTES = 60;

type PackageLike = { durationMinutes: number | null; services: { service: { durationMinutes: number } }[] };
type ItemLike = { service: { durationMinutes: number } | null; package: PackageLike | null };
type MarkingLike = { isAdditionalRepairOffer: boolean; approvalStatus: string; damageType: { repairMinutes: number } | null };
type JobCardLike = { damageInspections?: { stage: string; markings: MarkingLike[] }[] } | null | undefined;

export function packageMinutes(pkg: PackageLike): number {
  return pkg.durationMinutes ?? pkg.services.reduce((s, p) => s + p.service.durationMinutes, 0);
}

export function itemsMinutes(items: ItemLike[]): number {
  return items.reduce((sum, i) => sum + (i.service ? i.service.durationMinutes : i.package ? packageMinutes(i.package) : DEFAULT_JOB_MINUTES), 0);
}

export function repairMinutes(jobCard: JobCardLike): number {
  return (jobCard?.damageInspections ?? [])
    .filter((d) => d.stage === "PRE_SERVICE")
    .flatMap((d) => d.markings)
    .filter((m) => m.isAdditionalRepairOffer && (m.approvalStatus === "APPROVED" || m.approvalStatus === "PENDING"))
    .reduce((s, m) => s + (m.damageType?.repairMinutes ?? 0), 0);
}

export function bookingMinutes(b: { services: ItemLike[]; jobCard?: JobCardLike }): number {
  return itemsMinutes(b.services) + repairMinutes(b.jobCard) || DEFAULT_JOB_MINUTES;
}

/** Prisma `select` pieces that load exactly what bookingMinutes() needs. */
export const ITEMS_SELECT = {
  service: { select: { durationMinutes: true } },
  package: { select: { durationMinutes: true, services: { select: { service: { select: { durationMinutes: true } } } } } },
} as const;

export const REPAIRS_SELECT = {
  damageInspections: {
    select: {
      stage: true,
      markings: { select: { isAdditionalRepairOffer: true, approvalStatus: true, damageType: { select: { repairMinutes: true } } } },
    },
  },
} as const;
