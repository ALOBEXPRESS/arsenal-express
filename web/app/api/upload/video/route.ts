import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  console.log('[upload] Starting video upload...')
  
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError) {
      console.error('[upload] Auth error:', authError)
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 })
    }
    
    if (!user) {
      console.error('[upload] No user found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[upload] User authenticated:', user.id)

    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      console.error('[upload] No file in formData')
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    console.log('[upload] File received:', {
      name: file.name,
      size: file.size,
      type: file.type,
    })

    // Validações
    const maxSize = 500 * 1024 * 1024 // 500MB
    if (file.size > maxSize) {
      console.error('[upload] File too large:', file.size)
      return NextResponse.json({ error: 'File too large (max 500MB)' }, { status: 400 })
    }

    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm']
    if (!allowedTypes.includes(file.type)) {
      console.error('[upload] Invalid file type:', file.type)
      return NextResponse.json({ error: 'Invalid file type. Use MP4, MOV, AVI, or WEBM' }, { status: 400 })
    }

    // Upload to Supabase Storage
    const fileName = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    console.log('[upload] Uploading to:', fileName)
    
    const fileBuffer = await file.arrayBuffer()
    console.log('[upload] Buffer size:', fileBuffer.byteLength)
    
    const { data, error } = await supabase.storage
      .from('tiktok-videos')
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      })

    if (error) {
      console.error('[upload] Supabase storage error:', {
        message: error.message,
        name: error.name,
        cause: error.cause,
      })
      return NextResponse.json({ 
        error: `Storage error: ${error.message}`,
        details: error.cause || 'No details available'
      }, { status: 500 })
    }

    console.log('[upload] Upload successful:', data.path)

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('tiktok-videos')
      .getPublicUrl(data.path)

    console.log('[upload] Public URL:', publicUrl)

    return NextResponse.json({
      url: publicUrl,
      path: data.path,
      size: file.size,
      type: file.type,
    })
  } catch (error) {
    console.error('[upload] Unexpected error:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Internal server error',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}

// GET para verificar se o bucket existe
export async function GET() {
  return NextResponse.json({
    service: 'TikTok Video Upload',
    status: 'online',
    maxSize: '500MB',
    allowedTypes: ['MP4', 'MOV', 'AVI', 'WEBM'],
  })
}
