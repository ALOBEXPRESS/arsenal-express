// Upload direto para PostZen usando presigned URL
// Evita o limite de 4.5MB das API routes do Vercel

export type PresignResponse = {
  uploadUrl: string
  publicUrl: string
  mediaId: string
  expiresAt: string
}

/**
 * Solicita URL presigned do PostZen para upload direto
 */
export async function requestPresignedUpload(
  filename: string,
  contentType: string
): Promise<PresignResponse> {
  const response = await fetch('/api/tiktok/presign', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filename, contentType }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Falha ao solicitar URL de upload')
  }

  return response.json()
}

/**
 * Faz upload do arquivo via API route (proxy para PostZen)
 * Necessário por causa de problemas de CORS no Cloudflare R2
 */
export async function uploadToPostZen(
  file: File,
  uploadUrl: string,
  onProgress?: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    // Monitorar progresso
    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100
          onProgress(Math.round(percentComplete))
        }
      })
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        reject(new Error(`Upload falhou: ${xhr.status} ${xhr.statusText}`))
      }
    })

    xhr.addEventListener('error', () => {
      reject(new Error('Erro na conexão durante o upload'))
    })

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload cancelado'))
    })

    // PUT via proxy para evitar CORS
    const proxyUrl = `/api/tiktok/presign?url=${encodeURIComponent(uploadUrl)}&contentType=${encodeURIComponent(file.type)}`
    xhr.open('PUT', proxyUrl)
    xhr.send(file)
  })
}

/**
 * Função all-in-one: solicita presigned URL e faz upload
 */
export async function uploadVideoToPostZen(
  file: File,
  onProgress?: (progress: number) => void
): Promise<{ publicUrl: string; mediaId: string }> {
  // 1. Solicitar presigned URL
  const { uploadUrl, publicUrl, mediaId } = await requestPresignedUpload(file.name, file.type)

  // 2. Upload direto para PostZen
  await uploadToPostZen(file, uploadUrl, onProgress)

  // 3. Retornar URL pública
  return { publicUrl, mediaId }
}
