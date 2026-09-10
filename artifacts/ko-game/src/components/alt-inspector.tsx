import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  getCardDefinition,
  type CardInstance,
  type ChampionState,
} from '@/game';
import { CardRenderer } from './card-renderer';

interface InspectTarget {
  content: ReactNode;
  rect: DOMRect;
  showOnHover: boolean;
}

interface AltInspectContextValue {
  isAltPressed: boolean;
  inspect: (target: InspectTarget) => void;
  clear: () => void;
}

const AltInspectContext = createContext<AltInspectContextValue | null>(null);

const KEYWORD_DESCRIPTIONS: Record<string, string> = {
  RUSH: '등장한 턴에도 선수 또는 상대 챔피언을 공격할 수 있습니다.',
  SURPRISE: '등장한 턴에도 상대 선수 카드를 공격할 수 있습니다.',
  TAUNT: '상대는 가능한 경우 이 선수를 먼저 공격해야 합니다.',
  DODGE: '처음 받는 피해 1회를 완전히 무효화합니다.',
  STUN: '기절한 동안 공격할 수 없습니다.',
  MULTI_STRIKE: '한 턴에 두 번 공격할 수 있습니다.',
  SILENCE: '카드의 키워드와 능력을 비활성화합니다.',
};

const KEYWORD_LABELS: Record<string, string> = {
  RUSH: '러쉬',
  SURPRISE: '기습',
  TAUNT: '도발',
  DODGE: '회피',
  STUN: '기절',
  MULTI_STRIKE: '연타',
  SILENCE: '침묵',
};

export function AltInspectProvider({ children }: { children: ReactNode }) {
  const [isAltPressed, setIsAltPressed] = useState(false);
  const [target, setTarget] = useState<InspectTarget | null>(null);

  useEffect(() => {
    const releaseAlt = () => setIsAltPressed(false);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Alt') setIsAltPressed(true);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Alt') releaseAlt();
    };
    const handleVisibility = () => {
      if (document.hidden) releaseAlt();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', releaseAlt);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', releaseAlt);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const clear = useCallback(() => setTarget(null), []);
  const value = useMemo(
    () => ({ isAltPressed, inspect: setTarget, clear }),
    [clear, isAltPressed],
  );
  const isVisible = target && (isAltPressed || target.showOnHover);
  const panelWidth = 280;
  const left = target
    ? target.rect.right + panelWidth + 16 <= window.innerWidth
      ? target.rect.right + 10
      : Math.max(10, target.rect.left - panelWidth - 10)
    : 0;
  const top = target
    ? Math.min(Math.max(10, target.rect.top), Math.max(10, window.innerHeight - 360))
    : 0;

  return (
    <AltInspectContext.Provider value={value}>
      {children}
      {isVisible && (
        <aside
          aria-label="상세정보"
          className="pointer-events-none fixed z-[200] w-[280px] rounded-md border border-neutral-600 bg-neutral-950/95 p-4 text-neutral-100 shadow-2xl backdrop-blur-md"
          style={{ left, top, maxHeight: 'calc(100dvh - 20px)', overflowY: 'auto' }}
        >
          {target.content}
        </aside>
      )}
    </AltInspectContext.Provider>
  );
}

export function Inspectable({
  children,
  content,
  showOnHover = false,
  className,
}: {
  children: ReactNode;
  content: ReactNode;
  showOnHover?: boolean;
  className?: string;
}) {
  const context = useContext(AltInspectContext);
  if (!context) return <>{children}</>;

  const inspect = (element: HTMLElement) =>
    context.inspect({
      content,
      rect: element.getBoundingClientRect(),
      showOnHover,
    });

  return (
    <div
      className={className}
      onMouseEnter={(event) => inspect(event.currentTarget)}
      onMouseLeave={context.clear}
      onFocus={(event) => inspect(event.currentTarget)}
      onBlur={context.clear}
    >
      {children}
    </div>
  );
}

export function CardInspectContent({ card }: { card: CardInstance }) {
  const definition = getCardDefinition(card.definitionId);
  const keywords = card.keywords;
  return (
    <div>
      <div className="mb-1 text-[10px] font-bold tracking-widest text-blue-300">
        {card.isChampionToken ? '챔피언 토큰' : card.isToken ? '토큰 선수' : '선수 카드'}
      </div>
      <h3 className="mb-3 text-lg font-black text-white">
        {definition?.name ?? '알 수 없는 카드'}
      </h3>
      <CardRenderer
        name={definition?.name ?? '알 수 없는 카드'}
        cost={card.currentCost}
        attack={card.currentAttack}
        health={card.currentHealth}
        rulesText={definition?.rulesText ?? '효과 없음'}
        imageUrl={definition?.imageUrl}
        rarity={definition?.rarity}
        size="detail"
        className="mb-3 w-full"
        imageDisplaySettings={definition}
      />
      {(card.currentCost !== definition?.cost ||
        card.currentAttack !== definition?.attack ||
        card.currentHealth !== definition?.health) && (
        <div className="mb-3 text-[10px] text-neutral-500">
          기본 수치: {definition?.cost ?? 0}G / 공격 {definition?.attack ?? 0} / 체력 {definition?.health ?? 0}
        </div>
      )}
      {keywords.length > 0 && (
        <div className="space-y-2">
          {keywords.map((keyword) => (
            <div key={keyword}>
              <div className="text-xs font-bold text-amber-300">
                {KEYWORD_LABELS[keyword] ?? keyword}
              </div>
              <div className="text-[10px] leading-relaxed text-neutral-400">
                {KEYWORD_DESCRIPTIONS[keyword] ?? '특수 키워드입니다.'}
              </div>
            </div>
          ))}
        </div>
      )}
      {card.isSilenced && <div className="mt-3 text-xs font-bold text-purple-300">침묵 상태</div>}
      {card.isStunned && <div className="mt-1 text-xs font-bold text-yellow-300">기절 상태</div>}
    </div>
  );
}

function rewardText(champion: ChampionState): string {
  const reward = champion.quest?.reward;
  if (!reward) return '보상 없음';
  return reward.type === 'UPGRADE_ABILITY'
    ? '챔피언 고유 능력을 강화합니다.'
    : `다음 턴 골드 ${reward.amount}를 얻습니다.`;
}

export function ChampionAbilityInspectContent({
  champion,
  available,
  unavailableReason,
}: {
  champion: ChampionState;
  available: boolean;
  unavailableReason: string;
}) {
  const ability =
    champion.questCompleted && champion.upgradedAbility
      ? champion.upgradedAbility
      : champion.ability;
  return (
    <div>
      <div className="text-[10px] font-bold tracking-widest text-blue-300">챔피언 고유 능력</div>
      <h3 className="mt-1 text-lg font-black">{ability.name}</h3>
      <div className="my-3 font-display text-base font-bold text-primary">비용 {champion.abilityCost}G</div>
      <p className="text-xs leading-relaxed text-neutral-300">{ability.description}</p>
      <div className={`mt-3 text-xs font-bold ${available ? 'text-emerald-300' : 'text-red-300'}`}>
        {available ? '현재 사용할 수 있습니다.' : unavailableReason}
      </div>
    </div>
  );
}

export function ChampionQuestInspectContent({ champion }: { champion: ChampionState }) {
  const quest = champion.quest;
  if (!quest) return <div className="text-sm text-neutral-400">진행 중인 퀘스트가 없습니다.</div>;
  return (
    <div>
      <div className="text-[10px] font-bold tracking-widest text-purple-300">챔피언 퀘스트</div>
      <h3 className="mt-1 text-lg font-black">{quest.name}</h3>
      <div className="mt-3 text-[10px] font-bold text-neutral-500">조건</div>
      <p className="text-xs leading-relaxed text-neutral-300">{quest.description}</p>
      <div className="mt-3 text-[10px] font-bold text-neutral-500">진행</div>
      <div className="font-display text-base font-black text-white">
        {champion.questCompleted
          ? '완료됨'
          : `${champion.questProgress} / ${quest.requiredProgress}`}
      </div>
      <div className="mt-3 text-[10px] font-bold text-neutral-500">완료 보상</div>
      <p className="text-xs leading-relaxed text-neutral-300">{rewardText(champion)}</p>
    </div>
  );
}