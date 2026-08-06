# Scouty 개발 기준

| 항목 | 내용 |
|---|---|
| 상태 | 스캐폴딩 목표 계약 |
| 패키지 관리 | Bun workspace |
| 포맷·린트 | Biome |
| 테스트 | Vitest, Workers Vitest pool |

이 문서의 명령과 디렉터리는 다음 스캐폴딩에서 구현할 목표다. 실제 구조가 생긴 뒤 실행 결과와 함께 갱신한다.

## 1. 목표 구조

```text
scouty/
├─ apps/
│  ├─ web/             # Astro static Pages app
│  └─ api/             # Elysia Cloudflare Worker
├─ packages/
│  └─ db/              # Prisma schema, client, migrations, seed
├─ docs/
├─ compose.yaml
├─ biome.json
├─ package.json
├─ tsconfig.base.json
└─ bun.lock
```

- 공유한다는 이유만으로 package를 만들지 않는다.
- 두 곳 이상에서 실제로 재사용되고 독립된 책임이 있을 때만 package로 분리한다.
- UI 컴포넌트는 소비자가 하나인 동안 `apps/web` 안에 둔다.
- 프론트가 API 타입을 가져올 때 runtime 코드를 포함하지 않도록 `import type`을 사용한다.

## 2. 목표 명령

| 명령 | 역할 |
|---|---|
| `bun run infra:up` | 로컬 PostgreSQL 시작 |
| `bun run infra:down` | 컨테이너 종료, volume 유지 |
| `bun run dev` | web과 api 병렬 실행 |
| `bun run db:generate` | Prisma client 생성 |
| `bun run db:migrate` | 로컬 migration 생성·적용 |
| `bun run db:deploy` | 기존 migration 적용 |
| `bun run db:seed` | 역할 seed idempotent 실행 |
| `bun run cf:typegen` | Wrangler binding 타입 생성 |
| `bun run lint` | Biome 검사 |
| `bun run format` | Biome 포맷 적용 |
| `bun run typecheck` | Astro·TypeScript·Prisma 검사 |
| `bun run test` | 전체 테스트 |
| `bun run build` | web과 api production build |

`dev`, `test`, `build`는 루트에서 workspace filter를 사용한다. 앱 디렉터리 이동을 요구하는 명령은 예외적인 운영 명령으로 제한한다.

## 3. 코드 원칙

### 공통

- TypeScript strict mode를 사용한다.
- 외부 경계의 입력은 `unknown`으로 보고 검증 후 사용한다.
- `any`, non-null assertion, 무의미한 type assertion을 피한다.
- 상태와 도메인 용어는 PRD의 이름을 사용한다.
- boolean 이름은 `is`, `has`, `can`, `should`로 의미를 드러낸다.
- 시간은 DB에서 UTC로 저장하고 UI에서 사용자 locale로 표현한다.
- 돈·온도·비율처럼 정밀도가 필요한 값에 부동소수점 가정을 하지 않는다.

### 의존성

- 표준 API나 기존 의존성으로 충분한지 먼저 확인한다.
- 브라우저 bundle에 서버 전용 패키지가 들어가지 않게 한다.
- Workers 호환성, ESM 지원, 유지보수 상태를 확인한다.
- 새 의존성의 역할과 제거 기준을 PR 설명에 남긴다.
- lockfile 변경은 의존성 변경과 함께 검토한다.

## 4. Frontend 기준

- Astro를 기본으로 사용하고 상호작용이 필요한 최소 영역만 React island로 만든다.
- shadcn/ui 컴포넌트는 복사된 소스이므로 제품 요구에 맞게 수정하되 공통 variant를 우선한다.
- hex, spacing, radius를 JSX에 직접 쓰지 않고 디자인 토큰을 사용한다.
- 페이지는 로딩·빈 상태·오류·성공·권한 없음 상태를 함께 구현한다.
- 모든 비동기 버튼은 중복 실행, 로딩 라벨, 오류 복구를 고려한다.
- 아이콘 버튼은 tooltip과 accessible name을 제공한다.
- 사용자에게 보이는 문구는 [UX 라이팅](./UX_WRITING.md)을 따른다.
- 접근성 완료 기준은 [접근성](./ACCESSIBILITY.md)을 따른다.

## 5. API 기준

- route는 HTTP 계약, service는 비즈니스 규칙, repository/client는 외부 저장소 접근을 담당한다.
- Elysia route schema로 params, query, body, response를 검증한다.
- 성공과 실패 응답은 일관된 JSON envelope를 사용하되 HTTP status 의미를 가리지 않는다.
- 인증되지 않음과 권한 없음을 구분한다.
- 목록은 안정된 cursor와 deterministic order를 가진다.
- mutation은 예상 현재 상태를 검증하고 충돌 시 `409`를 사용한다.
- 로그에 secret, 메시지 본문, signed URL, OAuth token을 포함하지 않는다.
- public API contract 변경은 Eden client typecheck와 통합 테스트를 함께 수정한다.

## 6. 데이터베이스 기준

- Prisma schema 변경은 migration과 함께 커밋한다.
- 적용된 migration 파일을 수정하지 않고 새 migration으로 변경한다.
- 데이터 손실 가능성이 있는 migration은 expand → migrate data → contract 단계로 나눈다.
- Prisma가 표현하지 못하는 partial index와 check constraint는 migration SQL과 테스트로 보존한다.
- 여러 사용자가 공유하는 seed는 idempotent upsert로 작성한다.
- D1 데이터는 원본이 아니며 PostgreSQL에서 재생성 가능해야 한다.
- R2 object 삭제와 DB metadata 삭제는 실패 복구 순서를 명시한다.

## 7. 테스트 전략

| 종류 | 검증 대상 |
|---|---|
| 단위 | 순수 도메인 규칙, formatter, validator |
| 컴포넌트 | 상태 렌더링, 키보드 조작, accessible name |
| API 통합 | route schema, 권한, 상태 전이, 오류 코드 |
| DB 통합 | migration, transaction, unique/check constraint |
| Worker runtime | workerd 호환성, D1·R2 binding |
| E2E | PRD의 핵심 사용자 흐름 |

- 테스트는 구현 세부사항보다 사용자가 관찰하는 결과를 검증한다.
- 시간, UUID, 외부 네트워크는 제어 가능한 dependency로 둔다.
- 오류 경로와 재시도·중복 요청을 정상 경로와 같은 중요도로 테스트한다.
- flaky test는 재시도 횟수로 숨기지 않고 원인을 제거한다.

## 8. Git과 리뷰

- branch 이름은 `codex/`, `feat/`, `fix/`, `docs/`, `chore/` 중 작업 성격에 맞게 사용한다.
- commit은 하나의 검토 가능한 의도를 가진다.
- commit message는 Conventional Commits 형식을 사용한다.
- 생성 파일, 포맷 변경, 기능 변경을 가능하면 구분한다.
- 사용자 변경이 있는 작업은 PRD·디자인·라이팅·접근성 영향 여부를 PR에 적는다.

리뷰 순서:

1. 제품 요구와 권한이 맞는가?
2. 실패·동시성·재시도에서 데이터가 안전한가?
3. 사용자가 상태와 다음 행동을 이해하는가?
4. 접근성과 개인정보 기준을 지켰는가?
5. 코드가 책임별로 읽히고 테스트 가능한가?

## 9. 완료 정의

기능은 다음을 모두 만족해야 완료다.

- [ ] PRD의 인수 조건과 권한 규칙을 만족한다.
- [ ] 정상·로딩·빈 상태·오류·재시도 상태가 구현됐다.
- [ ] 관련 단위·통합 테스트가 추가됐다.
- [ ] lint, typecheck, test, production build가 통과한다.
- [ ] 키보드와 최소 한 가지 스크린 리더 흐름을 확인했다.
- [ ] 로그와 분석 이벤트에 개인정보·자유 텍스트가 포함되지 않는다.
- [ ] 새로운 환경 변수·binding·migration이 문서화됐다.
- [ ] 제품 결정이 바뀌었다면 관련 문서를 함께 갱신했다.

## 10. 문서화 기준

- 코드가 `무엇`을 하는지는 타입과 테스트로 설명하고, 주석은 `왜`를 설명한다.
- 운영자가 알아야 할 실패 복구 절차는 runbook으로 남긴다.
- 큰 구조 결정은 ADR로 기록한다.
- 임시 workaround에는 제거 조건과 추적 이슈를 남긴다.
- 문서에서 실행 명령을 제시하면 CI 또는 수동 검증으로 동작을 확인한다.
