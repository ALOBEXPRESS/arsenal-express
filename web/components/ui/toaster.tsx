'use client'

// Sonner toasts styled with the SyncExpress tokens (Control Room panels + tally accent)
import { Toaster as Sonner } from 'sonner'
import { CircleCheck, CircleAlert, TriangleAlert, Info, Loader2 } from 'lucide-react'

export function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="top-center"
      offset={14}
      gap={8}
      visibleToasts={4}
      closeButton
      icons={{
        success: <CircleCheck className="h-[18px] w-[18px] text-brand-cyan" />,
        error: <CircleAlert className="h-[18px] w-[18px] text-destructive" />,
        warning: <TriangleAlert className="h-[18px] w-[18px] text-express" />,
        info: <Info className="h-[18px] w-[18px] text-primary" />,
        loading: <Loader2 className="h-[18px] w-[18px] animate-spin text-primary" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'group pointer-events-auto relative flex w-[min(92vw,400px)] items-start gap-3 overflow-hidden rounded-xl border border-border bg-surface-1/95 py-3 pl-4 pr-9 text-foreground shadow-[0_18px_40px_-18px_rgba(0,0,0,0.8)] backdrop-blur-md before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-primary data-[type=success]:before:bg-brand-cyan data-[type=error]:before:bg-destructive data-[type=warning]:before:bg-express',
          icon: 'mt-px shrink-0',
          content: 'min-w-0 flex-1',
          title: 'font-display text-[14px] font-bold leading-snug',
          description: 'mt-0.5 whitespace-pre-line text-[12.5px] leading-relaxed text-muted-foreground',
          actionButton:
            'ml-2 shrink-0 cursor-pointer self-center rounded-md bg-primary-fill px-2.5 py-1 text-[12px] font-semibold text-primary-foreground hover:bg-primary-fill/90',
          cancelButton: 'ml-2 shrink-0 cursor-pointer self-center rounded-md px-2 py-1 text-[12px] text-muted-foreground hover:text-foreground',
          closeButton:
            'absolute right-2 top-2 left-auto flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-muted-foreground opacity-70 transition hover:bg-surface-2 hover:text-foreground hover:opacity-100 [&_svg]:h-3.5 [&_svg]:w-3.5',
        },
      }}
    />
  )
}
