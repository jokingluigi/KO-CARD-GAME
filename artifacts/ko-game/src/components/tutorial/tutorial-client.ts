import { cardRecordToDefinition } from "../../game/cards/published-cards";
import { championRecordToDefinition } from "../../game/champions/published-champions";
import { tutorialCatalog } from "./lesson-engine";
/** Unlike the general match loader, distinguish HTTP failures from an empty catalog. */
export async function fetchTutorialCatalog(signal: AbortSignal) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";
  const [cardResponse, championResponse] = await Promise.all([
    fetch(base + "/cards", { signal }),
    fetch(base + "/champions", { signal }),
  ]);
  if (!cardResponse.ok || !championResponse.ok)
    throw Error("공개 데이터를 불러오지 못했어요.");
  const [cardData, championData] = await Promise.all([
    cardResponse.json(),
    championResponse.json(),
  ]);
  if (!Array.isArray(cardData.cards) || !Array.isArray(championData.champions))
    throw Error("공개 데이터 형식을 확인하지 못했어요.");
  return tutorialCatalog(
    (cardData.cards as Parameters<typeof cardRecordToDefinition>[0][])
      .filter((c) => c.status === "PUBLISHED")
      .map(cardRecordToDefinition),
    (
      championData.champions as Parameters<
        typeof championRecordToDefinition
      >[0][]
    )
      .filter((c) => c.status === "PUBLISHED")
      .map(championRecordToDefinition),
  );
}
