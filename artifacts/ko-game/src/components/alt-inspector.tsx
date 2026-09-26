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
  type CardInstance,
  type ChampionState,
} from '@/game';
import { CardRenderer } from './card-renderer';
import { CardTagExplorerDialog } from './card-tag-explorer-dialog';
import { CardDetailDialog, type CardDetailRecord } from './card-detail-dialog';
import { getActiveCardKeywords } from '../game/cards/granted-text';
import { getCardRuntimeRulesText } from '../lib/card-display-state';
import { shouldPreventAltWheel, shouldToggleAltInfo } from './alt-inspector-keyboard';
import {
  calculateInspectorPosition,
  getCardInspectorMetadata,
  getNumericChanges,
  type NumericChangeStat,
} from './alt-inspector-utils';

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
  toggleTouch: (target: InspectTarget) => void;
  clear: () => void;
  openTagExplorer: (tag: string) => void;
}

const AltInspectContext = createContext<AltInspectContextValue | null>(null);

export function AltInspectProvider({ children }: { children: ReactNode }) {
  const [isAltPressed, setIsAltPressed] = useState(false);
  const [target, setTarget] = useState<InspectTarget | null>(null);
  const [isTouchInspecting, setIsTouchInspecting] = useState(false);
  const [tagExplorer, setTagExplorer] = useState<string | null>(null);
  const [tagDetailCard, setTagDetailCard] = useState<CardDetailRecord | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const pendingAltToggleRef = useRef<number | null>(null);
  const [panelPosition, setPanelPosition] = useState({ left: 8, top: 8 });

  useEffect(() => {
    const clearPendingAltToggle = () => {
      if (pendingAltToggleRef.current !== null) {
        window.clearTimeout(pendingAltToggleRef.current);
        pendingAltToggleRef.current = null;
      }
    };
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return Boolean(
        target.isContentEditable ||
        target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'),
      );
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Alt') {
        if (!shouldToggleAltInfo(event, isEditableTarget(event.target))) return;
        clearPendingAltToggle();
        // Wait one task so a companion shortcut key (for example Alt+Tab) can
        // cancel the toggle before it changes the inspection mode.
        pendingAltToggleRef.current = window.setTimeout(() => {
          pendingAltToggleRef.current = null;
          setIsAltPressed((current) => !current);
        }, 0);
        return;
      }
      // Do not interpret an Alt+key chord as a standalone inspection toggle.
      clearPendingAltToggle();
    };
    const handleVisibility = () => {
      if (document.hidden) clearPendingAltToggle();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('blur', clearPendingAltToggle);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearPendingAltToggle();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('blur', clearPendingAltToggle);
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
  const toggleTouch = useCallback((nextTarget: InspectTarget) => {
    setTarget((current) => {
      if (current?.anchor === nextTarget.anchor && isTouchInspecting) {
        setIsTouchInspecting(false);
        return current;
      }
      setIsTouchInspecting(true);
      return nextTarget;
    });
  }, [isTouchInspecting]);
  const openTagExplorer = useCallback((tag: string) => {
    setTagDetailCard(null);
    setTagExplorer(tag);
  }, []);
  const value = useMemo(
    () => ({ isAltPressed, inspect, toggleTouch, clear, openTagExplorer }),
    [clear, inspect, isAltPressed, openTagExplorer, toggleTouch],
  );
  const isVisible = Boolean(
    target && (isAltPressed || target.showOnHover || (target.showOnTouch && isTouchInspecting)),
  );

  useEffect(() => {
    if (!target) return;
    const preventAltWheelHistory = (event: WheelEvent) => {
      if (shouldPreventAltWheel(event)) event.preventDefault();
    };
    window.addEventListener('wheel', preventAltWheelHistory, { passive: false });
    return () => window.removeEventListener('wheel', preventAltWheelHistory);
  }, [target]);

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
      <div
        className="contents"
        onWheelCapture={(event) => {
          if (target && shouldPreventAltWheel(event)) event.preventDefault();
        }}
      >
        {children}
      </div>
      {isAltPressed && (
        <div
          aria-live="polite"
          className="pointer-events-none fixed right-3 top-3 z-[199] rounded-full border border-amber-500/40 bg-neutral-950/80 px-2.5 py-1 text-[10px] font-bold tracking-wide text-amber-200 shadow-lg backdrop-blur"
          data-testid="status-alt-info-mode"
        >
          ALT 정보: ON
        </div>
      )}
      {isVisible && (
        <aside
          aria-label="상세정보"
          className="ko-touch-inspector pointer-events-none fixed z-[200] w-[min(720px,calc(100vw-24px))] rounded-lg border border-neutral-600 bg-neutral-950/95 p-5 text-neutral-100 shadow-2xl backdrop-blur-md"
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
      <CardTagExplorerDialog
        tag={tagExplorer ?? ''}
        open={tagExplorer !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setTagExplorer(null);
            setTagDetailCard(null);
          }
        }}
        onSelectCard={setTagDetailCard}
      />
      {tagDetailCard && (
        <CardDetailDialog
          card={tagDetailCard}
          open={Boolean(tagDetailCard)}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setTagDetailCard(null);
          }}
        />
      )}
    </AltInspectContext.Provider>
  );
}

export function Inspectable({
  children,
  content,
  showOnHover = false,
  touchInspectTriggerOnly = false,
  className,
}: {
  children: ReactNode;
  content: ReactNode;
  showOnHover?: boolean;
  touchInspectTriggerOnly?: boolean;
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
  const toggleTouch = (element: HTMLElement) =>
    context.toggleTouch({
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
        if (event.pointerType !== 'touch') return;
        if (touchInspectTriggerOnly && !(event.target as Element).closest('[data-touch-inspect-trigger]')) {
          context.clear();
          return;
        }
        toggleTouch(event.currentTarget);
      }}
      onClickCapture={(event) => {
        // Programmatic click from the gamepad's X button has no pointer-up event.
        if (event.detail === 0 && (event.target as Element).closest('[data-touch-inspect-trigger]')) {
          toggleTouch(event.currentTarget);
        }
      }}
    >
      {children}
    </div>
  );
}

export function CardInspectContent({ card }: { card: CardInstance }) {
  const altInspectContext = useContext(AltInspectContext);
  const { definition, tags, keywords, statuses, rulesText } = getCardInspectorMetadata(card);
  const numericChanges = getNumericChanges(card);
  return (
    <div className="ko-inspector-content space-y-4">
      <div className="border-b border-neutral-800 pb-3">
          <div className="mb-1 text-[clamp(0.9rem,1.2vw,1rem)] font-bold tracking-[0.18em] text-blue-300">
        {card.isChampionToken ? '챔피언 토큰' : card.isToken ? '토큰 선수' : '선수 카드'}
        </div>
        <h3 className="text-[clamp(1.35rem,1.8vw,1.7rem)] font-black leading-tight text-white">
          {definition?.name ?? '알 수 없는 카드'}
        </h3>
      </div>
      <CardRenderer
        name={definition?.name ?? '알 수 없는 카드'}
        cardType={card.cardType}
        cost={card.currentCost}
        attack={card.currentAttack}
        health={card.currentHealth}
         rulesText={getCardRuntimeRulesText(card, definition?.rulesText ?? '효과 없음')}
        imageUrl={definition?.imageUrl}
        rarity={definition?.rarity}
        size="detail"
        className="mx-auto w-full max-w-[260px]"
        showRules={false}
        imageDisplaySettings={definition}
          runtimeKeywords={getActiveCardKeywords(card)}
         isSilenced={card.isSilenced}
         isStunned={card.isStunned}
         isAbilityDisabled={card.isAbilityDisabled}
         dodgeCharges={card.dodgeCharges ?? (card.dodgeAvailable ? 1 : 0)}
         isChampionToken={card.isChampionToken}
      />
      <div className="grid grid-cols-3 gap-2">
        <InspectorStat label="비용" value={card.currentCost} />
        <InspectorStat label="공격력" value={card.currentAttack} />
        <InspectorStat label="체력" value={card.currentHealth} />
      </div>
      <InspectorSection title="키워드" tone="amber">
        {keywords.length === 0 ? (
              <p className="text-[clamp(0.875rem,1.1vw,0.98rem)] text-neutral-500">고유 키워드 없음</p>
        ) : (
          <div className="space-y-2.5">
            <div className="flex flex-wrap gap-2">
              {keywords.map((keyword) => (
                <span key={keyword.key} className="rounded-full border border-amber-500/60 bg-amber-950/60 px-3 py-1 text-[clamp(0.875rem,1.2vw,1.0625rem)] font-black text-amber-100">
                  {keyword.label}
                </span>
              ))}
            </div>
            <div className="space-y-1.5">
              {keywords.map((keyword) => (
                <p key={`${keyword.key}-description`} className="text-[clamp(0.9375rem,1.25vw,1.125rem)] leading-[1.5] text-neutral-300">
                  <strong className="font-bold text-amber-200">{keyword.label}:</strong> {keyword.description}
                </p>
              ))}
            </div>
          </div>
        )}
      </InspectorSection>
      {tags.length > 0 && (
        <InspectorSection title="태그" tone="cyan">
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                data-testid="inspector-card-tag"
                aria-label={`${tag} 태그 카드 보기`}
                onClick={(event) => {
                  event.stopPropagation();
                  altInspectContext?.openTagExplorer(tag);
                }}
                className="pointer-events-auto rounded-full border border-cyan-500/60 bg-cyan-950/60 px-3 py-1 text-[clamp(0.875rem,1.2vw,1.0625rem)] font-black text-cyan-100 transition hover:bg-cyan-800/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                {tag}
              </button>
            ))}
          </div>
        </InspectorSection>
      )}
      {statuses.length > 0 && (
        <InspectorSection title="현재 상태" tone="rose">
          <div className="flex flex-wrap gap-2">
            {statuses.map((status) => (
                <span key={status.key} className="rounded-full border border-rose-500/60 bg-rose-950/60 px-3 py-1 text-[clamp(0.875rem,1.2vw,1.0625rem)] font-black text-rose-100">
                {status.label}
              </span>
            ))}
          </div>
          <div className="mt-2 space-y-1.5">
            {statuses.map((status) => (
              <p key={`${status.key}-description`} className="text-[clamp(0.9375rem,1.25vw,1.125rem)] leading-[1.5] text-neutral-300">
                <strong className="font-bold text-rose-200">{status.label}:</strong> {status.description}
              </p>
            ))}
          </div>
        </InspectorSection>
      )}
      <InspectorSection title="효과 설명" tone="neutral">
        <p data-testid="inspector-card-rules" className="whitespace-pre-wrap break-words text-[clamp(0.9375rem,1.25vw,1.125rem)] leading-[1.55] text-neutral-100">
          {rulesText}
        </p>
      </InspectorSection>
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-3">
        <div className="mb-2 text-[clamp(0.875rem,1.1vw,1rem)] font-black text-neutral-200">수치 변경</div>
        {numericChanges.length === 0 ? (
          <div className="text-[clamp(0.8125rem,1vw,0.9375rem)] text-neutral-500">변경 없음</div>
        ) : (
          <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
            {numericChanges.map((change, index) => (
              <div key={`${change.stat}-${change.before}-${change.after}-${index}`} className="rounded border border-neutral-800 px-2 py-1.5 text-[clamp(0.8125rem,1vw,0.9375rem)] text-neutral-400">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-neutral-300">{STAT_LABELS[change.stat]}</span>
                  <span className={change.after >= change.before ? 'text-emerald-300' : 'text-red-300'}>
                    {change.before} → {change.after}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-2 text-[clamp(0.75rem,0.95vw,0.875rem)] text-neutral-500">
                  <span>{change.delta >= 0 ? '+' : ''}{change.delta}</span>
                  {change.sourceName && <span>출처: {change.sourceName}</span>}
                  {change.turnNumber !== undefined && <span>턴 {change.turnNumber}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InspectorStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/80 px-3 py-2.5 text-center">
      <div className="text-[0.8rem] font-bold text-neutral-500">{label}</div>
      <div className="mt-1 font-display text-[clamp(1.2rem,1.7vw,1.5rem)] font-black text-amber-200">{value}</div>
    </div>
  );
}

function InspectorSection({
  title,
  tone,
  children,
}: {
  title: string;
  tone: 'amber' | 'cyan' | 'rose' | 'neutral';
  children: ReactNode;
}) {
  const titleClass = {
    amber: 'text-amber-300',
    cyan: 'text-cyan-300',
    rose: 'text-rose-300',
    neutral: 'text-neutral-300',
  }[tone];
  return (
    <section className="rounded-lg border border-neutral-800 bg-black/20 p-3.5">
      <h4 className={`mb-2 text-[0.95rem] font-black tracking-wide ${titleClass}`}>{title}</h4>
      {children}
    </section>
  );
}

const STAT_LABELS: Record<NumericChangeStat, string> = {
  attack: '공격력',
  health: '체력',
  maxHealth: '최대 체력',
  currentHealth: '현재 체력',
  cost: '비용',
};

function rewardText(champion: ChampionState): string {
  const reward = champion.quest?.reward;
  if (!reward) return '보상 없음';
  return reward.type === 'UPGRADE_ABILITY'
    ? '챔피언 고유 능력을 강화합니다.'
    : reward.type === 'GAIN_GOLD'
      ? `다음 턴 골드 ${reward.amount}를 얻습니다.`
      : '연결된 챔피언 토큰을 직접 전개합니다.';
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
      <div className="text-[clamp(0.875rem,1.1vw,1rem)] font-bold tracking-widest text-blue-300">챔피언 고유 능력</div>
      <h3 className="mt-1 text-[clamp(1.2rem,1.8vw,1.5rem)] font-black">{ability.name}</h3>
      <div className="my-3 font-display text-[clamp(1rem,1.3vw,1.125rem)] font-bold text-primary">비용 {champion.abilityCost} 골드</div>
      <p className="text-[clamp(0.9375rem,1.25vw,1.125rem)] leading-[1.5] text-neutral-300">{ability.description}</p>
      <div className={`mt-3 text-[clamp(0.875rem,1.1vw,1rem)] font-bold ${available ? 'text-emerald-300' : 'text-red-300'}`}>
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
      <div className="text-[clamp(0.875rem,1.1vw,1rem)] font-bold tracking-widest text-purple-300">챔피언 퀘스트</div>
      <h3 className="mt-1 text-[clamp(1.2rem,1.8vw,1.5rem)] font-black">{quest.name}</h3>
      <div className="mt-3 text-[clamp(0.8125rem,1vw,0.9375rem)] font-bold text-neutral-500">조건</div>
      <p className="text-[clamp(0.9375rem,1.25vw,1.125rem)] leading-[1.5] text-neutral-300">{quest.description}</p>
      <div className="mt-3 text-[clamp(0.8125rem,1vw,0.9375rem)] font-bold text-neutral-500">진행</div>
      <div className="font-display text-[clamp(1rem,1.3vw,1.125rem)] font-black text-white">
        {champion.questCompleted
          ? '완료됨'
          : `${champion.questProgress} / ${quest.requiredProgress}`}
      </div>
      <div className="mt-3 text-[clamp(0.8125rem,1vw,0.9375rem)] font-bold text-neutral-500">완료 보상</div>
      <p className="text-[clamp(0.9375rem,1.25vw,1.125rem)] leading-[1.5] text-neutral-300">{rewardText(champion)}</p>
    </div>
  );
}
