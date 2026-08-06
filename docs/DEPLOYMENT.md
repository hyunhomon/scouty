# Scouty 프로덕션 배포

Scouty의 CD 주체는 Cloudflare Workers Builds다. GitHub Actions는 PR의 `CI` 검사만 수행한다.

`main` push를 감지한 Cloudflare 빌드가 저장소 루트에서 검증과 빌드를 마친 뒤 Wrangler로 다음 작업을 연속 실행한다.

```text
Cloudflare Workers Builds
→ PostgreSQL migration
→ D1 migration
→ scouty-api Worker·Container 배포
→ 기존 scouty-web Pages Direct Upload 배포
```

프런트엔드는 새 Pages 프로젝트를 만들지 않는다. 현재 `greeney.life`가 연결된 `scouty-web`을 그대로 유지하고 Workers Builds의 Wrangler 명령으로 갱신한다.

자동 배포에서 `db:seed`는 실행하지 않는다. 역할 seed는 최초 PostgreSQL 구성 또는 운영 역할 변경 시에만 명시적으로 실행한다.

## Workers Builds 설정

Cloudflare Dashboard의 `scouty-api`에서 **Settings → Build → Connect to Git**으로 `hyunhomon/scouty`를 연결한다.

| 설정 | 값 |
|---|---|
| Production branch | `main` |
| Root directory | `/` |
| Build command | `bun run cf:build` |
| Deploy command | `bun run cf:deploy` |
| Non-production branch builds | 비활성화 |

Build variables와 secret:

| 이름 | 종류 | 값/용도 |
|---|---|---|
| `BUN_VERSION` | variable | `1.3.14` |
| `DATABASE_URL` | secret | migration 전용 PostgreSQL 직접 연결 문자열 |

`cf:deploy`는 PostgreSQL과 D1 migration을 적용한 뒤 `wrangler deploy`로 API를 배포하고, 같은 빌드 결과를 `wrangler pages deploy`로 기존 `scouty-web`에 올린다.

Workers Builds token에는 다음 권한이 필요하다.

- Workers Scripts / Edit
- Workers R2 Storage / Edit
- D1 / Edit
- Workers Queues / Edit
- Containers / Edit
- Pages / Edit
- Workers Routes / Edit (`greeney.life` zone)

## Worker runtime 설정

Runtime secret은 Build secret과 별개로 `scouty-api`의 **Settings → Variables & Secrets**에 등록한다.

| 이름 | 용도 |
|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `OAUTH_STATE_SECRET` | OAuth state 서명 secret |
| `R2_ACCESS_KEY_ID` | R2 S3 signed URL 발급과 Container 업로드 |
| `R2_SECRET_ACCESS_KEY` | R2 S3 signed URL 발급과 Container 업로드 |

Build variables에는 `PUBLIC_API_URL=https://api.greeney.life`도 등록한다. 외부 PostgreSQL을 생성한 뒤 Hyperdrive ID를 발급받아 `HYPERDRIVE` binding을 `apps/api/wrangler.jsonc`에 추가한다. placeholder ID는 커밋하지 않는다.

## 최초 환경 구성

1. Workers Paid plan과 Containers 사용 권한을 확인한다.
2. PostgreSQL을 생성하고 TLS 직접 연결 문자열을 준비한다.
3. Hyperdrive를 생성하고 `HYPERDRIVE` binding을 추가한다.
4. `bun run db:deploy`와 `bun run db:seed`를 한 번 실행한다.
5. `scouty-portfolio-processing`, `scouty-portfolio-processing-dlq`, `scouty-assets`, `scouty-edge`, `scouty-web`이 Hyunhomon 계정에 있는지 확인한다.
6. Google OAuth redirect URI에 `https://api.greeney.life/v1/auth/google/callback`을 등록한다.
7. Worker runtime secret을 등록한다.
8. `scouty-api` Workers Builds를 GitHub 저장소에 연결한다.
9. `main` 배포 후 `https://api.greeney.life/ready`, `https://api.greeney.life/docs`, `https://greeney.life`를 확인한다.

## 복구

- Worker build 실패: Cloudflare Builds 로그에서 실패 command를 확인하고 마지막 성공 Worker와 Pages deployment를 유지한다.
- API 배포 후 Pages 배포 실패: Cloudflare build를 재시도한다. Wrangler는 동일 commit의 결과를 다시 업로드한다.
- D1 projection 오류: scheduled handler의 전체 rebuild를 실행한다.
- seed 오류: 자동 재시도하지 않고 대상 역할과 기존 slug를 확인한 뒤 수동 재실행한다.
