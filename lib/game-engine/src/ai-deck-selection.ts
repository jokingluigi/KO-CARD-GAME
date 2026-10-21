import {createDeterministicRandom} from '../../../artifacts/ko-game/src/game/random/random';
/** The same pool ordering and seeded choice for manual AI and quick fallback. */
export function selectAIOpponentDeck<T extends {id:string;name:string;displayOrder:number;enabled:boolean;isValid:boolean;championDefinitionId:string|null}>(decks:readonly T[],matchId:string):T|undefined {
  const eligible=decks.filter(d=>d.enabled&&d.isValid&&d.championDefinitionId).sort((a,b)=>a.displayOrder-b.displayOrder||a.name.localeCompare(b.name,'ko')||a.id.localeCompare(b.id));
  return eligible[Math.floor(createDeterministicRandom(matchId)()*eligible.length)];
}
