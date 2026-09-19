# KO

React와 TypeScript로 만든 브라우저 카드게임 KO의 엔진 중심 프로토타입입니다.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/db run migrate:storage` — run the Replit-to-Supabase asset migration in DRY RUN mode
- Required env: `DATABASE_URL` — Postgres connection string
- Storage env: `STORAGE_PROVIDER=replit` for Preview, or `STORAGE_PROVIDER=supabase` with server-only `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `SUPABASE_STORAGE_BUCKET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/ko-game/src/game/` — UI와 분리된 직렬화 가능 게임 도메인 모델
- `artifacts/ko-game/src/components/` — React 화면 컴포넌트
- `artifacts/ko-game/src/game/engine/create-initial-game-state.ts` — 초기 게임 상태 생성

## Architecture decisions

- 카드 원본 정의와 플레이 중 카드 인스턴스를 분리하며, 인스턴스는 고유 `instanceId`를 가진다.
- 보드는 정확히 4칸인 튜플이고 빈칸은 `null`이다.
- 게임 상태에는 함수, 클래스 인스턴스, Map, Set을 넣지 않아 JSON 직렬화를 유지한다.

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

- 단계는 1번부터 순서대로 하나씩 구현하고 다음 단계 기능을 미리 추가하지 않는다.
- 기존 정상 코드는 불필요하게 리팩터링하지 않으며 단계별 핵심 기능만 테스트한다.

## Gotchas

- Storage migration is read-only unless `APPLY_STORAGE_MIGRATION=YES` is set; it never deletes Replit objects or changes either database.
- Keep `SUPABASE_SECRET_KEY` in the API server environment only; never expose it to the frontend bundle.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
