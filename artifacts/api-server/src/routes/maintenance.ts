import {Router} from 'express';
import {db} from '@workspace/db';
import {sql} from 'drizzle-orm';
import {getAuthenticatedUser} from '../lib/auth';
import {readMaintenance,maintenanceAllows} from '../lib/maintenance';
const router=Router();
router.get('/server-status',async(req,res,next)=>{try{
 res.setHeader('Cache-Control','no-store');const settings=await readMaintenance();
 const user=settings.enabled?await getAuthenticatedUser(req):null;
 res.json({...settings,allowed:maintenanceAllows(settings.enabled,user?.role)});
}catch(e){next(e);}});
router.get('/admin/server-maintenance',async(req,res,next)=>{try{
 const user=await getAuthenticatedUser(req);if(user?.role!=='ADMIN'){res.status(user?403:401).json({message:'관리자 권한이 필요합니다.'});return;}
 res.setHeader('Cache-Control','no-store');res.json(await readMaintenance());
}catch(e){next(e);}});
router.put('/admin/server-maintenance',async(req,res,next)=>{try{
 const user=await getAuthenticatedUser(req);if(user?.role!=='ADMIN'){res.status(user?403:401).json({message:'관리자 권한이 필요합니다.'});return;}
 if(typeof req.body?.enabled!=='boolean'||typeof req.body?.message!=='string'||!req.body.message.trim()||req.body.message.length>300){res.status(400).json({message:'점검 상태와 안내문(1~300자)을 확인해 주세요.'});return;}
 await db.execute(sql`UPDATE ko_server_settings SET maintenance_enabled=${req.body.enabled},maintenance_message=${req.body.message.trim()},updated_at=now() WHERE id='server'`);
 res.json(await readMaintenance());
}catch(e){next(e);}});
export default router;
