# Scouty 프로덕션 배포

Scouty는 자동 CD를 운영하지 않는다. GitHub Actions는 PR의 `CI` 검사만 수행하고 production 배포는 운영자가 로컬에서 Wrangler로 명시적으로 실행한다.

자동·수동 배포 모두 `db:seed`를 포함하지 않는다. 역할 seed는 최초 PostgreSQL 구성 또는 운영 역할 변경 시에만 별도로 실행한다.

## 사전 조건

- Wrangler가 Hyunhomon Cloudflare account에 로그인되어 있어야 한다.
- Cloudflare Workers Paid plan이 활성화되어 Containers를 배포할 수 있어야 한다.
- Docker Desktop이 실행 중이어야 한다. API 배포 시 PDF 처리 Container 이미지를 빌드한다.
- production PostgreSQL을 먼저 만들고 `DATABASE_URL`에 직접 연결 문자열을 설정한다.
- PostgreSQL을 가리키는 Hyperdrive config를 만든 뒤 `apps/api/wrangler.jsonc`에 production `HYPERDRIVE` binding을 추가한다.
- `scouty-assets`용 R2 S3 API token을 만들고 access key와 secret key를 준비한다.
- `scouty-api` Worker runtime secret이 등록되어 있어야 한다.

| 이름                   | 용도                                     |
| ---------------------- | ---------------------------------------- |
| `GOOGLE_CLIENT_ID`     | Google OAuth client ID                   |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret               |
| `OAUTH_STATE_SECRET`   | OAuth state 서명 secret                  |
| `R2_ACCESS_KEY_ID`     | R2 S3 signed URL 발급과 Container 업로드 |
| `R2_SECRET_ACCESS_KEY` | R2 S3 signed URL 발급과 Container 업로드 |

## 배포 순서

저장소 루트에서 다음 순서로 실행한다.

```powershell
$env:CLOUDFLARE_ACCOUNT_ID = "d09b11497e0618d6dceff0559855a7b2"
bun run db:generate
bun run lint
bun run typecheck
bun run test
bun run build
bun run test:e2e
bun run db:deploy
bunx wrangler d1 migrations apply scouty-edge --remote --config apps/api/wrangler.jsonc
bun run deploy:api
bun run deploy:web
```

PostgreSQL과 D1 migration을 먼저 적용하고 API Worker·Container를 배포한 뒤 기존 `scouty-web` Pages Direct Upload 프로젝트를 갱신한다. `greeney.life` custom domain은 현재 프로젝트 연결을 그대로 유지한다.

## 배포 확인

```powershell
curl.exe --fail https://api.greeney.life/ready
curl.exe --fail https://api.greeney.life/docs
curl.exe --fail https://greeney.life
```

`/ready`는 PostgreSQL, D1, R2, OAuth, R2 signing, Queue가 모두 준비된 경우에만 `200`을 반환한다.

## 복구

- API 배포 실패: Pages를 배포하지 않고 마지막 성공 Worker version을 유지한다.
- Pages 배포 실패: API는 유지하고 `bun run deploy:web`만 재실행한다.
- D1 projection 오류: scheduled handler의 전체 rebuild를 실행한다.
- seed 오류: 자동 재시도하지 않고 대상 역할과 기존 slug를 확인한 뒤 수동 재실행한다.
