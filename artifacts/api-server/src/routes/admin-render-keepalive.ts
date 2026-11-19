import { pool } from '@workspace/db';
import { Router, type IRouter } from 'express';
import { getAuthenticatedUser } from '../lib/auth';
import { configureKeepalive, keepaliveStatus } from '../lib/render-keepalive';

const router: IRouter = Router();
router.use(async (request, response, next) => {
  response.setHeader('Cache-Control', 'no-store');
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) { response.status(401).json({ message: '로그인이 필요합니다.' }); return; }
    if (user.role !== 'ADMIN') { response.status(403).json({ message: '관리자만 접근할 수 있습니다.' }); return; }
    next();
  } catch (error) { next(error); }
});
router.get('/', async (_request, response, next) => {
  try { response.json(await keepaliveStatus(pool)); } catch (error) { next(error); }
});
router.post('/', async (request, response) => {
  if (!request.body || typeof request.body.enabled !== 'boolean' ||
      Object.keys(request.body).some(key => key !== 'enabled')) {
    response.status(400).json({ message: 'enabled 설정만 허용합니다.' }); return;
  }
  const connection = await pool.connect();
  try {
    await configureKeepalive(connection, request.body.enabled);
    response.json(await keepaliveStatus(connection));
  } catch (error) {
    console.warn('[KO keepalive] configuration failed', (error as { code?: string }).code ?? 'unavailable');
    response.status(503).json({ message: 'DB 예약 호출을 설정하지 못했습니다. 기존 게임 데이터는 변경하지 않았습니다.' });
  } finally { connection.release(); }
});
export default router;
