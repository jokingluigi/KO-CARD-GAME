import { useEffect, useId, useMemo, useRef, useState } from "react";
import { KEYWORD_DESCRIPTIONS, KEYWORD_LABELS } from "../alt-inspector-utils";
import {
  GAME_GUIDE,
  GUIDE_CATEGORIES,
  GUIDE_CHAPTERS,
  searchGuide,
  type GuideCategory,
  type GuideEntry,
} from "./guide-content";
import "./game-guide.css";
const keywords: GuideEntry[] = Object.entries(KEYWORD_DESCRIPTIONS)
  .filter(([id]) => Boolean(KEYWORD_LABELS[id]))
  .map(([id, answer]) => ({
    id: "keyword-" + id.toLowerCase(),
    category: "keywords",
    title: KEYWORD_LABELS[id],
    answer,
    terms: id,
    source: "components/alt-inspector-utils.ts",
  }));
export const ALL_GUIDE_ENTRIES = [...GAME_GUIDE, ...keywords];
export default function GameGuideContent({
  inBattle = false,
}: {
  inBattle?: boolean;
}) {
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState<GuideCategory>("all");
  const [focusId] = useState(() => {
    const id = window.location.hash.slice(1);
    return ALL_GUIDE_ENTRIES.some((e) => e.id === id) ? id : null;
  });
  const searchId = useId(),
    root = useRef<HTMLDivElement>(null);
  const entries = useMemo(
    () => searchGuide(ALL_GUIDE_ENTRIES, query, category),
    [query, category],
  );
  useEffect(() => {
    if (focusId)
      root.current
        ?.querySelector<HTMLElement>(`[data-guide-id="${focusId}"]`)
        ?.scrollIntoView({ block: "nearest" });
  }, [focusId]);
  const renderEntry = (entry: GuideEntry) => (
    <details
      key={entry.id}
      data-guide-id={entry.id}
      open={query.trim() !== "" || entry.id === focusId ? true : undefined}
    >
      <summary>{entry.title}</summary>
      <div>
        <p>{entry.answer}</p>
        {entry.example && (
          <p className="ko-guide-example">
            <strong>기억할 점</strong>
            {entry.example}
          </p>
        )}
      </div>
    </details>
  );
  return (
    <div className="ko-guide" ref={root}>
      {inBattle && (
        <p className="ko-guide-battle-note" role="note">
          온라인 대전은 도움말을 읽는 동안에도 턴 시간이 계속 흘러요.
        </p>
      )}
      <div className="ko-guide-search">
        <label htmlFor={searchId}>궁금한 규칙 찾기</label>
        <div>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="예: 침묵, 액티브, 콤보, 스킨"
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              aria-label="도움말 검색 지우기"
              onClick={() => setQuery("")}
            >
              ×
            </button>
          )}
        </div>
      </div>
      <nav className="ko-guide-categories" aria-label="도움말 분류">
        {GUIDE_CATEGORIES.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={category === id}
            onClick={() => setCategory(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="ko-guide-shortcuts" aria-label="자주 헷갈리는 규칙">
        <span>바로 찾기</span>
        <button
          type="button"
          onClick={() => {
            setCategory("champion");
            setQuery("");
          }}
        >
          챔피언 토큰 설명 →
        </button>
        <button
          type="button"
          onClick={() => {
            setCategory("combat");
            setQuery("액티브");
          }}
        >
          액티브 사용 횟수 →
        </button>
        <button
          type="button"
          onClick={() => {
            setCategory("combat");
            setQuery("리타이어");
          }}
        >
          퇴장 판정 →
        </button>
      </div>
      {category === "keywords" && (
        <p className="ko-guide-footer">
          기본 키워드 설명입니다. 챔피언 등급 토큰의 침묵 면역 등 카드 고유
          예외도 함께 확인하세요.
        </p>
      )}
      <p className="ko-guide-count" role="status">
        {entries.length}개 안내{query && ` · “${query}” 검색 결과`}
      </p>
      {entries.length ? (
        query.trim() ? (
          <div className="ko-guide-entries">{entries.map(renderEntry)}</div>
        ) : (
          <div className="ko-guide-chapters">
            {GUIDE_CATEGORIES.filter(
              ([id]) => id !== "all" && (category === "all" || id === category),
            ).map(([id]) => {
              const key = id as Exclude<GuideCategory, "all">;
              const chapter = GUIDE_CHAPTERS[key];
              return (
                <section
                  key={key}
                  aria-labelledby={`${searchId}-${key}`}
                  className="ko-guide-chapter"
                >
                  <header>
                    <h2 id={`${searchId}-${key}`}>{chapter.title}</h2>
                    <p>{chapter.description}</p>
                  </header>
                  <div className="ko-guide-entries">
                    {entries.filter((e) => e.category === key).map(renderEntry)}
                  </div>
                </section>
              );
            })}
          </div>
        )
      ) : (
        <section className="ko-guide-empty">
          <h2>맞는 안내를 찾지 못했어요.</h2>
          <p>더 짧은 검색어를 쓰거나 분류를 바꿔보세요.</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setCategory("all");
            }}
          >
            전체 안내 보기
          </button>
        </section>
      )}
      <p className="ko-guide-footer">
        카드마다 다른 조건은 해당 카드의 전체 설명과 현재 상태를 함께
        확인하세요. 연출이 아니라 실제 전투 로그와 게임 판정을 기준으로
        안내합니다.
      </p>
    </div>
  );
}
