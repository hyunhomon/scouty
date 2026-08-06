interface DomainWorkerEnv {
  PAGES_ORIGIN: string
}

export function createOriginRequest(request: Request, pagesOrigin: string) {
  const target = new URL(request.url)
  target.protocol = "https:"
  target.hostname = pagesOrigin
  target.port = ""

  return new Request(target, request)
}

export default {
  fetch(request: Request, env: DomainWorkerEnv) {
    return fetch(createOriginRequest(request, env.PAGES_ORIGIN))
  },
}
