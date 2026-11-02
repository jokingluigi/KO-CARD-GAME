import { useEffect, useState } from "react";
import { MatchTutorial } from "../match-tutorial";
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
  catalog,
  error,
  completed,
  onStart,
  onBack,
  onRetry,
  onDeckEdit,
}: {
  catalog: TutorialCatalog | null;
  error: string | null;
  completed: LessonId[];
  onStart: (id: LessonId) => void;
  onBack: () => void;
  onRetry: () => void;
  onDeckEdit: () => void;
}) {
  const [referenceStep, setReferenceStep] = useState<number | null>(null);
  return (
    <>
      <main className="ko-tutorial-menu">
        <header>
          <span>KO · 플레이 배우기</span>
          <h1>직접 배우는 카드 전투</h1>
          <p>한 번에 한 가지씩, 실제 카드를 움직이며 배워요.</p>
        </header>
        <aside>
          기존 카드로 준비한 연습 상황이에요. 카드가 없어도 시작할 수 있고, 내
          덱·재화·전적은 바뀌지 않아요. 연습 상대는 공격하지 않으며 제한 시간도
          없어요.
        </aside>
        {catalog?.practiceSource==='PINNED'&&<p role="status">검증된 연습용 카드 구성을 사용하고 있어요. 실전의 최신 카드 구성과 다를 수 있어요.</p>}
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
        <button onClick={() => setReferenceStep(0)}>규칙 설명 보기</button>
        <details className="ko-tutorial-next"><summary>실전에서는 무엇을 더 알아야 하나요?</summary><p>첫 손패에서는 초반에 낼 수 있는 비용의 선수를 확보하세요. 러쉬·방어·면역처럼 행동 가능 여부를 바꾸는 키워드는 카드 정보를 길게 눌러 확인하세요. 리타이어·파괴·소멸은 서로 다른 처리이므로 카드 설명을 구별해서 읽으세요.</p><p>한 번에 여러 카드를 바꾸기보다, 경기 후 가장 쓰기 어려웠던 카드부터 점검하세요. 이 안내는 승패 원인을 자동으로 판정한 결과가 아닙니다.</p></details>
        <footer>
          <p>완료 표시는 이 기기에 저장돼요. 언제든 다시 연습할 수 있어요.</p>
          <div>
            <button onClick={onDeckEdit}>내 덱 준비하기</button>
            <button onClick={onBack}>메인 메뉴</button>
          </div>
        </footer>
      </main>
      {referenceStep !== null && (
        <MatchTutorial
          step={referenceStep}
          onStepChange={setReferenceStep}
          onClose={() => setReferenceStep(null)}
        />
      )}
    </>
  );
}
export function TutorialCoach({
  id,
  goal,
  setup,
  busy,
  error,
  onRestart,
  onCourses,
  onNext,
}: {
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
                      ? "퀘스트를 완료해 고유능력이 강화됐어요. 실전에서는 표시된 조건을 처음부터 달성해야 해요."
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
