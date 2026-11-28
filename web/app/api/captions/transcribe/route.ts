import {NextResponse} from 'next/server'
import {z} from 'zod'
import {createClient} from '@/lib/supabase/server'
import {personalApiKey} from '@/lib/apiCredentials'
import {signR2Read} from '@/lib/storage/r2'
export const runtime='nodejs'
export const maxDuration=60
const MAX=24*1024*1024
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'Origem inválida.'},{status:403})
 const client=await createClient(),{data:{user}}=await client.auth.getUser()
 if(!user)return NextResponse.json({error:'Entre na sua conta.'},{status:401})
 const {data:access,error:accessError}=await client.rpc('system_access_status')
 if(accessError||!access?.allowed)return NextResponse.json({error:'Acesso não autorizado.'},{status:403})

 const input=z.object({assetId:z.string().uuid()}).safeParse(await request.json().catch(()=>null))
 if(!input.success)return NextResponse.json({error:'Arquivo inválido.'},{status:400})
 const {data:asset,error}=await client.from('assets').select('id,kind,filename,storage_path,metadata').eq('id',input.data.assetId).single()
 if(error||!asset||!['audio','video'].includes(asset.kind))return NextResponse.json({error:'Arquivo de áudio ou vídeo não encontrado.'},{status:404})
 const cached=asset.metadata?.whisper_transcript
 if(cached?.version===2 && cached.source===asset.storage_path)return NextResponse.json(cached,{headers:{'Cache-Control':'private, no-store'}})
 let key:string|null
 try { key=await personalApiKey(user.id,'openai');if(!key&&access.isAdmin)key=process.env.OPENAI_API_KEY||null }
 catch { return NextResponse.json({error:'Não foi possível consultar sua chave de API. Tente novamente.'},{status:503}) }
 if(!key)return NextResponse.json({error:'Configure sua chave OpenAI em Configurações → Chaves de API para transcrever e gerar legendas.'},{status:428})
 try{
 let url:string
 if(asset.metadata?.storage_provider==='r2')url=await signR2Read(asset.storage_path)
 else{const {data,error}=await client.storage.from('media').createSignedUrl(asset.storage_path,300);if(error||!data)throw Error('Não foi possível abrir o arquivo.');url=data.signedUrl}
 const media=await fetch(url,{signal:AbortSignal.timeout(20000)})
 if(!media.ok||!media.body)throw Error('Não foi possível baixar o áudio.')
 const reader=media.body.getReader(),chunks:Uint8Array[]=[];let size=0
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX){await reader.cancel();throw Error('Arquivo maior que 24 MB. Importe a narração em MP3 para gerar legendas.')}chunks.push(value)}
 if(!size)throw Error('Arquivo de áudio vazio.')
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 const form=new FormData();form.append('model','whisper-1');form.append('response_format','verbose_json');form.append('temperature','0');form.append('timestamp_granularities[]','word');form.append('timestamp_granularities[]','segment');form.append('file',new Blob([bytes],{type:media.headers.get('content-type')||'application/octet-stream'}),asset.filename)
 const response=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${key}`},body:form,signal:AbortSignal.timeout(45000)})
 if(!response.ok)return NextResponse.json({error:response.status===429?'Limite ou saldo da API OpenAI indisponível. Confira sua conta.':response.status===401?'A chave OpenAI configurada não foi aceita.':'Não foi possível transcrever este arquivo.'},{status:502})
 const result=await response.json()
 const segments=z.array(z.object({start:z.number().nonnegative(),end:z.number().nonnegative(),text:z.string().max(5000)})).parse(result.segments)
 const words=z.array(z.object({start:z.number().nonnegative(),end:z.number().nonnegative(),word:z.string()})).parse(result.words || [])
 const transcript={version:2,source:asset.storage_path,segments,words}
 const {data:latest,error:readError}=await client.from('assets').select('metadata').eq('id',asset.id).single()
 if(readError)throw readError
 const {error:saveError}=await client.from('assets').update({metadata:{...latest.metadata,whisper_transcript:transcript}}).eq('id',asset.id)
 if(saveError)throw saveError
 return NextResponse.json(transcript,{headers:{'Cache-Control':'private, no-store'}})
 }catch(e){return NextResponse.json({error:e instanceof Error&&e.message.startsWith('Arquivo maior')?e.message:'Falha ao gerar a transcrição. Confira o arquivo e tente novamente.'},{status:400})}
}
