import { Router, type Request, type Response } from "express";
import { authenticate, requireStaff } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { validateBody } from "../middleware/validate";
import { leaveCreateSchema, leaveDecisionSchema } from "../utils/schemas";
import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";
import { leaveDays } from "../services/staffService";

/**
 * Staff leave. Anyone can request leave for themselves (it starts
 * PENDING); ADMIN/MANAGER see everyone's, can record leave for any staff
 * member (optionally approved straight away) and approve/reject requests.
 * Approved leave feeds the attendance calendar and payroll.
 */
const router = Router();
router.use(authenticate, requireStaff);

const isManager = (req: Request) => req.user?.type === "staff" && ["ADMIN", "MANAGER"].includes(req.user.role);
const include = { user: { select: { id: true, name: true, role: true } }, decidedBy: { select: { name: true } } };

router.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const status = typeof req.query.status === "string" ? (req.query.status as "PENDING" | "APPROVED" | "REJECTED") : undefined;
    const userId = isManager(req) ? (typeof req.query.userId === "string" ? req.query.userId : undefined) : req.user!.sub;
    const leaves = await prisma.staffLeave.findMany({
      where: { ...(status ? { status } : {}), ...(userId ? { userId } : {}) },
      orderBy: [{ status: "asc" }, { startDate: "desc" }],
      take: 200,
      include,
    });
    res.json(leaves.map((l) => ({ ...l, days: leaveDays(l.startDate, l.endDate) })));
  })
);

router.post(
  "/",
  validateBody(leaveCreateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { userId?: string; type: "ANNUAL" | "CASUAL" | "SICK" | "UNPAID"; startDate: string; endDate: string; reason?: string; approve?: boolean };
    const forOther = body.userId && body.userId !== req.user!.sub;
    if (forOther && !isManager(req)) throw new AppError(403, "You can only request leave for yourself");
    const userId = body.userId ?? req.user!.sub;
    const approve = !!body.approve && isManager(req);
    const leave = await prisma.staffLeave.create({
      data: {
        userId,
        type: body.type,
        startDate: new Date(`${body.startDate}T00:00:00Z`),
        endDate: new Date(`${body.endDate}T00:00:00Z`),
        reason: body.reason || null,
        status: approve ? "APPROVED" : "PENDING",
        decidedById: approve ? req.user!.sub : null,
        decidedAt: approve ? new Date() : null,
      },
      include,
    });
    res.status(201).json({ ...leave, days: leaveDays(leave.startDate, leave.endDate) });
  })
);

router.patch(
  "/:id/decide",
  validateBody(leaveDecisionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    if (!isManager(req)) throw new AppError(403, "Only an admin or manager can approve leave");
    const leave = await prisma.staffLeave.findUnique({ where: { id: req.params.id } });
    if (!leave) throw new AppError(404, "Leave not found");
    const updated = await prisma.staffLeave.update({
      where: { id: req.params.id },
      data: { status: req.body.status, decidedById: req.user!.sub, decidedAt: new Date() },
      include,
    });
    res.json({ ...updated, days: leaveDays(updated.startDate, updated.endDate) });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const leave = await prisma.staffLeave.findUnique({ where: { id: req.params.id } });
    if (!leave) throw new AppError(404, "Leave not found");
    const own = leave.userId === req.user!.sub && leave.status === "PENDING";
    if (!own && !isManager(req)) throw new AppError(403, "You can only cancel your own pending requests");
    await prisma.staffLeave.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);

export default router;
