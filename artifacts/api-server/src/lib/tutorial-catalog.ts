import records from '../../../ko-game/public/tutorial-catalog.json' with {type:'json'};
import {tutorialCatalog,cardRecordToDefinition,championRecordToDefinition} from '@workspace/game-engine';
type Cards=Parameters<typeof cardRecordToDefinition>[0][];
type Champions=Parameters<typeof championRecordToDefinition>[0][];
const raw=records as unknown as {cards:Cards;champions:Champions};
export const rewardTutorialCatalog={...tutorialCatalog(raw.cards.map(cardRecordToDefinition),raw.champions.map(championRecordToDefinition)),practiceSource:'PINNED' as const};
