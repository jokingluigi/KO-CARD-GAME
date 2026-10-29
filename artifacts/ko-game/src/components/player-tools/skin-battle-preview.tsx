import { useState } from "react";
import type { CosmeticItem, CosmeticLoadout } from "@workspace/cosmetics";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { ChampionPortraitFrame } from "../champion-portrait-frame";
import { ChampionBattleActor } from "../champion-battle-actor";
import {
  createInitialGameState,
  generateCardInstance,
  type CardDefinition,
  type GameState,
} from "@/game";
import { WishButton } from "./wishlist";
function SkinBattleContents({ item }: { item: CosmeticItem }) {
  const [self, setSelf] = useState(true),
    [state, setState] = useState<GameState>(() => {
      const s = createInitialGameState();
      s.gameId = "skin-preview-" + item.id;
      s.status = "IN_PROGRESS";
      for (const p of s.players) {
        if (p.champion)
          p.champion = {
            ...p.champion,
            id: item.targetId!,
            name: item.name,
            imageUrl: item.imageAssets.art ?? item.imageAssets.portrait ?? null,
            questCompleted: false,
          };
        p.health = 20;
        p.maxHealth = 20;
      }
      s.events = [];
      return s;
    });
  const id = state.players[self ? 0 : 1].id,
    loadout: CosmeticLoadout = {
      version: 1,
      skins: { ["champion:" + item.targetId]: item },
      cardBack: null,
      emotes: [],
    };
  function react(kind: string) {
    setState((old) => {
      const s = structuredClone(old),
        p = s.players.find((p) => p.id === id)!;
      s.status = "IN_PROGRESS";
      s.winnerId = null;
      s.loserId = null;
      if (kind === "AWAKEN" && p.champion) {
        p.champion.questCompleted = !p.champion.questCompleted;
        s.events.push({
          type: "CHAMPION_QUEST_COMPLETED",
          playerId: id,
          championId: p.champion.id,
        });
      } else if (kind === "LOW") {
        p.health = p.health <= 5 ? 20 : 5;
      } else if (kind === "VICTORY" || kind === "DEFEAT") {
        s.status = "FINISHED";
        s.winnerId =
          kind === "VICTORY" ? id : s.players.find((x) => x.id !== id)!.id;
        s.loserId =
          kind === "DEFEAT" ? id : s.players.find((x) => x.id !== id)!.id;
      } else {
        s.status = "IN_PROGRESS";
        s.winnerId = null;
        s.loserId = null;
        if (kind === "HEAL") {
          const before = p.health;
          p.health = Math.min(20, p.health + 2);
          if (p.health > before)
            p.presentationHealing = {
              sequence: (p.presentationHealing?.sequence ?? 0) + 1,
              total: (p.presentationHealing?.total ?? 0) + p.health - before,
            };
        } else if (kind === "HIT" || kind === "HEAVY") {
          const before = p.health;
          p.health = Math.max(1, p.health - (kind === "HIT" ? 2 : 6));
          const amount = before - p.health;
          s.events.push({
            type: "DAMAGE_DEALT",
            amount,
            target: { type: "PLAYER", playerId: id },
            playerId: id,
          });
        } else if (kind === "SUMMON" || kind === "SURPRISE") {
          // Isolated expression-preview metadata, never registered in the card
          // catalog, saved in a deck or sent to the battle/server.
          const d: CardDefinition = {
            id: "sprite-expression-preview",
            name: "표정 미리보기 전용",
            cardType: "WRESTLER",
            cost: 1,
            attack: 1,
            health: 1,
            rulesText: "",
            rarity: kind === "SURPRISE" ? "LEGENDARY" : "NORMAL",
            keywords: [],
            abilities: [],
            isToken: true,
            isChampionToken: false,
          };
          if (d) {
            s.cardPool = [
              ...(s.cardPool ?? []).filter((x) => x.id !== d.id),
              d,
            ];
            const c = generateCardInstance(d, {
              instanceId: "preview-" + s.events.length,
            });
            if (kind === "SUMMON") {
              p.board[0] = c;
              s.events.push({
                type: "ENTER_FIELD",
                playerId: id,
                cardInstanceId: c.instanceId,
                cardDefinitionId: d.id,
                boardSlot: 0,
              });
            } else {
              p.graveyard.push(c);
              s.events.push({
                type: "CARD_RETIRED",
                boardSlot: 0,
                playerId: id,
                cardInstanceId: c.instanceId,
                cardDefinitionId: d.id,
              });
            }
          }
        } else if (kind === "ATTACK")
          s.events.push({
            type: "CHAMPION_ABILITY_USED",
            playerId: id,
            championId: p.champion?.id,
          });
        else if (kind === "RESET") {
          p.health = 20;
          p.board = [null, null, null, null];
          p.graveyard = [];
          s.events = [];
          s.gameId += "-reset";
        }
      }
      return s;
    });
  }
  return (
    <>
      <DialogTitle>{item.name} 전투 미리보기</DialogTitle>
      <DialogDescription>
        전투에서 보이는 액자와 표정·각성 모습을 확인하세요. 미등록 표정은 이
        스킨의 기본 이미지로 표시됩니다. 각성 세트가 없는 스킨은 외형을
        유지합니다.
      </DialogDescription>
      <WishButton
        item={{
          kind: "skin",
          id: item.id,
          name: item.name,
          image: item.imageAssets.art ?? item.imageAssets.portrait,
        }}
      />
      <button className="min-h-11" onClick={() => setSelf(!self)}>
        {self ? "내 위치" : "상대 위치"} · 위치 바꾸기
      </button>
      <div
        className="ko-champion-arena ko-sprite-frame-preview mx-auto"
        style={{ width: 260, height: 330, position: "relative" }}
      >
        <div className={self ? "ko-player-champion" : "ko-opponent-champion"}>
          <ChampionPortraitFrame
            name={item.name}
            health={state.players[self ? 0 : 1].health}
            maxHealth={20}
            awakened={!!state.players[self ? 0 : 1].champion?.questCompleted}
          />
          <div className="ko-portrait-window">
            {
              <ChampionBattleActor
                key={state.gameId + id}
                state={state}
                playerId={id}
                self={self}
                framed
                loadout={loadout}
                portrait={item.imageAssets.portrait ?? item.imageAssets.art}
                original={item.imageAssets.art}
                name={item.name}
              />
            }
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {[
          ["RESET", "기본"],
          ["ATTACK", "공격·능력"],
          ["HIT", "피격"],
          ["HEAVY", "강한 피격"],
          ["SUMMON", "소환"],
          ["SURPRISE", "놀람"],
          ["LOW", "저체력 전환"],
          ["HEAL", "안도·회복"],
          ["AWAKEN", "각성 전환"],
          ["VICTORY", "승리"],
          ["DEFEAT", "패배"],
        ].map(([k, v]) => (
          <button
            className="min-h-11 border px-2"
            key={k}
            onClick={() => react(k)}
          >
            {v}
          </button>
        ))}
      </div>
      {Object.entries(item.imageAssets)
        .filter(([k]) => k.startsWith("token:"))
        .map(([k, url]) => (
          <figure key={k}>
            <img
              className="h-40 object-contain"
              src={url}
              alt="이 스킨의 전용 토큰"
            />
            <figcaption>연결된 토큰 스킨</figcaption>
          </figure>
        ))}
    </>
  );
}

export function SkinBattlePreview({ item }: { item: CosmeticItem }) {
  const [open, setOpen] = useState(false);
  if (item.type !== "CHAMPION_SKIN") return null;
  return (
    <>
      <button
        className="min-h-11 border border-amber-900 px-3"
        onClick={() => setOpen(true)}
      >
        전투 액자·표정 미리보기
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-auto bg-neutral-950 text-white">
          {open && <SkinBattleContents item={item} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
