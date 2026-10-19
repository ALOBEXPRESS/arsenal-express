import { NextRequest, NextResponse } from 'next/server'

// Esta API route mantém a chave POSTZEN_API_KEY segura no servidor
// O frontend chama esta rota, que por sua vez chama a PostZen API

const POSTZEN_API_KEY = process.env.POSTZEN_API_KEY
const POSTZEN_BASE_URL = 'https://api.postzen.com' // ajuste conforme a documentação

export async function POST(request: NextRequest) {
  if (!POSTZEN_API_KEY) {
    return NextResponse.json(
      { error: 'PostZen API key not configured' },
      { status: 500 }
    )
  }

  try {
    const body = await request.json()
    const { action, ...data } = body

    // Proxy para a PostZen API
    const response = await fetch(`${POSTZEN_BASE_URL}/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${POSTZEN_API_KEY}`,
      },
      body: JSON.stringify(data),
    })

    const result = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: result.message || 'PostZen API error' },
        { status: response.status }
      )
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('TikTok API route error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  if (!POSTZEN_API_KEY) {
    return NextResponse.json(
      { error: 'PostZen API key not configured' },
      { status: 500 }
    )
  }

  const { searchParams } = new URL(request.url)
  const endpoint = searchParams.get('endpoint')

  if (!endpoint) {
    return NextResponse.json(
      { error: 'Missing endpoint parameter' },
      { status: 400 }
    )
  }

  try {
    const response = await fetch(`${POSTZEN_BASE_URL}/${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${POSTZEN_API_KEY}`,
      },
    })

    const result = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: result.message || 'PostZen API error' },
        { status: response.status }
      )
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('TikTok API route error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
