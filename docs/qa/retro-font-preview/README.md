# Neo둥근모 Pro — 승인용 미리보기

이 작업은 **폰트 비교 자료 제작까지 완료**, **시각적 승인 대기** 상태다. 폰트를 운영에 적용하거나 main을 병합하지 않는다.

- 브랜치: `feat/retro-pixel-font-preview`
- 기준 main: `8d3f417ff062cc8d5390e27485d2b12cf0c9bf3d`
- 후보: **NeoDunggeunmo Pro 1.020 Regular**, SIL Open Font License 1.1
- 공식 배포: <https://github.com/neodgm/neodgm-pro-webfont/tree/1751c2981808869750c7df391c1d2b486e978f12>
- 공식 WOFF2 SHA-256: `b6b28ef07a91a889587b3f2485ad77d3cd116456f8bfbc50a271cbe90b39535d` — 실제 파일과 일치
- 공식 GitHub README 확인. 별도 사용 가이드 URL은 클라우드에서 403이어서 본문을 확인하지 못했다. 16px·32px 우선 원칙은 사용자 지시에 따라 시험했다.

## 비교 이미지

모든 이미지는 실제 React 컴포넌트를 Chromium에서 렌더링한 PNG다. 생성형 이미지를 사용하지 않았다. 세 안의 카드·챔피언·상태·해상도·아트·프레임은 동일하다.

왼쪽 **기존 Noto Sans KR / Oswald**, 가운데 **FULL RETRO**, 오른쪽 **RETRO HYBRID**.

- [확대 전 카드 효과 글씨 10px → 8px·생략 배경 제거](images/compact-font-size-comparison.png)
- [문장 가운데 정렬·인라인 .... 수정 비교](images/inline-ellipsis-comparison.png)
- [긴 효과 .... 생략 전후](images/ellipsis-before-after.png)
- [연락표](images/contact-sheet.png) — 각 장면의 동일한 390×844 상단 뷰포트. 전체 높이는 아래 개별 비교 이미지에 보존했다.
- [메인 메뉴](images/menu-comparison.png)
- [선수·주문 카드](images/cards-comparison.png)
- [챔피언·고유 능력·퀘스트·강화 능력](images/champions-comparison.png)
- [전투 화면](images/battle-comparison.png)
- [긴 카드 효과·퀘스트·타워 대화](images/readability-comparison.png)
- [모바일 검토 페이지 실제 화면](images/review-page.png)
- [피해 숫자·턴 안내](images/feedback-comparison.png) — 실제 `PresentationFeedback`을 동일한 애니메이션 진행률 45%에서 캡처했다. 운영 애니메이션 코드는 수정하지 않았다.

ZIP: `qa-results/retro-font-preview/KO-CARD-GAME-NeoDunggeunmo-Pro-preview.zip`. 이미지·원본 PNG·정적 HTML·보고서·라이선스를 포함한다. ZIP의 `index.html`은 서버 없이 비교 이미지를 보여준다.

## 검토 페이지와 재현

개발 환경의 `/qa/retro-font-review.html`. 현재 환경의 로컬 주소는 `http://127.0.0.1:5175/qa/retro-font-review.html`이다. 이 주소는 **이 실행 환경에서만** 접근할 수 있어 휴대폰 제출물로는 PNG와 ZIP을 함께 제공한다. 운영 사이트에 이 페이지를 배포하지 않는다.

```bash
source /workspace/cloud-setup/env.sh
PORT=5175 BASE_PATH=/ pnpm --filter @workspace/ko-game exec vite --config vite.config.ts --port 5175 --host 127.0.0.1
```

별도 셸에서 이 환경에 이미 설치된 도구로 검증한다.

```bash
source /workspace/cloud-setup/env.sh
pnpm --filter @workspace/ko-game run typecheck
pnpm --filter @workspace/ko-game exec tsc -p qa/retro-font/tsconfig.json --noEmit
pnpm --filter @workspace/ko-game run build
KO_QA_PLAYWRIGHT=/workspace/cloud-setup/browser-tools/node_modules/playwright/index.mjs \
KO_QA_CHROMIUM_EXECUTABLE=/usr/bin/chromium \
node docs/qa/retro-font-preview-browser.mjs
KO_QA_PLAYWRIGHT=/workspace/cloud-setup/browser-tools/node_modules/playwright/index.mjs \
KO_QA_CHROMIUM_EXECUTABLE=/usr/bin/chromium \
node docs/qa/retro-font-feedback-browser.mjs
KO_QA_PLAYWRIGHT=/workspace/cloud-setup/browser-tools/node_modules/playwright/index.mjs \
KO_QA_CHROMIUM_EXECUTABLE=/usr/bin/chromium \
node docs/qa/retro-font-review-browser.mjs
KO_QA_PLAYWRIGHT=/workspace/cloud-setup/browser-tools/node_modules/playwright/index.mjs \
KO_QA_CHROMIUM_EXECUTABLE=/usr/bin/chromium \
node docs/qa/retro-font-ellipsis-browser.mjs
KO_QA_PLAYWRIGHT=/workspace/cloud-setup/browser-tools/node_modules/playwright/index.mjs \
KO_QA_CHROMIUM_EXECUTABLE=/usr/bin/chromium \
node docs/qa/retro-font-inline-browser.mjs
python3 docs/qa/retro-font-preview-export.py
```

다른 환경에서는 Playwright·Chromium·Pillow가 필요하다. 브라우저 경로와 `KO_QA_ORIGIN`을 해당 환경에 맞춘다. Google Fonts CSS 요청은 테스트에서 빈 CSS로 응답한다. 비교에 필요한 **실제 Noto Sans KR·Oswald WOFF2를 QA 폴더에 버전 고정해 저장**했으므로 시스템 대체 글꼴을 Before로 사용하지 않는다.

## 조사한 실제 폰트 경로

| 영역      | 기존 구현                                                                          | 미리보기 방식                                                                 |
| --------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 전역      | `src/index.css`의 `--app-font-sans`, `--app-font-display`                          | QA 문서의 `data-font-mode` 범위에서만 변수 변경                               |
| 메인 메뉴 | `MainMenu`, `premium-presentation.css`                                             | 실제 컴포넌트 사용. 로고의 Oswald·굵기·자간 보존                              |
| 카드      | `CardRenderer`, `CardRulesText`, `MotionNumber`                                    | 동일 원본 아트·기본 PNG 프레임·효과 문구 사용                                 |
| 챔피언    | `ChampionAbilityInspectContent`, `ChampionQuestInspectContent`, `GameStatePreview` | 기본·강화 능력, 퀘스트 조건·진행·보상 개별 표시                               |
| 전투      | `GameStatePreview`, `PresentationFeedback`                                         | 로컬 고정 상태. 공격·골드·효과 계산 구현 변경 없음                            |
| 팝업      | `CardDetailDialog`                                                                 | 실제 컴포넌트의 카드·능력치·전체 효과 표시                                    |
| 타워 본문 | `TowerDialogueView`                                                                | 보관된 실제 대사 사용. 누락된 스프라이트는 기존 컴포넌트의 기본 표시로 렌더링 |
| PWA       | 기존 서비스 워커·프로덕션 진입점                                                   | 변경 없음. QA 페이지는 서비스 워커를 등록하지 않음                            |

## 폰트와 본문 정책

- 새 폰트는 **400 Regular**만 선언한다. 후보 영역의 합성 굵기·기울임을 `font-synthesis: none`으로 막고, 기존 `font-black`·`font-bold`를 QA 문서에서 400으로 재정의한다.
- 과도한 자간을 QA 후보 영역에서 제거하되 기존 KO 로고·CARD BATTLE 자간과 굵기는 그대로 유지한다.
- FULL RETRO: 제목·메뉴·이름·숫자·장문 모두 후보 폰트.
- HYBRID 예외: 카드 효과, 퀘스트 조건·보상, 고유 능력 장문, 팝업 설명, 타워 대화와 입력창은 Noto Sans KR. 작은 본문의 형태 구별과 줄바꿈 안정성을 비교하기 위한 예외다.
- 신규 후보의 작은 카드 효과는 사용자 추가 요청에 따라 **8px**로 조정했다(12→10→8). 이 값은 추가 승인된 미리보기 설정이다. 확대 카드는 16px, 정보창의 전체 설명은 기존 크기를 유지한다. **체력·코스트·공격력 숫자의 폰트·크기·값·위치는 변경하지 않았다.** 카드/전투 20개 레이아웃의 변경 전후 측정값이 완전히 동일하다: [숫자 보존 검증](numeric-layout-preservation.json).
- **글자를 찌그러뜨리거나 카드 전체를 축소하지 않았다.** 아트 불투명도·프레임·검은 텍스트 배경·색상·음향·게임 규칙을 변경하지 않았다.
- 후보의 문자 매핑 12,505개를 검사했다. 선택된 실제 카드·챔피언의 한글·영문·숫자는 포함된다. `U+2212` 수학용 마이너스 `−`는 후보에 없어 Noto Sans KR로 보완된다. 글리프 검증과 원본 이미지 해시는 [font-validation.json](font-validation.json), 폰트 파일 버전·해시는 `qa/retro-font/font-manifest.json`에 기록했다.

## 실행 결과

기술적 통과와 시각적 승인 여부를 분리한다. [전체 브라우저 결과](browser-results.json).

| 검사                                                                    | 실제 실행 결과                                                     |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 프런트엔드 타입 검사                                                    | PASS                                                               |
| QA 진입점 별도 타입 검사                                                | PASS                                                               |
| Vite 프런트엔드 빌드                                                    | PASS                                                               |
| 5개 장면 × 3개 폰트 안 × 5개 화면 크기                                  | **75개 렌더 조합 기술 검사 PASS**                                  |
| 상세 팝업 3 + 감정표현 3 + DPR/확대 18 + 리뷰 페이지 1 + 일반 앱 격리 1 | **26개 보조 확인 PASS**                                            |
| 피해 숫자·턴 안내                                                       | **3개 추가 렌더 PASS**                                             |
| 검토 페이지 안 실제 iframe 렌더링                                       | 모바일·데스크톱 × 5개 장면, **10개 추가 확인 PASS**                |
| 게임 상태                                                               | 75개 조합의 상태 SHA-256 동일                                      |
| 아트·프레임·불투명도·로고                                               | 각 해상도의 세 안에서 동일                                         |
| 공격·소환·챔피언·턴 종료·정보 버튼 영역                                 | 세 안의 위치·크기 차이 1px 이하                                    |
| QA 페이지 가로 넘침·누락 이미지·브라우저 JS 오류                        | 없음                                                               |
| 무단 외부 API·운영 쓰기 요청                                            | 없음. API 경로는 QA 문서 내부의 읽기 전용 fixture transport만 사용 |
| 실제 스마트폰                                                           | **미실행**. Chromium 모바일 에뮬레이션                             |
| 시각적 최종 승인                                                        | **대기**. 승인된 효과 생략과 비의도적 이름 잘림을 구분             |
| main 병합·Render 배포                                                   | **미실행 / 금지 유지**                                             |

뷰포트: **360×740, 375×812, 390×844, 412×915, 1440×900**. 추가 DPR **1·2·3**, CDP visual viewport 확대 **100%·125%·150%**. 실제 Safari·Android 기기에서의 글꼴 선명도나 데스크톱 브라우저 자체의 네이티브 줌을 검증했다고 주장하지 않는다.

### 시각적 실패와 승인 시 판단할 점

- 최초 비교에서는 효과와 이름의 잘림이 29개 조합에 있었다. 이후 사용자 요청에 따라 긴 효과는 프레임에 맞는 길이로 줄이고 **문장 끝에 `....`을 직접 붙여 가운데 정렬**하는 미리보기 정책을 적용했다.
- 생략 표시의 검은 배경을 제거했다. 별도 점 요소와 오른쪽 여백을 제거했다. 문장 자체의 끝에 `....`을 붙여 전체를 가운데 정렬하며, 점 전용 배경은 없다.
- 카드 프레임의 너비·높이와 폰트에 맞춰 표시 줄 수를 다시 계산한다. 모든 카드에 2줄/3줄을 강제하지 않는다. 넘치지 않는 짧은 효과에는 점을 표시하지 않는다.
- 카드 이미지의 원본 React DOM·게임 상태는 유지한다. QA 전용 형제 요소에 실제 `CardRulesText`로 생략 문구와 키워드를 렌더링하며 실제 `CardDetailDialog`의 별도 전체 효과 문단은 원문과 일치하는 것을 검사했다. 확대된 카드 이미지 안의 문구도 틀을 넘치면 생략하되, 정보창의 전체 설명 문단은 생략하지 않는다.
- 갱신한 75개 렌더 조합에는 **19개 시각적 실패 관찰**이 남았다. Before 9개에는 기존 효과/이름 잘림이, 후보 10개에는 이름 잘림만 있다. 후보 효과의 의도적인 생략은 실패 수에서 제외해 별도 `intentionalTruncations`로 기록했다. 카드 이름의 작은 글씨 문제까지 해결했다고 주장하지 않는다.
- 추가로 **10개 해상도·폰트 조합**에서 긴 효과의 `....`, 카드 틀 경계, 짧은 효과의 생략 없음, 정보창 원문 보존을 확인했다. 실제 전투의 효과 영역 경계도 검사했다. 결과: [ellipsis-results.json](ellipsis-results.json). 키워드 정보창과 1440→360→390 크기 변경 후 정렬·원문 보존도 확인했다: [inline-interaction-results.json](inline-interaction-results.json).
- 기존 컴포넌트의 작은 카드 이름과 일부 HUD 글씨는 여전히 작은 크기다. 특히 6–9px에서 픽셀 폰트의 판독성을 **시각적으로 합격 처리하지 않는다**. DPR 확대 캡처를 포함했지만 사용자 눈으로 확인해야 한다.
- 분리된 16px 장문 본문은 가로 넘침 없이 렌더링했다. 작은 카드의 전체 효과는 실제 상세 팝업에서 확인할 수 있다.
- **권장 검토 방향은 HYBRID**지만 확정하지 않는다. 작은 프레임의 장문은 승인된 생략 방식으로 처리했다. 작은 이름의 가독성 정책은 추가 검토가 필요하다. 이번 단계에서 프레임을 재설계하지 않는다.

## 데이터와 운영 영향의 한계

- 카드 6종: 데헌, 매드 사이언티스트 퍼플레인, 좀비 플래티넘구슬 마스터, 침묵의 장막, 태그 체인지, 발단. 짧고 긴 이름·효과, 선수·주문·비용·ATK/HP를 포함한다.
- 챔피언 2종: 퍼플레인, 라 칼라베라. `20261014-predeploy-admin`의 공개 콘텐츠만 선택했다. 운영 관리자 최신 변경분을 다시 읽었다고 주장하지 않는다.
- 작업 시 운영 API GET이 503을 반환했다. 카드·챔피언 아트는 이전 읽기 전용 검사에서 보관한 원본 8개를 사용하고 기록된 SHA-256과 다시 대조했다.
- 운영 커스텀 프레임과 메뉴 배경은 새로 다운로드할 수 없었다. **실제 main 컴포넌트의 저장소 기본 프레임·기본 메뉴 배경**으로 세 안을 통일했다. 따라서 현재 운영의 커스텀 배경·프레임과 픽셀 단위로 동일한 Before는 미검증이다.
- 메뉴 공지와 타워 대사는 저장소의 보관 fixture를 사용했다. 계정·구매·보상·인증정보는 복사하지 않았다. 가상 메뉴 사용자는 로컬 예제이며 로그인하지 않는다.
- Supabase·운영 계정·관리자 데이터·Render 설정에 쓰기 작업 없음. 전역 폰트·프로덕션 컴포넌트·게임 엔진·로그인 코드 변경 없음.
- 프로덕션 빌드의 진입 JS `index-BXjduKqJ.js`, CSS `index-DqD5vykk.css`는 기준 main과 동일하다. `dist/public`에 QA 문서나 후보 WOFF2가 포함되지 않는다.
- 진행 중이던 모바일 수정은 `fix/mobile-deck-remove-inspection`의 WIP 커밋 `d4438e0`에 별도 보존했다. 흑구슬 마스터 효과 변경과 모바일 수정은 이 폰트 브랜치에 혼합하지 않았다.

## 변경 파일

| 파일                                                                   | 목적                                                    |
| ---------------------------------------------------------------------- | ------------------------------------------------------- |
| `artifacts/ko-game/qa/retro-font-review.html`, `retro-font-scene.html` | 개발 전용 검토 진입점                                   |
| `qa/retro-font/review.tsx`, `review.css`                               | 동일 해상도의 세 안 비교, 화면·크기·피해/턴 안내 선택   |
| `qa/retro-font/compact-rules-preview.tsx`                              | QA 범위의 반응형 효과 생략. 운영 CardRenderer 수정 없음 |
| `qa/retro-font/scene.tsx`                                              | 실제 게임 컴포넌트와 로컬 읽기 전용 fixture             |
| `qa/retro-font/typography.css`                                         | QA 문서에서만 폰트 변수·Regular·본문 예외 적용          |
| `qa/retro-font/fixtures.json`                                          | 공개 카드·챔피언·메뉴·타워 표시 데이터                  |
| `qa/retro-font/assets/`, `font-manifest.json`                          | 고정 WOFF2·OFL 고지·검증된 원본 아트                    |
| `qa/retro-font/tsconfig.json`                                          | 프로덕션에서 제외된 QA 진입점의 별도 타입 검사          |
| `docs/qa/retro-font-preview-*.mjs`, `*-export.py`                      | 브라우저 검사·PNG·ZIP 재생성                            |
| 이 폴더의 보고서·JSON·PNG                                              | 승인용 증거와 실제 실패 기록                            |
