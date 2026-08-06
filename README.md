# Scouty

프로젝트 결과물을 먼저 보고 팀원을 발견하는 대학생 팀빌딩 서비스다.

제품과 개발 기준은 [문서 인덱스](./docs/README.md)에서 확인한다.

## 기술 구성

- Bun workspaces
- Astro + React + shadcn/ui on Cloudflare Pages
- Elysia on Cloudflare Workers
- Prisma + PostgreSQL through Hyperdrive
- Cloudflare D1 for future edge read models
- Cloudflare R2 for private assets

## 로컬 실행

필수 도구는 Bun `1.3.14` 이상과 Docker다.

```bash
bun install
Copy-Item packages/db/.env.example packages/db/.env
bun run infra:up
bun run db:generate
bun run db:deploy
bun run db:seed
bun run dev
```

- Web: `http://localhost:4321`
- API: `http://localhost:8787`
- PostgreSQL: `localhost:5432`

Windows가 아니라면 환경 파일 복사 명령을 `cp packages/db/.env.example packages/db/.env`로 바꾼다.

## 검사

```bash
bun run lint
bun run typecheck
bun run test
bun run build
```

## Cloudflare 배포 준비

각 앱의 `wrangler.jsonc`에 있는 placeholder를 실제 Pages·Worker·D1·R2·Hyperdrive 리소스 값으로 교체한 뒤 배포한다. 원격 리소스 생성과 secret 등록은 자동으로 수행하지 않는다.
