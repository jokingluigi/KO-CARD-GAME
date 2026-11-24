import { generateCardInstance } from '../cards/generation';
import { MAX_HAND_SIZE } from '../rules/constants';
import type { Board, GameState } from '../types/game-state';

/** 보스전 대화 한 줄 (RPG 대화창). */
export interface BossDialogueLine {
  /** 보스 혼자 말한다 (내 챔피언은 무엇이 나올지 몰라 대사가 없다). */
  speaker: 'BOSS' | 'NARRATOR';
  /** 전투 스프라이트 표정 이름 (없으면 기본). */
  expression?: string | null;
  text: string;
  effect?: 'SHAKE' | 'FLASH' | null;
}

/** 보스 페이즈. 첫 페이즈는 시작 상태, 이후 페이즈는 보스 체력이 0이 될 때 이어진다. */
export interface BossPhase {
  name: string;
  /** 이 페이즈 시작 체력. */
  health: number;
  /** 이 페이즈 보스 그림 (비우면 그대로). */
  portraitUrl?: string | null;
  /** 페이즈 시작 때 보스 손패에 넣을 카드 ID. */
  addToHand?: string[];
  /** 페이즈 시작 때 보스 덱 맨 위에 넣을 카드 ID. */
  addToDeck?: string[];
  /** 보스 쪽 필드를 비운다. */
  clearBoard?: boolean;
  /** 이 페이즈 동안 보스 턴마다 추가 골드. */
  goldPerTurn?: number;
  /** 페이즈 시작 대사. */
  dialogue?: BossDialogueLine[];
}

export interface BossState {
  bossId: string;
  name: string;
  playerId: string;
  phaseIndex: number;
  phases: BossPhase[];
}

export function currentBossPhase(state: GameState): BossPhase | null {
  const boss = state.boss;
  return boss ? boss.phases[boss.phaseIndex] ?? null : null;
}

function addCards(state: GameState, playerId: string, ids: string[] | undefined, zone: 'hand' | 'deck', tag: string): GameState {
  if (!ids?.length) return state;
  const pool = state.cardPool ?? [];
  return {
    ...state,
    players: state.players.map((player) => {
      if (player.id !== playerId) return player;
      const created = ids.flatMap((id, index) => {
        const definition = pool.find((card) => card.id === id);
        return definition ? [generateCardInstance(definition, { instanceId: `boss-${tag}-${zone}-${index}-${id}`, isGenerated: true })] : [];
      });
      if (zone === 'hand') {
        const room = Math.max(0, MAX_HAND_SIZE - player.hand.length);
        return { ...player, hand: [...player.hand, ...created.slice(0, room)] };
      }
      return { ...player, deck: [...created, ...player.deck] };
    }),
  };
}

/** 보스전 시작 때 한 번: 첫 페이즈 체력·카드, 플레이어 체력 보너스 적용. */
export function applyBossStart(state: GameState, boss: Omit<BossState, 'phaseIndex' | 'playerId'> & { playerHealthBonus?: number }): GameState {
  const bossPlayer = state.players[1];
  const human = state.players[0];
  if (!bossPlayer || !human || !boss.phases.length) return state;
  const first = boss.phases[0]!;
  const bonus = Math.max(0, Math.floor(boss.playerHealthBonus ?? 0));
  let next: GameState = {
    ...state,
    boss: { bossId: boss.bossId, name: boss.name, phases: boss.phases, playerId: bossPlayer.id, phaseIndex: 0 },
    players: state.players.map((player) => player.id === bossPlayer.id
      ? { ...player, health: Math.max(1, first.health), maxHealth: Math.max(1, first.health) }
      : player.id === human.id && bonus
        ? { ...player, health: player.health + bonus, maxHealth: player.maxHealth + bonus }
        : player),
  };
  next = addCards(next, bossPlayer.id, first.addToHand, 'hand', 'p0');
  next = addCards(next, bossPlayer.id, first.addToDeck, 'deck', 'p0');
  return next;
}

/**
 * 보스가 쓰러졌는데 다음 페이즈가 남아 있으면 경기를 끝내지 않고 다음 페이즈로 넘긴다.
 * 같은 행동 기록이면 서버 재현에서도 똑같이 동작한다.
 */
export function applyBossPhaseTransition(before: GameState, after: GameState): GameState {
  const boss = after.boss;
  if (!boss || after.status !== 'FINISHED' || after.loserId !== boss.playerId) return after;
  const nextIndex = boss.phaseIndex + 1;
  const phase = boss.phases[nextIndex];
  if (!phase) return after;
  const health = Math.max(1, phase.health);
  let next: GameState = {
    ...after,
    status: 'IN_PROGRESS',
    winnerId: null,
    loserId: null,
    activePlayerId: before.activePlayerId ?? after.players[0]?.id ?? null,
    boss: { ...boss, phaseIndex: nextIndex },
    players: after.players.map((player) => {
      if (player.id !== boss.playerId) return player;
      const board = phase.clearBoard ? ([null, null, null, null] as Board) : player.board;
      const leaving = phase.clearBoard ? player.board.filter((card): card is NonNullable<typeof card> => Boolean(card)) : [];
      return {
        ...player,
        health,
        maxHealth: health,
        fatigueCount: 0,
        board,
        graveyard: [...player.graveyard, ...leaving],
      };
    }),
  };
  next = addCards(next, boss.playerId, phase.addToHand, 'hand', `p${nextIndex}`);
  next = addCards(next, boss.playerId, phase.addToDeck, 'deck', `p${nextIndex}`);
  return next;
}

/** 보스 턴이 새로 시작되면 현재 페이즈의 추가 골드를 준다. */
export function applyBossTurnGold(before: GameState, after: GameState): GameState {
  const boss = after.boss;
  if (!boss || after.status !== 'IN_PROGRESS') return after;
  if (after.activePlayerId !== boss.playerId || before.activePlayerId === boss.playerId) return after;
  const gold = Math.max(0, Math.floor(boss.phases[boss.phaseIndex]?.goldPerTurn ?? 0));
  if (!gold) return after;
  return { ...after, players: after.players.map((player) => player.id === boss.playerId ? { ...player, currentGold: player.currentGold + gold } : player) };
}

export function applyBossHooks(before: GameState, after: GameState): GameState {
  if (!after.boss) return after;
  return applyBossTurnGold(before, applyBossPhaseTransition(before, after));
}
