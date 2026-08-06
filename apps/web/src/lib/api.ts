import { treaty } from "@elysiajs/eden"
import type { App } from "@scouty/api"

const apiUrl = import.meta.env.PUBLIC_API_URL ?? "http://localhost:8787"

export const api = treaty<App>(apiUrl)
