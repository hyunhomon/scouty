# Scouty 개발 기준

| 항목 | 내용 |
|---|---|
| 패키지 관리 | Bun workspace |
| 포맷·린트 | Biome |
| 테스트 | Vitest, Workers Vitest pool, Playwright, axe-core |

구조나 명령을 바꾸면 이 문서와 CI를 함께 갱신한다.

## 저장소 구조

```text
scouty/
├─ apps/
│  ├─ web/             # Astro static Pages app
│  └─ api/             # Elysia Worker, D1 migrations, Container
├─ packages/
│  └─ db/              # Prisma D1 schema and generated client
├─ docs/
├─ package.json
└─ bun.lock
```

## 공통 명령

| 명령 | 역할 |
|---|---|
| `bun run dev` | Web과 API 병렬 실행 |
| `bun run db:generate` | Prisma D1 client 생성 |
| `bun run db:migrate` | 모든 D1 migration을 로컬 Wrangler DB에 적용 |
| `bun run db:deploy` | 미적용 D1 migration을 production에 적용 |
| `bun run cf:typegen` | Wrangler binding 타입 생성 |
| `bun run lint` | Biome 검사 |
| `bun run format` | Biome 포맷 적용 |
| `bun run typecheck` | Astro·TypeScript 검사 |
| `bun run test` | 전체 단위 테스트 |
| `bun run test:integration` | workerd + 격리 D1에서 상태 전이·동시성·제약 검사 |
| `bun run test:e2e` | production build 기반 Chromium E2E·접근성 검사 |
| `bun run build` | Web과 API production build |

별도 `db:seed`는 없다. 모든 환경에 필요한 역할 taxonomy는 migration에 포함한다.

## 코드 경계

- route는 HTTP 계약, service는 비즈니스 규칙, client/repository는 저장소 접근을 담당한다.
- TypeScript strict mode를 사용하고 외부 입력은 검증 전까지 `unknown`으로 취급한다.
- 사용자에게 안정된 오류 코드와 안전한 문구만 반환한다.
- 로그와 분석 이벤트에 secret, OAuth token, signed URL, 메시지 본문, 자유 텍스트를 남기지 않는다.
- 브라우저 bundle에 서버 전용 패키지를 포함하지 않는다.
- 새 의존성은 브라우저, Bun, workerd 중 실행 위치와 제거 기준을 확인한다.

## D1 변경 규칙

- Prisma schema 변경과 Wrangler D1 migration을 함께 커밋한다.
- migration은 `apps/api/d1/migrations/NNNN_name.sql`에 추가한다.
- 이미 production에 적용된 migration을 수정하거나 번호를 재사용하지 않는다.
- Prisma가 표현하지 못하는 CHECK, partial index, release data를 migration SQL에 명시한다.
- 데이터 손실 가능 변경은 expand → backfill → contract 순서로 나눈다.
- D1 Prisma adapter의 callback형 트랜잭션은 원자적이지 않다. 동시성 규칙은 DB 제약으로 막고, 원자적 다중 쓰기는 native `DB.batch()`를 사용한다.
- R2 object와 DB metadata를 함께 바꿀 때는 부분 실패 복구 순서를 테스트한다.

## 테스트 전략

| 종류 | 검증 대상 |
|---|---|
| 단위 | 순수 규칙, validator, formatter, service 오류 코드 |
| 컴포넌트 | 상태 렌더링, 키보드 조작, accessible name |
| D1 통합 | 실제 migration, Prisma D1 adapter, unique/CHECK, 중복 요청 |
| Worker runtime | workerd 호환성, D1·R2 binding |
| E2E | production build의 핵심 흐름, 반응형, 접근성, 보안 헤더 |

오류 경로와 재시도·중복 요청을 정상 경로와 같은 중요도로 테스트한다. flaky test는 재시도로 숨기지 않는다.

## Git과 완료 기준

- 기능 작업은 분리된 branch와 PR로 진행한다.
- commit message는 Conventional Commits를 사용한다.
- PR은 제품 요구, 실패·동시성, 접근성, 개인정보, migration 영향을 순서대로 검토한다.
- 완료 전 lint, typecheck, test, D1 integration, build, E2E를 통과시킨다.
- 새로운 secret, binding, migration과 운영 복구 절차를 문서화한다.
