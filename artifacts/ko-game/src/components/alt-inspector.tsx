import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
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
  anchor: HTMLElement;
  rect: DOMRect;
  showOnHover: boolean;
  showOnTouch: boolean;
}

interface AltInspectContextValue {
  isAltPressed: boolean;
  inspect: (target: InspectTarget) => void;
  inspectTouch: (target: InspectTarget) => void;
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

export function calculateInspectorPosition(
  anchorRect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
  panelRect: Pick<DOMRect, 'width' | 'height'>,
  viewportWidth: number,
  viewportHeight: number,
): { left: number; top: number } {
  const margin = 12;
  const gap = 10;
  const panelWidth = Math.min(panelRect.width, viewportWidth - margin * 2);
  const panelHeight = Math.min(panelRect.height, viewportHeight - margin * 2);
  const roomBelow = viewportHeight - anchorRect.bottom - gap;
  const roomAbove = anchorRect.top - gap;
  const preferredTop =
    roomBelow >= panelHeight || roomBelow >= roomAbove
      ? anchorRect.bottom + gap
      : anchorRect.top - panelHeight - gap;
  const preferredLeft =
    anchorRect.right + gap + panelWidth <= viewportWidth - margin
      ? anchorRect.right + gap
      : anchorRect.left - panelWidth - gap;
  const maxTop = Math.max(margin, viewportHeight - panelHeight - margin);
  const maxLeft = Math.max(margin, viewportWidth - panelWidth - margin);

  return {
    left: Math.min(Math.max(margin, preferredLeft), maxLeft),
    top: Math.min(Math.max(margin, preferredTop), maxTop),
  };
}

export function AltInspectProvider({ children }: { children: ReactNode }) {
  const [isAltPressed, setIsAltPressed] = useState(false);
  const [target, setTarget] = useState<InspectTarget | null>(null);
  const [isTouchInspecting, setIsTouchInspecting] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const [panelPosition, setPanelPosition] = useState({ left: 8, top: 8 });

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

  const clear = useCallback(() => {
    setTarget(null);
    setIsTouchInspecting(false);
  }, []);
  const inspect = useCallback((nextTarget: InspectTarget) => {
    setTarget(nextTarget);
    setIsTouchInspecting(false);
  }, []);
  const inspectTouch = useCallback((nextTarget: InspectTarget) => {
    setTarget(nextTarget);
    setIsTouchInspecting(true);
  }, []);
  const value = useMemo(
    () => ({ isAltPressed, inspect, inspectTouch, clear }),
    [clear, inspect, inspectTouch, isAltPressed],
  );
  const isVisible = Boolean(
    target && (isAltPressed || target.showOnHover || (target.showOnTouch && isTouchInspecting)),
  );

  const updatePanelPosition = useCallback(() => {
    if (!target || !panelRef.current) return;

    const anchorRect = target.anchor.getBoundingClientRect();
    const panelRect = panelRef.current.getBoundingClientRect();
    setPanelPosition(
      calculateInspectorPosition(
        anchorRect,
        panelRect,
        window.innerWidth,
        window.innerHeight,
      ),
    );
  }, [target]);

  useLayoutEffect(() => {
    if (!isVisible) return;

    const frame = window.requestAnimationFrame(updatePanelPosition);
    const handleViewportChange = () => {
      window.requestAnimationFrame(updatePanelPosition);
    };

    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [isVisible, updatePanelPosition]);

  return (
    <AltInspectContext.Provider value={value}>
      {children}
      {isVisible && (
        <aside
          aria-label="상세정보"
          className="ko-touch-inspector pointer-events-none fixed z-[200] w-[280px] rounded-md border border-neutral-600 bg-neutral-950/95 p-4 text-neutral-100 shadow-2xl backdrop-blur-md"
          ref={panelRef}
          style={{
            left: panelPosition.left,
            top: panelPosition.top,
            maxHeight: 'calc(100dvh - 24px)',
            overflowY: 'auto',
          }}
        >
          <button
            type="button"
            className="ko-touch-inspector-close hidden"
            onClick={clear}
            aria-label="상세정보 닫기"
          >
            닫기
          </button>
          {target?.content}
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
      anchor: element,
      rect: element.getBoundingClientRect(),
      showOnHover,
      showOnTouch: false,
    });
  const inspectTouch = (element: HTMLElement) =>
    context.inspectTouch({
      content,
      anchor: element,
      rect: element.getBoundingClientRect(),
      showOnHover,
      showOnTouch: true,
    });

  return (
    <div
      className={className}
      onMouseEnter={(event) => inspect(event.currentTarget)}
      onMouseLeave={context.clear}
      onFocus={(event) => inspect(event.currentTarget)}
      onBlur={context.clear}
      onPointerUp={(event) => {
        if (event.pointerType === 'touch') inspectTouch(event.currentTarget);
      }}
    >
      {children}
    </div>
  );
}

export function CardInspectContent({ card }: { card: CardInstance }) {
  const definition = getCardDefinition(card.definitionId);
  const keywords = card.keywords;
  const numericChanges = getNumericChanges(card);
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
        cardType={card.cardType}
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
      <div className="mb-3 rounded border border-neutral-800 bg-neutral-900/70 p-2">
        <div className="mb-1 text-[10px] font-black text-neutral-300">수치 변경</div>
        {numericChanges.length === 0 ? (
          <div className="text-[10px] text-neutral-600">변경 없음</div>
        ) : (
          <div className="max-h-32 space-y-1 overflow-y-auto pr-1">
            {numericChanges.map((change, index) => (
              <div key={`${change.stat}-${change.before}-${change.after}-${index}`} className="rounded border border-neutral-800 px-1.5 py-1 text-[9px] text-neutral-400">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-neutral-300">{STAT_LABELS[change.stat]}</span>
                  <span className={change.after >= change.before ? 'text-emerald-300' : 'text-red-300'}>
                    {change.before} → {change.after}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-2 text-[8px] text-neutral-600">
                  <span>{change.delta >= 0 ? '+' : ''}{change.delta}</span>
                  {change.sourceName && <span>출처: {change.sourceName}</span>}
                  {change.turnNumber !== undefined && <span>턴 {change.turnNumber}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
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

export type NumericChangeStat = 'attack' | 'health' | 'maxHealth' | 'currentHealth' | 'cost';

export interface NumericChange {
  stat: NumericChangeStat;
  before: number;
  after: number;
  delta: number;
  sourceDefinitionId?: string;
  sourceName?: string;
  sourceEffectId?: string;
  turnNumber?: number;
}

const STAT_LABELS: Record<NumericChangeStat, string> = {
  attack: '공격력',
  health: '체력',
  maxHealth: '최대 체력',
  currentHealth: '현재 체력',
  cost: '비용',
};

/**
 * Card instances from older snapshots do not have history yet. The generic
 * baseline rows still make every persisted stat change visible; newer
 * snapshots may provide statHistory entries with effect/source attribution.
 */
export function getNumericChanges(card: CardInstance): NumericChange[] {
  const definition = getCardDefinition(card.definitionId);
  const baseline = {
    attack: card.baseAttack ?? definition?.attack ?? card.currentAttack,
    health: card.baseHealth ?? definition?.health ?? card.maxHealth,
    maxHealth: card.baseHealth ?? definition?.health ?? card.maxHealth,
    cost: card.baseCost ?? definition?.cost ?? card.currentCost,
  };
  const history = (card as CardInstance & { statHistory?: NumericChange[] }).statHistory ?? [];
  const changes = history.filter((entry) => entry.before !== entry.after);
  const has = new Set(changes.map((entry) => entry.stat));
  const inferred: NumericChange[] = [];
  const add = (stat: NumericChangeStat, before: number, after: number, sourceName = '기본 수치') => {
    if (before !== after && !has.has(stat)) {
      inferred.push({
        stat,
        before,
        after,
        delta: after - before,
        sourceDefinitionId: definition?.id,
        sourceName,
      });
    }
  };
  add('cost', baseline.cost, card.currentCost);
  add('attack', baseline.attack, card.currentAttack);
  add('maxHealth', baseline.maxHealth, card.maxHealth);
  if (card.currentHealth === card.maxHealth) {
    add('health', baseline.health, card.currentHealth);
  }
  if (card.currentHealth !== card.maxHealth && !has.has('currentHealth')) {
    inferred.push({
      stat: 'currentHealth',
      before: card.maxHealth,
      after: card.currentHealth,
      delta: card.currentHealth - card.maxHealth,
      sourceName: '피해/회복',
    });
  }
  return [...changes, ...inferred].sort((left, right) => (right.turnNumber ?? -1) - (left.turnNumber ?? -1));
}

function rewardText(champion: ChampionState): string {
  const reward = champion.quest?.reward;
  if (!reward) return '보상 없음';
  return reward.type === 'UPGRADE_ABILITY'
    ? '챔피언 고유 능력을 강화합니다.'
    : reward.type === 'GAIN_GOLD'
      ? `다음 턴 골드 ${reward.amount}를 얻습니다.`
      : '연결된 Champion Token을 직접 전개합니다.';
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