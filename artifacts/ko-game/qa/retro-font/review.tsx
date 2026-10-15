import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "./review.css";
const modes = [
  ["baseline", "기존 · Noto Sans KR / Oswald"],
  ["full", "FULL RETRO · 제목과 본문 모두"],
  ["hybrid", "RETRO HYBRID · 긴 본문은 Noto"],
] as const;
const scenes = [
  ["menu", "메인 메뉴"],
  ["cards", "선수 · 주문 카드"],
  ["champions", "챔피언 · 능력 · 퀘스트"],
  ["battle", "전투 화면"],
  ["readability", "작은 본문 · 긴 효과 비교"],
] as const;
function Review() {
  const [size, setSize] = useState("390x844");
  const [feedback, setFeedback] = useState(false);
  const [scene, setScene] = useState("menu");
  const [width, height] = size.split("x").map(Number);
  return (
    <main>
      <header>
        <p className="eyebrow">KO CARD GAME · FONT REVIEW</p>
        <h1>Neo둥근모 Pro 미리보기</h1>
        <p>
          기존 / FULL RETRO / HYBRID를 같은 카드와 화면 크기로 비교해 봐. 아직
          적용을 확정하지 않았어.
        </p>
        <p className="notice">
          미리보기 전용 · 운영 사이트 변경 없음 · 모바일 에뮬레이션 검증
        </p>
      </header>
      <nav aria-label="화면 선택">
        {scenes.map(([id, label]) => (
          <button
            key={id}
            aria-pressed={scene === id}
            onClick={() => setScene(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <label className="viewport">
        비교 화면 크기{" "}
        <select value={size} onChange={(e) => setSize(e.target.value)}>
          {["360x740", "375x812", "390x844", "412x915", "1440x900"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      {scene === "battle" && (
        <label>
          <input
            type="checkbox"
            checked={feedback}
            onChange={(e) => setFeedback(e.target.checked)}
          />{" "}
          피해 숫자 · 턴 안내도 보기
        </label>
      )}
      <section className="comparisons">
        {modes.map(([mode, label]) => (
          <article key={mode}>
            <h2>{label}</h2>
            <a
              href={`./retro-font-scene.html?scene=${scene}&mode=${mode}${scene === "battle" && feedback ? "&feedback=1" : ""}`}
              target="_blank"
              rel="noreferrer"
            >
              이 화면만 열기
            </a>
            <div className="frame-scroll">
              <iframe
                title={label}
                width={width}
                height={height}
                src={`./retro-font-scene.html?scene=${scene}&mode=${mode}${scene === "battle" && feedback ? "&feedback=1" : ""}`}
              />
            </div>
          </article>
        ))}
      </section>
      <section className="notes">
        <h2>검토할 점</h2>
        <ul>
          <li>
            로고와 프레임·일러스트는 세 안에서 동일해. 새 폰트는 Regular만
            사용하고 가짜 굵기를 막았어.
          </li>
          <li>
            카드·전투의 작은 효과 영역은 새 안에서 10px, 확대 카드는 16px로
            시험해. 넘치는 문구는 온전한 줄까지만 보여주고 끝에 ••••를 표시해.
            카드 상세정보에서는 전체 효과를 읽을 수 있어.
          </li>
          <li>
            HYBRID에서는 카드 효과, 긴 능력·퀘스트 본문, 팝업 설명과 입력창에
            Noto Sans KR을 써.
          </li>
          <li>
            작은 전투 카드 안에 장문을 모두 넣는 문제는 폰트 교체만으로 해결되지
            않아. 상세정보에서 전체 효과를 확인해.
          </li>
          <li>
            운영 API의 503 때문에 보관된 2026-10-14 카드·챔피언 스냅샷과 검증된
            원본 이미지를 사용했어. 메뉴는 실제 컴포넌트의 기본 배경, 카드는
            저장소의 기본 프레임이야.
          </li>
        </ul>
        <h2>폰트와 라이선스</h2>
        <p>
          NeoDunggeunmo Pro 1.020 · SIL Open Font License 1.1 · 공식 웹폰트 커밋
          1751c2981808869750c7df391c1d2b486e978f12
        </p>
        <p>
          <a href="https://github.com/neodgm/neodgm-pro-webfont/tree/1751c2981808869750c7df391c1d2b486e978f12">
            공식 배포 출처
          </a>{" "}
          ·{" "}
          <a href="./retro-font/assets/OFL-NeoDunggeunmo-Pro.txt">
            라이선스 전문
          </a>
        </p>
        <p>
          승인 전 main 병합·Render 배포 없음. 최종 선택은 네가 비교 자료를 본 뒤
          결정해.
        </p>
      </section>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Review />);
