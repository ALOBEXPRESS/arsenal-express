import { NextResponse } from 'next/server'
import { z } from 'zod'
import { personalApiKey } from '@/lib/apiCredentials'
import { narrationVoices } from '@/lib/narrationVoices'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60
const input = z.object({ text: z.string().trim().min(1).max(600), voice: z.enum(narrationVoices) })
const result = z.object({ steps: z.array(z.object({
  type: z.string(), content: z.array(z.object({ type: z.string(), data: z.string().optional() })).optional(),
})) })

export async function POST(request: Request) {
  const fail = (error: string, status: number) => NextResponse.json({ error }, { status })
  if (request.headers.get('origin') !== new URL(request.url).origin) return fail('Origem inválida.', 403)
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return fail('Entre na sua conta.', 401)
  const { data: access } = await client.rpc('system_access_status')
  if (!access?.allowed) return fail('Acesso não autorizado.', 403)
  const parsed = input.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return fail('Confira o texto e a voz selecionada.', 400)
  try {
    const key = await personalApiKey(user.id, 'google')
    if (!key) return fail('Configure sua chave Google em Chaves de API.', 428)
    const { text, voice } = parsed.data
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(55000)]),
      body: JSON.stringify({
        model: 'gemini-3.8-flash-lite-tts',
        input: [{ type: 'user_input', content: [{ type: 'text', text }] }],
        response_format: { type: 'audio' },
        generation_config: { speech_config: [{ voice }] },
      }),
    })
    if (!response.ok) {
      if (response.status === 429) return fail('A cota do Gemini foi atingida. Confira os limites da sua chave.', 429)
      if ([400, 401, 403].includes(response.status)) return fail('O Gemini recusou o pedido. Confira a chave e o acesso ao modelo de voz.', 422)
      return fail('O Gemini está indisponível. Tente novamente.', 502)
    }
    const output = result.parse(await response.json())
    const audio = output.steps.filter(step => step.type === 'model_output')
      .flatMap(step => step.content ?? []).filter(part => part.type === 'audio').at(-1)?.data
    const bytes = Buffer.from(audio ?? '', 'base64')
    if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE')
      return fail('O Gemini não retornou um áudio WAV válido.', 502)
    if (bytes.length > 4_000_000) return fail('O áudio desta cena ficou muito longo. Encurte o texto.', 422)
    return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'private, no-store' } })
  } catch {
    return fail('Falha ao gerar a voz. Tente novamente.', 502)
  }
}
