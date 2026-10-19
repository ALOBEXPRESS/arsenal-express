'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, XCircle, Loader2, Clock, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import {
  checkFeatureAccess,
  getPendingRequests,
  getAllPermissions,
  approveRequest,
  rejectRequest,
  revokeAccess,
  type FeatureAccessRequest,
  type FeaturePermission,
} from '@/lib/feature-access'

export default function AccessManagementPage() {
  const queryClient = useQueryClient()
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null)
  const [adminNotes, setAdminNotes] = useState('')

  // Verificar se é admin
  const { data: access, isLoading: accessLoading } = useQuery({
    queryKey: ['admin-access'],
    queryFn: () => checkFeatureAccess('tiktok_scheduler'), // Qualquer feature serve para verificar isAdmin
  })

  // Listar solicitações pendentes
  const { data: requests = [], isLoading: requestsLoading } = useQuery({
    queryKey: ['pending-requests'],
    queryFn: getPendingRequests,
    enabled: access?.isAdmin,
  })

  // Listar todas as permissões
  const { data: permissions = [], isLoading: permissionsLoading } = useQuery({
    queryKey: ['all-permissions'],
    queryFn: getAllPermissions,
    enabled: access?.isAdmin,
  })

  // Mutations
  const approveMutation = useMutation({
    mutationFn: ({ requestId, notes }: { requestId: string; notes?: string }) =>
      approveRequest(requestId, undefined, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-requests'] })
      queryClient.invalidateQueries({ queryKey: ['all-permissions'] })
      toast.success('Acesso aprovado!')
      setSelectedRequest(null)
      setAdminNotes('')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const rejectMutation = useMutation({
    mutationFn: ({ requestId, notes }: { requestId: string; notes?: string }) =>
      rejectRequest(requestId, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-requests'] })
      toast.success('Solicitação rejeitada')
      setSelectedRequest(null)
      setAdminNotes('')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const revokeMutation = useMutation({
    mutationFn: ({ userId, feature }: { userId: string; feature: any }) =>
      revokeAccess(userId, feature),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-permissions'] })
      toast.success('Acesso revogado')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  if (accessLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-pink-500" />
      </div>
    )
  }

  if (!access?.isAdmin) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-4">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-red-500/10">
            <Shield className="size-8 text-red-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Acesso Negado</h2>
            <p className="text-sm text-zinc-400 mt-2">
              Você não tem permissão para acessar esta página.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const featureLabels = {
    tiktok_scheduler: 'TikTok Scheduler',
    syncexpress: 'SyncExpress',
  }

  return (
    <div className="animate-rise-in">
      <div className="mb-10">
        <p className="eyebrow flex items-center gap-2">
          <span className="tally" aria-hidden /> Administração
        </p>
        <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight">
          Controle de Acesso
        </h1>
        <p className="mt-1 text-muted-foreground">
          Gerencie solicitações de acesso às features protegidas.
        </p>
      </div>

      {/* Solicitações Pendentes */}
      <div className="panel p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Clock className="size-5 text-yellow-500" />
            Solicitações Pendentes
            {requests.length > 0 && (
              <span className="text-sm font-normal text-zinc-400">({requests.length})</span>
            )}
          </h2>
        </div>

        {requestsLoading ? (
          <div className="text-center py-8">
            <Loader2 className="size-6 animate-spin mx-auto text-zinc-400" />
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-8 text-zinc-400">
            <p className="text-sm">Nenhuma solicitação pendente</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((request: any) => (
              <div
                key={request.id}
                className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {request.profiles?.avatar_url ? (
                        <img
                          src={request.profiles.avatar_url}
                          alt={request.profiles.name}
                          className="size-10 rounded-full"
                        />
                      ) : (
                        <div className="flex size-10 items-center justify-center rounded-full bg-zinc-800">
                          <span className="text-sm">👤</span>
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-white">
                          {request.profiles?.name || 'Usuário'}
                        </p>
                        <p className="text-xs text-zinc-400">
                          Solicitou acesso ao{' '}
                          <span className="font-semibold text-pink-500">
                            {featureLabels[request.feature as keyof typeof featureLabels]}
                          </span>
                        </p>
                      </div>
                    </div>

                    {request.reason && (
                      <div className="mt-3 rounded-md bg-zinc-950 border border-zinc-800 p-3">
                        <p className="text-xs text-zinc-400 mb-1">Motivo:</p>
                        <p className="text-sm text-zinc-300">{request.reason}</p>
                      </div>
                    )}

                    <p className="text-xs text-zinc-500 mt-2">
                      Solicitado em {new Date(request.created_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                </div>

                {selectedRequest === request.id ? (
                  <div className="space-y-3 pt-3 border-t border-zinc-800">
                    <div>
                      <label className="text-xs font-medium text-zinc-300 mb-2 block">
                        Notas do administrador (opcional)
                      </label>
                      <Textarea
                        value={adminNotes}
                        onChange={(e) => setAdminNotes(e.target.value)}
                        placeholder="Adicione observações sobre esta decisão..."
                        className="min-h-[80px] bg-zinc-950 border-zinc-800"
                        maxLength={500}
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          approveMutation.mutate({ requestId: request.id, notes: adminNotes })
                        }
                        disabled={approveMutation.isPending}
                        className="flex-1 bg-green-600 hover:bg-green-700"
                      >
                        {approveMutation.isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <>
                            <CheckCircle2 className="size-4" />
                            Aprovar
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          rejectMutation.mutate({ requestId: request.id, notes: adminNotes })
                        }
                        disabled={rejectMutation.isPending}
                        className="flex-1 border-red-500/50 text-red-400 hover:bg-red-500/10"
                      >
                        {rejectMutation.isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <>
                            <XCircle className="size-4" />
                            Rejeitar
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSelectedRequest(null)
                          setAdminNotes('')
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 pt-3 border-t border-zinc-800">
                    <Button
                      size="sm"
                      onClick={() => setSelectedRequest(request.id)}
                      className="flex-1"
                    >
                      Revisar
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Permissões Ativas */}
      <div className="panel p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <CheckCircle2 className="size-5 text-green-500" />
            Permissões Ativas
            {permissions.length > 0 && (
              <span className="text-sm font-normal text-zinc-400">({permissions.length})</span>
            )}
          </h2>
        </div>

        {permissionsLoading ? (
          <div className="text-center py-8">
            <Loader2 className="size-6 animate-spin mx-auto text-zinc-400" />
          </div>
        ) : permissions.length === 0 ? (
          <div className="text-center py-8 text-zinc-400">
            <p className="text-sm">Nenhuma permissão concedida ainda</p>
          </div>
        ) : (
          <div className="space-y-3">
            {permissions.map((permission: any) => (
              <div
                key={permission.id}
                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 p-4"
              >
                <div className="flex items-center gap-3">
                  {permission.profiles?.avatar_url ? (
                    <img
                      src={permission.profiles.avatar_url}
                      alt={permission.profiles.name}
                      className="size-10 rounded-full"
                    />
                  ) : (
                    <div className="flex size-10 items-center justify-center rounded-full bg-zinc-800">
                      <span className="text-sm">👤</span>
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-white">
                      {permission.profiles?.name || 'Usuário'}
                    </p>
                    <p className="text-xs text-zinc-400">
                      <span className="font-semibold text-cyan-500">
                        {featureLabels[permission.feature as keyof typeof featureLabels]}
                      </span>{' '}
                      · Concedido em {new Date(permission.granted_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                  onClick={() => {
                    if (
                      confirm(
                        `Revogar acesso de ${permission.profiles?.name || 'usuário'} ao ${featureLabels[permission.feature as keyof typeof featureLabels]}?`
                      )
                    ) {
                      revokeMutation.mutate({
                        userId: permission.user_id,
                        feature: permission.feature,
                      })
                    }
                  }}
                  disabled={revokeMutation.isPending}
                >
                  Revogar
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
