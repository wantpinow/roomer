"use client"

import * as React from "react"
import { cn } from "@roomer/ui/lib/utils"
import { Toast as ToastPrimitive } from "radix-ui"
import { XIcon } from "lucide-react"

/**
 * Small, quiet notifications (Radix Toast): "Moved the sofa", "The agent
 * changed this layout", "Removed the rug — Undo". Mount one <Toaster> near
 * the root and call `toast(...)` from `useToast()` anywhere below it.
 */

export type ToastTone = "default" | "error" | "success"

export interface ToastOptions {
  title: React.ReactNode
  description?: React.ReactNode
  tone?: ToastTone
  /** A single inline action, e.g. Undo. */
  action?: { label: string; onClick: () => void }
  /** ms before it closes itself; default 4000 (8000 with an action). */
  duration?: number
}

interface ToastEntry extends ToastOptions {
  id: number
  open: boolean
}

const ToastContext = React.createContext<{
  toast: (options: ToastOptions) => void
} | null>(null)

/** `toast(...)` from the nearest <Toaster>. */
function useToast(): { toast: (options: ToastOptions) => void } {
  const context = React.useContext(ToastContext)
  if (!context) throw new Error("useToast must be used inside <Toaster>")
  return context
}

/**
 * Provides `useToast` and renders the stack. `position` places the stack;
 * `inline` keeps it inside the nearest positioned ancestor (e.g. a stage)
 * instead of the viewport.
 */
function Toaster({
  children,
  position = "bottom-center",
  inline = false,
  className,
}: {
  children: React.ReactNode
  position?: "bottom-center" | "bottom-right" | "top-center"
  inline?: boolean
  className?: string
}) {
  const [toasts, setToasts] = React.useState<ToastEntry[]>([])
  const nextId = React.useRef(0)

  const toast = React.useCallback((options: ToastOptions) => {
    nextId.current += 1
    const entry: ToastEntry = { ...options, id: nextId.current, open: true }
    // Keep the stack short: the newest three.
    setToasts((current) => [...current.slice(-2), entry])
  }, [])

  const close = (id: number) =>
    setToasts((current) =>
      current.map((t) => (t.id === id ? { ...t, open: false } : t))
    )
  const remove = (id: number) =>
    setToasts((current) => current.filter((t) => t.id !== id))

  const value = React.useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="down" duration={4000}>
        {children}
        {toasts.map((entry) => (
          <ToastPrimitive.Root
            key={entry.id}
            data-slot="toast"
            data-tone={entry.tone ?? "default"}
            open={entry.open}
            duration={entry.duration ?? (entry.action ? 8000 : 4000)}
            onOpenChange={(open) => {
              if (!open) close(entry.id)
            }}
            onAnimationEnd={() => {
              if (!entry.open) remove(entry.id)
            }}
            className={cn(
              "group/toast pointer-events-auto relative flex w-full items-start gap-3 rounded-lg border border-border bg-popover py-2.5 pr-9 pl-3.5 text-ui text-popover-foreground shadow-pop",
              "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-2",
              "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
              "data-[swipe=cancel]:translate-y-0 data-[swipe=end]:animate-out data-[swipe=move]:translate-y-(--radix-toast-swipe-move-y)",
              "before:absolute before:inset-y-2.5 before:left-0 before:w-[2px] before:rounded-full",
              entry.tone === "error" && "before:bg-error-fill",
              entry.tone === "success" && "before:bg-sage-fill",
              (entry.tone ?? "default") === "default" && "before:bg-clay-fill"
            )}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <ToastPrimitive.Title className="font-medium text-foreground">
                {entry.title}
              </ToastPrimitive.Title>
              {entry.description ? (
                <ToastPrimitive.Description className="text-xs leading-relaxed text-muted-foreground">
                  {entry.description}
                </ToastPrimitive.Description>
              ) : null}
            </div>
            {entry.action ? (
              <ToastPrimitive.Action
                altText={entry.action.label}
                onClick={entry.action.onClick}
                className="shrink-0 self-center rounded-sm px-2 py-1 text-xs font-medium text-clay underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/45"
              >
                {entry.action.label}
              </ToastPrimitive.Action>
            ) : null}
            <ToastPrimitive.Close
              aria-label="Dismiss"
              className="absolute top-2 right-2 rounded-sm p-1 text-muted-foreground opacity-60 outline-none hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/45"
            >
              <XIcon className="size-3.5" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport
          data-slot="toast-viewport"
          className={cn(
            "pointer-events-none z-[60] flex max-h-screen w-[min(100%-2rem,22rem)] flex-col gap-2 outline-none",
            inline ? "absolute" : "fixed",
            position === "bottom-center" &&
              "bottom-4 left-1/2 -translate-x-1/2",
            position === "bottom-right" && "right-4 bottom-4",
            position === "top-center" && "top-4 left-1/2 -translate-x-1/2",
            className
          )}
        />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  )
}

export { Toaster, useToast }
