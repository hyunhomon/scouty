import { Paperclip, Upload } from "lucide-react"
import { type ChangeEvent, type ComponentProps, useEffect, useId, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type FilePickerProps = Omit<ComponentProps<"input">, "children" | "className" | "type"> & {
  actionLabel: string
  compact?: boolean
  helperText?: string
}

export function FilePicker({
  "aria-label": ariaLabel,
  actionLabel,
  compact = false,
  disabled,
  helperText,
  id,
  onChange,
  ...props
}: FilePickerProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string>()

  useEffect(() => {
    const form = inputRef.current?.form
    const reset = () => setFileName(undefined)
    form?.addEventListener("reset", reset)
    return () => form?.removeEventListener("reset", reset)
  }, [])

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setFileName(event.currentTarget.files?.[0]?.name)
    onChange?.(event)
  }

  return (
    <div className={cn("flex min-w-0 items-center gap-3", !compact && "rounded-xl border p-3")}>
      <input
        {...props}
        ref={inputRef}
        id={inputId}
        type="file"
        aria-label={ariaLabel ?? actionLabel}
        className="sr-only"
        disabled={disabled}
        onChange={handleChange}
      />
      <Button
        type="button"
        variant="outline"
        size={compact ? "sm" : "default"}
        className="shrink-0"
        disabled={disabled}
        aria-controls={inputId}
        onClick={() => inputRef.current?.click()}
      >
        <Upload aria-hidden="true" /> {actionLabel}
      </Button>
      {!compact ? (
        <span className="min-w-0 text-xs font-normal text-muted-foreground">
          {fileName ? (
            <span className="flex items-center gap-1.5 truncate text-foreground">
              <Paperclip aria-hidden="true" className="shrink-0" size={14} />
              <span className="truncate">{fileName}</span>
            </span>
          ) : (
            (helperText ?? "선택된 파일이 없어요.")
          )}
        </span>
      ) : null}
    </div>
  )
}
