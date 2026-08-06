# Scouty 프로덕션 배포

Scouty의 CD 주체는 GitHub Actions가 아니라 Cloudflare다. GitHub Actions는 PR의 `CI` 검사만 수행한다. `main` push 이후 백엔드는 Workers Builds, 프런트엔드는 Pages Git integration이 각각 같은 저장소를 감시해 production으로 배포한다.

자동 배포에서 `db:seed`는 실행하지 않는다. 역할 seed는 최초 PostgreSQL 구성 또는 운영 역할 변경 시에만 명시적으로 실행한다.

## 백엔드: Workers Builds

Cloudflare Dashboard의 `scouty-api`에서 **Settings → Build → Connect to Git**으로 `hyunhomon/scouty`를 연결한다.

| 설정 | 값 |
|---|---|
| Production branch | `main` |
| Root directory | `/` |
| Build command | `bun run cf:build:api` |
| Deploy command | `bun run cf:deploy:api` |
| Non-production branch builds | 비활성화 |

Build variables와 secret:

| 이름 | 종류 | 값/용도 |
|---|---|---|
| `BUN_VERSION` | variable | `1.3.14` |
| `DATABASE_URL` | secret | migration 전용 PostgreSQL 직접 연결 문자열 |

`cf:deploy:api`는 PostgreSQL migration, D1 migration, Worker 배포 순으로 실행한다. D1 migration 권한이 필요하므로 자동 생성 token 대신 아래 권한을 가진 user API token을 Workers Builds에 지정한다.

- Account / Workers Scripts / Edit
- Account / Workers R2 Storage / Edit
- Account / D1 / Edit
- Account / Workers Queues / Edit
- Account / Cloudflare Containers / Edit
- Zone / Workers Routes / Edit (`greeney.life`)

Worker runtime secret은 Build secret과 별개로 `scouty-api`의 **Settings → Variables & Secrets**에 등록한다.

| 이름 | 용도 |
|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `OAUTH_STATE_SECRET` | OAuth state 서명 secret |
| `R2_ACCESS_KEY_ID` | R2 S3 signed URL 발급과 Container 업로드 |
| `R2_SECRET_ACCESS_KEY` | R2 S3 signed URL 발급과 Container 업로드 |

외부 PostgreSQL을 생성한 뒤 Hyperdrive ID를 발급받아 `HYPERDRIVE` binding을 `apps/api/wrangler.jsonc`에 추가한다. placeholder ID는 커밋하지 않는다.

## 프런트엔드: Pages Git integration

현재 `scouty-web`은 Direct Upload 프로젝트다. Cloudflare는 Direct Upload 프로젝트를 Git integration으로 전환할 수 없으므로 새 Git 연동 프로젝트를 만든다.

Cloudflare Dashboard에서 **Workers & Pages → Create application → Pages → Connect to Git**으로 `hyunhomon/scouty`를 연결한다.

| 설정 | 값 |
|---|---|
| Project name | `scouty-web-git` |
| Production branch | `main` |
| Root directory | `/` |
| Build command | `bun run cf:build:web` |
| Build output directory | `apps/web/dist` |
| Preview deployments | 활성화 |

Build variables:

| 이름 | 값 |
|---|---|
| `BUN_VERSION` | `1.3.14` |
| `PUBLIC_API_URL` | `https://api.greeney.life` |

첫 production 배포가 성공하면 새 프로젝트에 `greeney.life`를 연결한다. 기존 `scouty-web`의 custom domain은 새 프로젝트가 준비된 직후 제거해 전환 시간을 최소화한다. 새 도메인이 `active`이고 최신 `main` commit을 가리키는 것을 확인한 뒤 기존 Direct Upload 프로젝트를 제거한다.

## 최초 환경 구성

1. Workers Paid plan과 Containers 사용 권한을 확인한다.
2. PostgreSQL을 생성하고 TLS 직접 연결 문자열을 준비한다.
3. Hyperdrive를 생성하고 `HYPERDRIVE` binding을 추가한다.
4. `bun run db:deploy`와 `bun run db:seed`를 한 번 실행한다.
5. `scouty-portfolio-processing`, `scouty-portfolio-processing-dlq`, `scouty-assets`, `scouty-edge`가 Hyunhomon 계정에 있는지 확인한다.
6. Google OAuth redirect URI에 `https://api.greeney.life/v1/auth/google/callback`을 등록한다.
7. Worker runtime secret을 등록한다.
8. Workers Builds와 Pages Git integration을 연결한다.
9. `main` 배포 후 `https://api.greeney.life/ready`, `https://api.greeney.life/docs`, `https://greeney.life`를 확인한다.

## 복구

- Worker build 실패: Cloudflare Builds 로그에서 실패 command를 확인하고 마지막 성공 version을 유지한다.
- Pages build 실패: 마지막 성공 Pages deployment가 계속 production을 제공한다.
- D1 projection 오류: scheduled handler의 전체 rebuild를 실행한다.
- seed 오류: 자동 재시도하지 않고 대상 역할과 기존 slug를 확인한 뒤 수동 재실행한다.
