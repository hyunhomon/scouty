import type { ReactNode } from "react"

export const inputClass =
  "h-11 rounded-xl border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground/70 focus-visible:ring-[3px] focus-visible:ring-ring/50"

export const textareaClass =
  "min-h-24 resize-y rounded-xl border bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/70 focus-visible:ring-[3px] focus-visible:ring-ring/50"

export function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <fieldset className="grid gap-2 text-sm font-semibold">
      <legend className="mb-2">{label}</legend>
      {children}
    </fieldset>
  )
}
