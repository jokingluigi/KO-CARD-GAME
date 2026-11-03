import {getPackDetails} from '../lib/pack-details';
import {Router,type IRouter} from 'express';
import {eq} from 'drizzle-orm';
import {db,rewardSettingsTable} from '@workspace/db';
import {getAuthenticatedUser} from '../lib/auth';
import {rewardTutorialCatalog} from '../lib/tutorial-catalog';
import {replayTutorial} from '../lib/tutorial-replay';
import {tutorialPackConfig,tutorialRewardStatus,claimTutorialReward,guaranteedChampionPack,ensureTutorialChampionPack} from '../lib/tutorial-rewards';
const router:IRouter=Router();
router.get('/availability',async(_req,res)=>{const c=await tutorialPackConfig();res.setHeader('Cache-Control','no-store');res.json({ready:Boolean(c.normal&&c.champion),normalPack:c.normal?.name??null,championPack:c.champion?.name??null,lessonQuantity:3,allQuantity:1});});
router.get('/catalog',(_req,res)=>{res.setHeader('Cache-Control','no-store');res.json({catalog:rewardTutorialCatalog});});
router.use(async(req,res,next)=>{try{const user=await getAuthenticatedUser(req);if(!user){res.status(401).json({message:'튜토리얼 보상은 로그인 후 받을 수 있어요.'});return;}req.authUser=user;res.setHeader('Cache-Control','no-store');next();}catch(e){next(e);}});
router.get('/status',async(req,res)=>{res.json(await tutorialRewardStatus(req.authUser!.id));});
router.post('/claim',async(req,res)=>{
 try{const proof=replayTutorial(req.body,rewardTutorialCatalog);res.json(await claimTutorialReward(req.authUser!.id,proof.lessonId));}
 catch(error){req.log?.warn({err:error},'tutorial reward claim rejected');res.status(422).json({message:error instanceof Error&&/실습|튜토리얼|보상 팩/.test(error.message)?error.message:'보상 결과를 확인하지 못했어요. 다시 확인해 주세요.'});}
});
router.get('/admin-config',async(req,res)=>{if(req.authUser!.role!=='ADMIN'){res.sendStatus(403);return;}const c=await tutorialPackConfig();res.json({normalPackId:c.normal?.id??'',championPackId:c.champion?.id??'',packs:c.packs.map(p=>({id:p.id,name:p.name,normalEligible:p.normalRate>0,championEligible:guaranteedChampionPack(p)}))});});
router.patch('/admin-config',async(req,res)=>{
 if(req.authUser!.role!=='ADMIN'){res.sendStatus(403);return;}
 const c=await tutorialPackConfig(),normal=c.packs.find(p=>p.id===req.body?.normalPackId&&p.normalRate>0),champion=c.packs.find(p=>p.id===req.body?.championPackId&&guaranteedChampionPack(p));
 if(!normal||!champion||!(await getPackDetails(normal)).valid||!(await getPackDetails(champion)).valid){res.status(400).json({message:'공개된 노멀팩과 챔피언만 나오는 확정 팩을 선택해 주세요.'});return;}
 await db.transaction(async tx=>{if(c.provisionChampion&&champion.id===c.champion?.id)await ensureTutorialChampionPack(champion,tx);for(const [key,id,amount] of [['TUTORIAL_LESSON_PACK',normal.id,3],['TUTORIAL_ALL_PACK',champion.id,1]] as const)await tx.insert(rewardSettingsTable).values({key,rewardType:'PACK',rewardTargetId:id,amount,enabled:true}).onConflictDoUpdate({target:rewardSettingsTable.key,set:{rewardType:'PACK',rewardTargetId:id,amount,enabled:true,updatedAt:new Date()}});});
 res.json({saved:true});
});
export default router;
