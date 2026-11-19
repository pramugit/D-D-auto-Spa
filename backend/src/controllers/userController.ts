import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";
import { currentMonth, getProfile, listStaff, nextEmployeeCode, redact, staffSelect } from "../services/staffService";
import { forgetStaffStatus } from "../middleware/auth";

const publicSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  hourlyRate: true,
  monthlySalary: true,
  createdAt: true,
  active: true,
  employeeCode: true,
};

const isAdmin = (req: Request) => req.user?.type === "staff" && req.user.role === "ADMIN";
const monthParam = (req: Request) => (typeof req.query.month === "string" ? req.query.month : currentMonth());

export async function list(req: Request, res: Response) {
  const users = await prisma.user.findMany({ select: publicSelect, orderBy: { name: "asc" } });
  res.json(users.map((u) => redact(u, isAdmin(req))));
}

/** Staff management overview: everyone with live status + this month's stats. */
export async function overview(req: Request, res: Response) {
  res.json(await listStaff(monthParam(req), isAdmin(req)));
}

/** One staff member: details, attendance calendar, leave, jobs, payroll. */
export async function profile(req: Request, res: Response) {
  res.json(await getProfile(req.params.id, monthParam(req), isAdmin(req)));
}

/**
 * Just id/name/role for TECHNICIAN-role users — the "assign technician"
 * checklist on a job card needs this regardless of whether the caller
 * can see the Staff section (a technician assigning/reassigning their
 * own job, or a receptionist... no, receptionist can't edit Job Board;
 * but ADMIN/MANAGER/TECHNICIAN all can, and none of that maps cleanly
 * onto staff.view=[ADMIN,MANAGER]). Kept separate from the full staff
 * roster endpoint rather than loosening that one's permissions.
 */
export async function listTechnicians(_req: Request, res: Response) {
  const technicians = await prisma.user.findMany({
    where: { role: "TECHNICIAN", active: true },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });
  res.json(technicians);
}

export async function get(req: Request, res: Response) {
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: staffSelect });
  if (!user) throw new AppError(404, "User not found");
  res.json(redact(user, isAdmin(req)));
}

export async function create(req: Request, res: Response) {
  const { password, ...data } = req.body;
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new AppError(409, "A staff account with this email already exists");
  const passwordHash = await bcrypt.hash(password, 10);
  if (!data.employeeCode) data.employeeCode = await nextEmployeeCode();
  else if (await prisma.user.findUnique({ where: { employeeCode: data.employeeCode } })) {
    throw new AppError(409, `Employee code ${data.employeeCode} is already used`);
  }
  const user = await prisma.user.create({
    data: { ...data, passwordHash },
    select: staffSelect,
  });
  res.status(201).json(user);
}

export async function update(req: Request, res: Response) {
  const { password, ...data } = req.body;
  if (data.active === false && req.user?.sub === req.params.id) {
    throw new AppError(400, "You can't deactivate your own account");
  }
  if (data.employeeCode) {
    const clash = await prisma.user.findUnique({ where: { employeeCode: data.employeeCode } });
    if (clash && clash.id !== req.params.id) throw new AppError(409, `Employee code ${data.employeeCode} is already used`);
  }
  const updateData: Record<string, unknown> = { ...data };
  if (password) {
    updateData.passwordHash = await bcrypt.hash(password, 10);
  }
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: updateData,
    select: staffSelect,
  });
  forgetStaffStatus(req.params.id);
  res.json(user);
}

/** Permanent delete — only for accounts with no work history; otherwise deactivate. */
export async function remove(req: Request, res: Response) {
  if (req.user?.sub === req.params.id) throw new AppError(400, "You can't delete your own account");
  const [att, pay, jobs] = await Promise.all([
    prisma.attendanceRecord.count({ where: { userId: req.params.id } }),
    prisma.salaryPayment.count({ where: { userId: req.params.id } }),
    prisma.jobCardTechnician.count({ where: { userId: req.params.id } }),
  ]);
  if (att + pay + jobs > 0) {
    throw new AppError(409, "This staff member has attendance, payroll or job history — deactivate them instead of deleting.");
  }
  await prisma.user.delete({ where: { id: req.params.id } });
  forgetStaffStatus(req.params.id);
  res.status(204).send();
}
