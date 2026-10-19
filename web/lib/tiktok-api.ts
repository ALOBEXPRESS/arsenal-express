// Cliente para chamar a API interna do Next.js que faz proxy para PostZen
// A chave fica segura no servidor

interface TikTokAPIOptions {
  action: string
  data?: any
}

export async function callTikTokAPI({ action, data }: TikTokAPIOptions) {
  const response = await fetch('/api/tiktok', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...data }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to call TikTok API')
  }

  return response.json()
}

export async function getTikTokData(endpoint: string) {
  const response = await fetch(`/api/tiktok?endpoint=${encodeURIComponent(endpoint)}`)

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch TikTok data')
  }

  return response.json()
}

// Funções específicas para cada operação

export async function connectTikTokAccount(authCode: string) {
  return callTikTokAPI({
    action: 'accounts/connect',
    data: { authCode },
  })
}

export async function createTikTokPost({
  accountId,
  videoUrl,
  caption,
  scheduledAt,
}: {
  accountId: string
  videoUrl: string
  caption: string
  scheduledAt?: string
}) {
  return callTikTokAPI({
    action: 'posts/create',
    data: {
      accountId,
      videoUrl,
      caption,
      scheduledAt,
    },
  })
}

export async function getTikTokAccounts() {
  return getTikTokData('accounts')
}

export async function getTikTokPosts() {
  return getTikTokData('posts')
}

export async function getTikTokAnalytics(accountId: string) {
  return getTikTokData(`analytics/${accountId}`)
}
