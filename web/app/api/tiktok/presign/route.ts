import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const POSTZEN_API_KEY = process.env.POSTZEN_API_KEY!
const POSTZEN_BASE_URL = 'https://api.postzen.dev'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { filename, contentType } = await request.json()

    if (!filename || !contentType) {
      return NextResponse.json(
        { error: 'filename e contentType são obrigatórios' },
        { status: 400 }
      )
    }

    // Validar tipo de arquivo
    const allowedTypes = [
      'video/mp4',
      'video/mpeg',
      'video/quicktime',
      'video/x-msvideo',
      'video/webm',
      'video/x-m4v',
    ]

    if (!allowedTypes.includes(contentType)) {
      return NextResponse.json(
        { error: 'Tipo de arquivo inválido. Use MP4, MPEG, MOV, AVI, WEBM ou M4V' },
        { status: 400 }
      )
    }

    // Solicitar presigned URL do PostZen
    const response = await fetch(`${POSTZEN_BASE_URL}/v1/media/presign`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${POSTZEN_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filename,
        contentType,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('[presign] PostZen error:', error)
      return NextResponse.json(
        { error: error.message || 'Erro ao solicitar upload URL' },
        { status: response.status }
      )
    }

    const data = await response.json()

    return NextResponse.json({
      uploadUrl: data.uploadUrl,
      publicUrl: data.publicUrl,
      mediaId: data.mediaId,
      expiresAt: data.expiresAt,
    })
  } catch (error) {
    console.error('[presign] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    )
  }
}
