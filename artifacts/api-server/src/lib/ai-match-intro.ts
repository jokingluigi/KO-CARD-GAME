import {and,eq} from 'drizzle-orm';
import {db,championIntroInteractionsTable} from '@workspace/db';
import type {ChampionDefinition} from '@workspace/game-engine';
import {canonicalChampionPair,mapIntroToSeats,resolveChampionIntro} from '../online/intro';

/** Use the same published pair and speaker mapping as PvP; one indexed read per opening. */
export async function loadAiMatchIntro(first:ChampionDefinition,second:ChampionDefinition) {
 const pair=canonicalChampionPair(first.id,second.id);
 const relations=pair?await db.select().from(championIntroInteractionsTable).where(and(
  eq(championIntroInteractionsTable.championOneId,pair[0]),
  eq(championIntroInteractionsTable.championTwoId,pair[1]),
  eq(championIntroInteractionsTable.status,'PUBLISHED'),
 )).limit(1):[];
 return mapIntroToSeats(first.id,second.id,resolveChampionIntro(first,second,relations));
}
