import { Router, type IRouter } from "express";
import { attendanceClaimsTable, attendanceRewardDefinitionsTable, db } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { getAuthenticatedUser } from "../lib/auth";
import { claimAttendance, publicAttendance } from "../lib/attendance-service";

const router: IRouter = Router();

router.use(async (request, response, next) => {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      response.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }
    request.authUser = user;
    next();
  } catch (error) {
    next(error);
  }
});

router.get("/", async (request, response): Promise<void> => {
  const [definitions, claims] = await Promise.all([
    db.select().from(attendanceRewardDefinitionsTable).orderBy(asc(attendanceRewardDefinitionsTable.dayIndex)),
    db.select().from(attendanceClaimsTable)
      .where(eq(attendanceClaimsTable.userId, request.authUser!.id))
      .orderBy(asc(attendanceClaimsTable.dayIndex)),
  ]);
  response.setHeader("Cache-Control", "no-store");
  response.json(publicAttendance(definitions, claims));
});

router.post("/claim", async (request, response): Promise<void> => {
  try {
    const result = await claimAttendance(request.authUser!.id);
    response.json({
      ...result,
      attendance: publicAttendance(
        await db.select().from(attendanceRewardDefinitionsTable).orderBy(asc(attendanceRewardDefinitionsTable.dayIndex)),
        await db.select().from(attendanceClaimsTable)
          .where(eq(attendanceClaimsTable.userId, request.authUser!.id))
          .orderBy(asc(attendanceClaimsTable.dayIndex)),
      ),
    });
  } catch (error) {
    response.status(422).json({ message: error instanceof Error ? error.message : "출석 보상을 받을 수 없습니다." });
  }
});

export default router;