/**
 * Job times — mirrors backend/src/services/durationService.ts so the time a
 * customer or staff member sees while choosing is the time the schedule uses.
 */
type PackageLike = { durationMinutes?: number | null; services: { service: { durationMinutes: number } }[] };

/** A package's own time if set, otherwise its services added up. */
export function packageMinutes(pkg: PackageLike): number {
  return pkg.durationMinutes ?? pkg.services.reduce((s, l) => s + (l.service?.durationMinutes ?? 0), 0);
}

/** The services added up, ignoring any time set on the package. */
export function packageServicesMinutes(pkg: PackageLike): number {
  return pkg.services.reduce((s, l) => s + (l.service?.durationMinutes ?? 0), 0);
}

/** 45 → "45 min", 90 → "1 h 30 min", 120 → "2 h". */
export function formatMinutes(m: number | null | undefined): string {
  if (m == null) return "";
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}
