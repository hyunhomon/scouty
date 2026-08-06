# Scouty

프로젝트 결과물을 먼저 보고 팀원을 발견하는 대학생 팀빌딩 서비스다.

제품과 개발 기준은 [문서 인덱스](./docs/README.md)에서 확인한다.

## 기술 구성

- Bun workspaces
- Astro + React + shadcn/ui on Cloudflare Pages
- Elysia on Cloudflare Workers
- Prisma + Cloudflare D1
- Cloudflare R2, Queues, Durable Objects, Containers

## 로컬 실행

Bun 1.3.14 이상이 필요하다. Docker는 API의 PDF 처리 Container를 빌드하거나 배포할 때만 필요하다.

```powershell
bun install
bun run db:generate
bun run db:migrate
bun run dev
```

- Web: `http://localhost:4321`
- API: `http://localhost:8787`
- D1: Wrangler의 로컬 저장소 `apps/api/.wrangler/state`

## 검사

```powershell
bun run lint
bun run typecheck
bun run test
bun run test:integration
bun run build
bun run test:e2e
```

## 배포

production은 로컬 Wrangler로 수동 배포한다. D1 migration을 먼저 적용하고 API와 Web을 차례로 배포한다. 자세한 절차는 [프로덕션 배포 문서](./docs/DEPLOYMENT.md)를 따른다.
