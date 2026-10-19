'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Lock, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { checkFeatureAccess, requestFeatureAccess, type FeatureName } from '@/lib/feature-access'

type AccessGuardProps = {
  feature: FeatureName
  children: React.ReactNode
  featureLabel?: string
}

export function AccessGuard({ feature, children, featureLabel }: AccessGuardProps) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const [requestSent, setRequestSent] = useState(false)

  // Verificar acesso
  const { data: access, isLoading } = useQuery({
    queryKey: ['feature-access', feature],
    queryFn: () => checkFeatureAccess(feature),
    retry: 1,
  })

  // Solicitar acesso
  const requestMutation = useMutation({
    mutationFn: () => requestFeatureAccess(feature, reason),
    onSuccess: () => {
      setRequestSent(true)
      queryClient.invalidateQueries({ queryKey: ['feature-access', feature] })
    },
  })

  const label =
    featureLabel ||
    {
      tiktok_scheduler: 'TikTok Scheduler',
      syncexpress: 'SyncExpress',
    }[feature]

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-pink-500" />
      </div>
    )
  }

  // Se tem acesso ou é admin, mostrar conteúdo
  if (access?.hasAccess || access?.isAdmin) {
    return <>{children}</>
  }

  // Se não tem acesso, mostrar formulário de solicitação
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-8">
      <div className="w-full max-w-md space-y-6 rounded-lg border border-zinc-800 bg-zinc-900/50 p-8 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-pink-500/10">
          <Lock className="size-8 text-pink-500" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-white">Acesso Restrito</h2>
          <p className="text-sm text-zinc-400">
            O <span className="font-semibold text-pink-500">{label}</span> requer permissão do
            administrador.
          </p>
        </div>

        {requestSent ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-cyan-500/10 border border-cyan-500/20 p-4">
              <p className="text-sm text-cyan-400">
                ✓ Solicitação enviada com sucesso!
              </p>
              <p className="mt-2 text-xs text-zinc-400">
                O administrador receberá sua solicitação e você será notificado quando for aprovada.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-left space-y-2">
              <label className="text-sm font-medium text-zinc-300">
                Por que você precisa de acesso? (opcional)
              </label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex: Preciso gerenciar a conta TikTok da empresa..."
                className="min-h-[100px] resize-none bg-zinc-950 border-zinc-800 text-white placeholder:text-zinc-600"
                maxLength={500}
              />
              <p className="text-xs text-zinc-500">{reason.length}/500 caracteres</p>
            </div>

            <Button
              onClick={() => requestMutation.mutate()}
              disabled={requestMutation.isPending}
              className="w-full bg-pink-500 hover:bg-pink-600 text-white"
            >
              {requestMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="mr-2 size-4" />
                  Solicitar Acesso
                </>
              )}
            </Button>

            {requestMutation.isError && (
              <p className="text-xs text-red-400">
                {requestMutation.error instanceof Error
                  ? requestMutation.error.message
                  : 'Erro ao enviar solicitação'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
