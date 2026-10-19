// Cliente para chamar a API interna do Next.js que faz proxy para PostZen
// A chave fica segura no servidor

export type TikTokAccount = {
  id: string
  postzen_account_id: string | null
  username: string
  display_name: string | null
  avatar_url: string | null
  status: string
  created_at: string
}

export type TikTokPost = {
  id: string
  account_id: string
  caption: string
  video_url: string
  scheduled_at: string
  status: string
  postzen_post_id: string | null
  error_message: string | null
  views: number
  likes: number
  comments: number
  shares: number
  created_at: string
}

async function apiCall(method: 'GET' | 'POST', url: string, data?: any) {
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  }

  if (method === 'POST' && data) {
    options.body = JSON.stringify(data)
  }

  const response = await fetch(url, options)
  const result = await response.json()

  if (!response.ok) {
    throw new Error(result.error || 'Request failed')
  }

  return result
}

// Contas

export async function getTikTokAccounts(): Promise<TikTokAccount[]> {
  const result = await apiCall('GET', '/api/tiktok?action=accounts')
  return result.accounts
}

export async function syncTikTokAccounts(): Promise<{ synced: number }> {
  return apiCall('POST', '/api/tiktok', { action: 'sync_accounts' })
}

export async function getConnectUrl(redirectUrl: string): Promise<{ authUrl: string }> {
  return apiCall('POST', '/api/tiktok', {
    action: 'get_connect_url',
    redirectUrl,
  })
}

export async function removeTikTokAccount(id: string): Promise<{ ok: boolean }> {
  return apiCall('POST', '/api/tiktok', {
    action: 'remove_account',
    id,
  })
}

// Posts

export async function getTikTokPosts(): Promise<TikTokPost[]> {
  const result = await apiCall('GET', '/api/tiktok?action=posts')
  return result.posts
}

export async function createTikTokPost(params: {
  accountId: string
  caption: string
  videoUrl: string
  scheduledAt?: string
  privacyLevel?: string
}): Promise<TikTokPost> {
  const result = await apiCall('POST', '/api/tiktok', {
    action: 'create_post',
    ...params,
  })
  return result.post
}

export async function deleteTikTokPost(id: string): Promise<{ ok: boolean }> {
  return apiCall('POST', '/api/tiktok', {
    action: 'delete_post',
    id,
  })
}

export async function refreshTikTokPosts(): Promise<{ updated: number }> {
  return apiCall('POST', '/api/tiktok', { action: 'refresh_posts' })
}

// Analytics

export async function getTikTokAnalytics(accountId: string) {
  const result = await apiCall('GET', `/api/tiktok?action=analytics&accountId=${accountId}`)
  return result.analytics
}

// Helper para abrir autorização do TikTok em popup
export async function openTikTokAuth() {
  // Não passamos redirect_uri customizado, deixamos a PostZen usar o padrão
  const { authUrl } = await getConnectUrl('')
  
  const width = 600
  const height = 700
  const left = window.screen.width / 2 - width / 2
  const top = window.screen.height / 2 - height / 2
  
  const popup = window.open(
    authUrl,
    'TikTokAuth',
    `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
  )
  
  if (!popup) {
    throw new Error('Popup bloqueado. Permita popups para conectar sua conta TikTok.')
  }
  
  // Retorna promise que resolve quando o popup fechar
  return new Promise<void>((resolve, reject) => {
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed)
        resolve()
      }
    }, 500)
    
    // Timeout de 5 minutos
    setTimeout(() => {
      clearInterval(checkClosed)
      if (!popup.closed) {
        popup.close()
      }
      reject(new Error('Timeout na autorização'))
    }, 5 * 60 * 1000)
  })
}
