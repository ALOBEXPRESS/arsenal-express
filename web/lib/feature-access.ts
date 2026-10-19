// API para controle de acesso a features protegidas

export type FeatureName = 'tiktok_scheduler' | 'syncexpress'

export type RequestStatus = 'pending' | 'approved' | 'rejected'

export type FeaturePermission = {
  id: string
  user_id: string
  feature: FeatureName
  granted_by: string | null
  granted_at: string
  expires_at: string | null
  notes: string | null
  created_at: string
}

export type FeatureAccessRequest = {
  id: string
  user_id: string
  feature: FeatureName
  status: RequestStatus
  reason: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  admin_notes: string | null
  created_at: string
  updated_at: string
}

async function apiCall(method: 'GET' | 'POST' | 'PUT', url: string, data?: any) {
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  }

  if ((method === 'POST' || method === 'PUT') && data) {
    options.body = JSON.stringify(data)
  }

  const response = await fetch(url, options)
  const result = await response.json()

  if (!response.ok) {
    throw new Error(result.error || 'Request failed')
  }

  return result
}

// Verificar acesso
export async function checkFeatureAccess(feature: FeatureName): Promise<{ hasAccess: boolean; isAdmin: boolean }> {
  return apiCall('GET', `/api/feature-access?action=check&feature=${feature}`)
}

// Solicitar acesso
export async function requestFeatureAccess(feature: FeatureName, reason?: string): Promise<FeatureAccessRequest> {
  const result = await apiCall('POST', '/api/feature-access', {
    action: 'request',
    feature,
    reason,
  })
  return result.request
}

// Obter minhas solicitações
export async function getMyRequests(): Promise<FeatureAccessRequest[]> {
  const result = await apiCall('GET', '/api/feature-access?action=my_requests')
  return result.requests
}

// Admin: Listar todas as solicitações pendentes
export async function getPendingRequests(): Promise<FeatureAccessRequest[]> {
  const result = await apiCall('GET', '/api/feature-access?action=pending')
  return result.requests
}

// Admin: Aprovar solicitação
export async function approveRequest(
  requestId: string,
  expiresAt?: string,
  notes?: string
): Promise<{ success: boolean }> {
  return apiCall('POST', '/api/feature-access', {
    action: 'approve',
    requestId,
    expiresAt,
    notes,
  })
}

// Admin: Rejeitar solicitação
export async function rejectRequest(requestId: string, adminNotes?: string): Promise<{ success: boolean }> {
  return apiCall('POST', '/api/feature-access', {
    action: 'reject',
    requestId,
    adminNotes,
  })
}

// Admin: Revogar acesso
export async function revokeAccess(userId: string, feature: FeatureName): Promise<{ success: boolean }> {
  return apiCall('POST', '/api/feature-access', {
    action: 'revoke',
    userId,
    feature,
  })
}

// Admin: Listar todas as permissões
export async function getAllPermissions(): Promise<FeaturePermission[]> {
  const result = await apiCall('GET', '/api/feature-access?action=all_permissions')
  return result.permissions
}

// Obter minhas permissões
export async function getMyPermissions(): Promise<FeaturePermission[]> {
  const result = await apiCall('GET', '/api/feature-access?action=my_permissions')
  return result.permissions
}
