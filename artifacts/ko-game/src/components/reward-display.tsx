import { useState } from "react";
import { Coins, Package, Shield, Layers3 } from "lucide-react";
import type {
  RewardCatalogCard,
  RewardCatalogChampion,
  RewardCatalogPack,
} from "@/lib/rewards-client";
export type RewardCatalogs = {
  cards: RewardCatalogCard[];
  champions: RewardCatalogChampion[];
  packs: RewardCatalogPack[];
};
export type RewardInfo = {
  rewardType: string;
  rewardAmount: number;
  rewardTargetId: string | null;
};
export function RewardDisplay({
  reward,
  catalog,
  large = false,
}: {
  reward: RewardInfo;
  catalog: RewardCatalogs;
  large?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const item =
    reward.rewardType === "CARD"
      ? catalog.cards.find((i) => i.id === reward.rewardTargetId)
      : reward.rewardType === "CHAMPION"
        ? catalog.champions.find((i) => i.id === reward.rewardTargetId)
        : reward.rewardType === "PACK"
          ? catalog.packs.find((i) => i.id === reward.rewardTargetId)
          : undefined;
  const label =
    reward.rewardType === "CURRENCY"
      ? "크레딧"
      : (item?.name ??
        { CARD: "카드 보상", CHAMPION: "챔피언 보상", PACK: "카드팩 보상" }[
          reward.rewardType
        ] ??
        "보상");
  const Icon =
    reward.rewardType === "CURRENCY"
      ? Coins
      : reward.rewardType === "PACK"
        ? Package
        : reward.rewardType === "CHAMPION"
          ? Shield
          : Layers3;
  return (
    <span className={`ko-reward-display ${large ? "is-large" : ""}`}>
      <span className="ko-reward-display__art">
        {item?.imageUrl && item.imageUrl !== failed ? (
          <img
            src={item.imageUrl}
            alt=""
            onError={(e) => {
              setFailed(item.imageUrl);
            }}
          />
        ) : (
          <Icon size={large ? 32 : 20} />
        )}
      </span>
      <span>
        <strong>
          {reward.rewardType === "CURRENCY"
            ? `+${reward.rewardAmount.toLocaleString()}`
            : label}
        </strong>
        <span>
          {reward.rewardType === "CURRENCY"
            ? label
            : `${{ CARD: "카드", CHAMPION: "챔피언", PACK: "팩" }[reward.rewardType] ?? "보상"} ×${reward.rewardAmount}`}
        </span>
      </span>
    </span>
  );
}
