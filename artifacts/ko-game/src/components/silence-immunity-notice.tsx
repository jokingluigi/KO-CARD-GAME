import "./game-guide/game-guide.css";
export const SILENCE_IMMUNITY_DESCRIPTION =
  "침묵으로 키워드와 능력이 제거되지 않습니다. 피해·기절·파괴·소멸까지 막는 효과는 아닙니다.";
export function SilenceImmunityNotice({
  immune,
  intrinsic = false,
}: {
  immune: boolean;
  intrinsic?: boolean;
}) {
  if (!immune) return null;
  return (
    <aside
      className="ko-silence-immunity-notice"
      data-testid="silence-immunity-notice"
    >
      <strong>침묵 면역</strong>
      <p className="ko-silence-immunity-notice__summary">침묵으로 능력과 키워드가 제거되지 않습니다.</p>
      <p>
        {intrinsic ? "챔피언 등급 토큰 선수의 고유 규칙입니다. " : ""}
        피해·기절·파괴·소멸은 별도로 적용됩니다.
      </p>
    </aside>
  );
}
