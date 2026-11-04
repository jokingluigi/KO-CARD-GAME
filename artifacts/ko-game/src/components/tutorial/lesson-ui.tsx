import {TutorialRewardsPanel,type TutorialProof} from "./tutorial-rewards";
import { useEffect, useState } from "react";
import { GameGuideDialogTrigger } from "../game-guide/game-guide-dialog";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import {
  LESSONS,
  lessonUnavailable,
  type LessonId,
  type TutorialCatalog,
  type TutorialGoal,
} from "./lesson-engine";
import "./tutorial.css";
const storageKey = (account: string) => `ko-tutorial-v1:${account}`;
export function readTutorialProgress(account: string): LessonId[] {
  try {
    const v = JSON.parse(localStorage.getItem(storageKey(account)) ?? "[]");
    return Array.isArray(v)
      ? v.filter((id) => LESSONS.some((l) => l.id === id))
      : [];
  } catch {
    return [];
  }
}
export function saveTutorialProgress(account: string, id: LessonId) {
  try {
    localStorage.setItem(
      storageKey(account),
      JSON.stringify([...new Set([...readTutorialProgress(account), id])]),
    );
  } catch {}
}
export function TutorialMenu({
  accountId,
  catalog,
  error,
  completed,
  onStart,
  onBack,
  onRetry,
  onDeckEdit,
}: {
  accountId?:string;
  catalog: TutorialCatalog | null;
  error: string | null;
  completed: LessonId[];
  onStart: (id: LessonId) => void;
  onBack: () => void;
  onRetry: () => void;
  onDeckEdit: () => void;
}) {
  return (
    <>
      <main className="ko-tutorial-menu">
        <header>
          <span>KO · 튜토리얼</span>
          <h1>직접 배우는 카드 전투</h1>
          <p>
            실제로 카드를 움직이는 6개 실습이에요. 읽어서 확인할 규칙은 아래
            게임 규칙 설명에서 찾으세요.
          </p>
        </header>
        <aside>
          기존 카드로 준비한 연습 상황이에요. 카드가 없어도 시작할 수 있고, 내
          덱·전적은 바뀌지 않으며, 최초 실습 완료 보상은 계정에 지급돼요. 연습 상대는 공격하지 않으며 제한 시간도
          없어요.
        </aside>
        <TutorialRewardsPanel accountId={accountId}/>
        {catalog?.practiceSource === "PINNED" && (
          <p role="status">
            검증된 연습용 카드 구성을 사용하고 있어요. 실전의 최신 카드 구성과
            다를 수 있어요.
          </p>
        )}
        {error ? (
          <div role="alert">
            <p>{error}</p>
            <button onClick={onRetry}>다시 불러오기</button>
          </div>
        ) : !catalog ? (
          <p role="status">현재 공개 카드와 규칙을 확인하고 있어요…</p>
        ) : (
          <ol>
            {LESSONS.map((lesson, i) => {
              const reason = lessonUnavailable(catalog, lesson.id);
              return (
                <li key={lesson.id}>
                  <button
                    data-testid={`lesson-${lesson.id}`}
                    disabled={Boolean(reason)}
                    onClick={() => onStart(lesson.id)}
                  >
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    <div>
                      <strong>{lesson.title}</strong>
                      <p>{reason ?? lesson.detail}</p>
                    </div>
                    <small>
                      {completed.includes(lesson.id)
                        ? "완료 · 다시 연습"
                        : "시작 →"}
                    </small>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        <GameGuideDialogTrigger
          label="게임 규칙 설명 · 챔피언 토큰"
          inBattle={false}
        />
        <footer>
          <p>연습 표시는 이 기기에, 보상 지급 기록은 계정에 저장돼요. 이전에 연습만 마쳤다면 다시 완료해 보상을 받으세요.</p>
          <div>
            <button onClick={onDeckEdit}>내 덱 준비하기</button>
            <button onClick={onBack}>메인 메뉴</button>
          </div>
        </footer>
      </main>
    </>
  );
}
export function TutorialCoach({
  accountId, rewardProof,
  id,
  goal,
  setup,
  busy,
  error,
  onRestart,
  onCourses,
  onNext,
}: {
  accountId?:string;
  rewardProof?:TutorialProof;
  id: LessonId;
  goal: TutorialGoal;
  setup: string;
  busy: boolean;
  error: string | null;
  onRestart: () => void;
  onCourses: () => void;
  onNext: () => void;
}) {
  const [open, setOpen] = useState(true),
    [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!goal.complete || busy) {
      setSettled(false);
      return;
    }
    const t = setTimeout(() => {
      setSettled(true);
      setOpen(true);
    }, 750);
    return () => clearTimeout(t);
  }, [goal.complete, busy]);
  const lesson = LESSONS.find((l) => l.id === id)!;
  return (
    <>
      <div
        className="ko-tutorial-command"
        data-testid="tutorial-current-goal"
        data-goal={goal.key}
        data-busy={busy}
        aria-busy={busy}
      >
        <div role="status" aria-live="polite">
          <strong>{goal.complete ? "실습 성공!" : goal.title}</strong>
          <span>
            {error ||
              (goal.complete
                ? "훈련 안내에서 결과를 확인하고 다음 실습으로 가세요."
                : goal.hint)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="훈련 안내 열기"
        >
          훈련 안내
        </button>
      </div>
      <Dialog open={open && (!goal.complete || settled)} onOpenChange={setOpen}>
        <DialogContent
          className="ko-tutorial-dialog"
          overlayClassName="!z-[220]"
        >
          <DialogTitle>
            {goal.complete ? "실습 성공" : lesson.title}
          </DialogTitle>
          <DialogDescription>
            {goal.complete
              ? "버튼만 누른 것이 아니라 실제 전투 판정으로 목표를 달성했어요."
              : setup}
          </DialogDescription>
          {goal.complete&&<TutorialRewardsPanel accountId={accountId} proof={rewardProof}/>}
          {!goal.complete ? (
            <>
              <h2>{goal.title}</h2>
              <p>{goal.hint}</p>
              <button
                className="ko-tutorial-primary"
                onClick={() => setOpen(false)}
              >
                직접 해보기
              </button>
            </>
          ) : (
            <>
              <p>
                {id === "active"
                  ? "사용 완료된 액티브는 다음 턴이 되어도 다시 활성화되지 않아요."
                  : id === "spell"
                    ? "취소할 때는 보존됐던 카드와 골드가, 대상을 확정하면 실제로 소모됐어요."
                    : id === "champion"
                      ? "피니셔 준비를 완료해 고유능력이 강화됐어요. 실전에서는 표시된 조건을 처음부터 달성해야 해요."
                      : id === "combat"
                        ? "일반 전투에서는 서로 반격하고 체력 0이 된 선수가 리타이어해요. 파괴·소멸과는 다른 판정이에요."
                        : id === "rush"
                          ? "러쉬 선수는 소환한 턴에 바로 공격했어요. 일반 선수는 다음 자기 턴을 기다려야 해요."
                          : "상대 챔피언의 체력을 0으로 만들어 승리했어요."}
              </p>
              <button className="ko-tutorial-primary" onClick={onNext}>
                {id === LESSONS.at(-1)!.id
                  ? "전체 실습으로 돌아가기"
                  : "다음 실습"}
              </button>
            </>
          )}
          <nav>
            <button onClick={onRestart}>이번 실습 다시 시작</button>
            <button onClick={onCourses}>실습 목록 · 나가기</button>
          </nav>
        </DialogContent>
      </Dialog>
    </>
  );
}
