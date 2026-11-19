import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";

export async function clockIn(userId: string) {
  const open = await prisma.attendanceRecord.findFirst({ where: { userId, clockOut: null } });
  if (open) throw new AppError(400, "Already clocked in — clock out first");
  return prisma.attendanceRecord.create({ data: { userId, clockIn: new Date() } });
}

export async function clockOut(userId: string) {
  const open = await prisma.attendanceRecord.findFirst({
    where: { userId, clockOut: null },
    orderBy: { clockIn: "desc" },
  });
  if (!open) throw new AppError(400, "Not currently clocked in");
  return prisma.attendanceRecord.update({ where: { id: open.id }, data: { clockOut: new Date() } });
}

/**
 * Attendance kiosk punch: a shared device (logged in by a manager) where
 * each staff member types their 4-digit employee code. Deactivated or
 * unknown codes get the same message so the kiosk doesn't reveal which
 * codes exist.
 */
export async function kioskPunch(code: string, action: "in" | "out") {
  const user = await prisma.user.findUnique({ where: { employeeCode: code } });
  if (!user || !user.active) throw new AppError(404, "Code not recognised — check your employee code");
  const record = action === "in" ? await clockIn(user.id) : await clockOut(user.id);
  return { name: user.name, action, record };
}

export async function listOwn(userId: string) {
  return prisma.attendanceRecord.findMany({
    where: { userId },
    orderBy: { clockIn: "desc" },
    take: 200,
  });
}

/** Admin/manager overview across every staff member. */
export async function listAll() {
  return prisma.attendanceRecord.findMany({
    orderBy: { clockIn: "desc" },
    take: 300,
    include: { user: { select: { id: true, name: true, role: true, shiftStart: true } } },
  });
}

// ── Admin/manager corrections (missed clock-out, forgotten clock-in) ──
export async function addRecord(userId: string, clockIn: Date, clockOut: Date | null) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "Staff member not found");
  return prisma.attendanceRecord.create({ data: { userId, clockIn, clockOut } });
}

export async function updateRecord(id: string, clockIn: Date, clockOut: Date | null) {
  const rec = await prisma.attendanceRecord.findUnique({ where: { id } });
  if (!rec) throw new AppError(404, "Attendance record not found");
  return prisma.attendanceRecord.update({ where: { id }, data: { clockIn, clockOut } });
}

export async function deleteRecord(id: string) {
  const rec = await prisma.attendanceRecord.findUnique({ where: { id } });
  if (!rec) throw new AppError(404, "Attendance record not found");
  await prisma.attendanceRecord.delete({ where: { id } });
}
