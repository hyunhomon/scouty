# Scouty 프로덕션 배포

Scouty는 자동 CD를 운영하지 않는다. GitHub Actions는 CI만 수행하고 production 배포는 운영자가 로컬에서 Wrangler로 실행한다. 배포 중 seed는 실행하지 않는다.

## 사전 조건

- Wrangler가 Hyunhomon Cloudflare account에 로그인되어 있어야 한다.
- Workers Paid plan과 Containers가 활성화되어 있어야 한다.
- API 배포 시 Container 이미지를 빌드할 Docker Desktop이 실행 중이어야 한다.
- `scouty-edge` D1, `scouty` R2, Queue, Durable Objects가 `apps/api/wrangler.jsonc`에 연결되어 있어야 한다.
- Google OAuth redirect URI는 `https://api.greeney.life/v1/auth/google/callback`이어야 한다.

### Worker secrets

| 이름 | 용도 |
|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `OAUTH_STATE_SECRET` | OAuth state 서명 |
| `R2_ACCESS_KEY_ID` | R2 signed URL 발급 |
| `R2_SECRET_ACCESS_KEY` | R2 signed URL 발급 |

R2 key는 Workers 설정의 General API Routes에서 만들지 않는다. Cloudflare Dashboard의 **Storage & databases → R2 object storage → Overview → Account Details → API Tokens → Manage**에서 `scouty` 범위의 Object Read & Write token을 만든다. 생성 결과의 Access Key ID와 Secret Access Key를 아래 명령에 각각 입력한다.

```powershell
bunx wrangler secret put R2_ACCESS_KEY_ID --config apps/api/wrangler.jsonc
bunx wrangler secret put R2_SECRET_ACCESS_KEY --config apps/api/wrangler.jsonc
```

## 배포 순서

저장소 루트에서 실행한다.

```powershell
bun install
bun run db:generate
bun run lint
bun run typecheck
bun run test
bun run test:integration
bun run build
bun run test:e2e
bun run db:deploy
bun run deploy:api
bun run deploy:web
```

`db:deploy`는 미적용 D1 migration만 production `scouty-edge`에 적용한다. 역할 taxonomy는 migration에 포함되므로 별도 seed가 없다. API가 성공한 뒤 기존 `scouty-web` Pages Direct Upload 프로젝트를 갱신하며 `greeney.life` custom domain 연결은 유지한다.

## 배포 확인

```powershell
curl.exe --fail https://api.greeney.life/ready
curl.exe --fail https://api.greeney.life/docs
curl.exe --fail https://greeney.life
```

`/ready`는 D1 canonical schema, R2, OAuth, R2 signing, Queue가 모두 준비된 경우에만 `200`을 반환한다.

## 복구

- D1 migration 실패: API를 배포하지 않고 실패 SQL을 새 migration으로 교정한다. 적용된 migration은 수정하지 않는다.
- API 배포 실패: Web을 배포하지 않고 마지막 성공 Worker version을 유지한다.
- Pages 배포 실패: API는 유지하고 `bun run deploy:web`만 재실행한다.
- projection 오류: scheduled rebuild로 같은 D1의 canonical 데이터에서 공개 탐색 projection을 다시 만든다.
- Container 실패: Queue 재시도와 dead-letter queue를 확인하고 원본 R2 object를 보존한다.

## Cloudflare GitHub App 제거

Cloudflare의 GitHub check가 필요 없으면 GitHub **Settings → Applications → Installed GitHub Apps → Cloudflare Workers and Pages → Configure**에서 `Only select repositories`를 선택하고 `scouty` 접근을 제거한다. 다른 저장소에서도 사용하지 않으면 같은 화면 아래의 `Uninstall`로 앱 자체를 제거한다.
