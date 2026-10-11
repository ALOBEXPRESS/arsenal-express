'use client'

// Promise-based confirm dialog (replaces window.confirm). Callable from anywhere:
//   if (await confirmDialog({ title: 'Excluir?', tone: 'danger' })) ...
// <ConfirmHost /> is mounted once in app/providers.tsx.
import { useEffect, useState } from 'react'
import { AlertDialog } from 'radix-ui'
import { TriangleAlert, CircleHelp } from 'lucide-react'
import { create } from 'zustand'
import { Button } from './button'
import { cn } from '@/lib/utils'

export interface ConfirmOptions {
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
}

interface ConfirmState {
  request: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null
  open: (o: ConfirmOptions) => Promise<boolean>
  close: (ok: boolean) => void
}

const useConfirmStore = create<ConfirmState>((set, get) => ({
  request: null,
  open: (o) =>
    new Promise<boolean>((resolve) => {
      get().request?.resolve(false) // a newer prompt cancels the previous one
      set({ request: { ...o, resolve } })
    }),
  close: (ok) => {
    get().request?.resolve(ok)
    set({ request: null })
  },
}))

export const confirmDialog = (o: ConfirmOptions) => useConfirmStore.getState().open(o)

export function ConfirmHost() {
  const { request, close } = useConfirmStore()
  // keep the last content while the close animation runs
  const [shown, setShown] = useState(request)
  useEffect(() => {
    if (request) setShown(request)
  }, [request])
  const danger = shown?.tone === 'danger'

  return (
    <AlertDialog.Root open={!!request} onOpenChange={(o) => !o && close(false)}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <AlertDialog.Content
          className="fixed left-1/2 top-1/2 z-[91] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface-1 p-5 shadow-2xl data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <div className="flex gap-3">
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
                danger ? 'border-destructive/40 bg-destructive/15 text-destructive' : 'border-primary/40 bg-primary/15 text-primary'
              )}
              aria-hidden
            >
              {danger ? <TriangleAlert className="h-4 w-4" /> : <CircleHelp className="h-4 w-4" />}
            </span>
            <div className="min-w-0">
              <AlertDialog.Title className="font-display text-[17px] font-bold leading-snug">{shown?.title}</AlertDialog.Title>
              {shown?.description ? (
                <AlertDialog.Description className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  {shown.description}
                </AlertDialog.Description>
              ) : (
                <AlertDialog.Description className="sr-only">Confirme a ação</AlertDialog.Description>
              )}
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="ghost">{shown?.cancelLabel || 'Cancelar'}</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                variant={danger ? 'destructive' : 'default'}
                className="font-semibold"
                onClick={() => close(true)}
              >
                {shown?.confirmLabel || 'Continuar'}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
