import {db} from '@workspace/db';
import {sql} from 'drizzle-orm';
import type {Request,Response,NextFunction} from 'express';
import {getAuthenticatedUser} from './auth';
export const MAINTENANCE_MESSAGE='서버 점검 중입니다. 점검이 끝나면 다시 접속해 주세요.';
export async function readMaintenance(){
 const result=await db.execute(sql`SELECT maintenance_enabled, maintenance_message FROM ko_server_settings WHERE id='server'`);
 const row=result.rows[0];return {enabled:row?.maintenance_enabled===true,message:String(row?.maintenance_message??MAINTENANCE_MESSAGE)};
}
export function maintenanceAllows(enabled:boolean,role?:string){return !enabled||role==='ADMIN';}
export function createMaintenanceGate(read=readMaintenance,authenticate=getAuthenticatedUser){return async(req:Request,res:Response,next:NextFunction)=>{
 try{
  if(['/healthz','/server-status','/auth/me','/auth/login','/auth/logout'].includes(req.path))return next();
  const settings=await read();if(!settings.enabled)return next();
  const user=await authenticate(req);
  if(maintenanceAllows(true,user?.role))return next();
  res.setHeader('Retry-After','30');res.status(503).json({code:'SERVER_MAINTENANCE',message:settings.message});
 }catch(error){next(error);}
};}
export const maintenanceGate=createMaintenanceGate();
