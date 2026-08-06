# Scouty 프로덕션 배포

PR에서는 `CI` workflow만 실행한다. `main`에 반영되면 별도의 `CD` workflow가 같은 커밋을 다시 검증하고, `check` job이 성공한 경우에만 `deploy` job으로 이어서 배포한다. 장애 복구나 최초 배포에서는 `main`의 `CD` workflow를 수동 실행할 수 있다. 자동·수동 배포 모두 production만 대상으로 한다.

## GitHub production environment

`production` environment에 다음 secret을 등록한다.

| 이름 | 용도 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Workers, Pages, D1 배포 권한을 최소 범위로 가진 token |
| `DATABASE_URL` | migration 전용 PostgreSQL 직접 연결 문자열 |

Cloudflare account ID는 공개 식별자이므로 workflow와 Wrangler config에 Hyunhomon account ID를 고정한다.

Worker runtime secret은 Wrangler로 관리한다.

| 이름 | 용도 |
|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `OAUTH_STATE_SECRET` | OAuth state 서명용 고엔트로피 secret |
| `R2_ACCESS_KEY_ID` | R2 S3 signed URL 발급과 Container 업로드 |
| `R2_SECRET_ACCESS_KEY` | R2 S3 signed URL 발급과 Container 업로드 |

```powershell
bunx wrangler secret put GOOGLE_CLIENT_ID --config apps/api/wrangler.jsonc
```

나머지 secret도 같은 명령으로 등록한다. 값은 저장소나 GitHub 로그에 기록하지 않는다.

## 순서

```text
CI 성공
→ PostgreSQL migration
→ D1 migration
→ API Worker
→ Astro build
→ Cloudflare Pages
→ API readiness·Swagger·웹 smoke test
```

스키마가 구버전 API와 호환되도록 expand migration을 먼저 적용한다. 자동 배포에서는 `db:seed`를
실행하지 않는다. 역할 seed는 최초 환경 구성 또는 운영 역할 변경 작업에서만 명시적으로 실행한다.

## 최초 환경 구성

1. Workers Paid plan과 GitHub Actions에서 Docker image를 빌드할 수 있는지 확인한다.
2. PostgreSQL을 생성하고 TLS 직접 연결 문자열을 준비한다.
3. Hyperdrive를 생성한 뒤 발급된 ID로 `HYPERDRIVE` binding을 `apps/api/wrangler.jsonc`에 추가한다.
4. `bun run db:deploy`와 `bun run db:seed`를 한 번 실행한다. 이후 자동 배포는 migration만 실행한다.
5. Queue를 준비한다.

   ```powershell
   bunx wrangler queues create scouty-portfolio-processing --config apps/api/wrangler.jsonc
   bunx wrangler queues create scouty-portfolio-processing-dlq --config apps/api/wrangler.jsonc
   ```

6. 비공개 `scouty-assets` R2 bucket과 S3 API token을 준비한다.
7. Google OAuth redirect URI에 `https://api.greeney.life/v1/auth/google/callback`을 등록한다.
8. Worker runtime secret과 GitHub production secret을 등록한다.
9. GitHub의 `CD` workflow를 `main`에서 수동 실행하고 `check`와 `deploy`가 모두 성공하는지 확인한다.

Hyperdrive ID는 외부 PostgreSQL 인스턴스가 정해져야 생성할 수 있으므로 placeholder를 커밋하지 않는다. 이 binding이 없으면 Worker는 공개 D1 탐색만 제공하고 PostgreSQL 기반 기능 및 `/ready`는 준비되지 않은 상태로 응답한다.

## 복구

- API 배포 실패: Pages를 배포하지 않고 마지막 Worker version을 유지한다.
- Pages 배포 실패: API는 하위 호환 계약을 유지하며 Pages workflow만 재실행한다.
- D1 projection 오류: 매일 실행되는 전체 rebuild를 기다리거나 Worker의 scheduled handler를 수동 실행한다.
- seed 오류: 자동 재시도하지 않고 대상 역할과 기존 slug를 확인한 뒤 수동 재실행한다.
