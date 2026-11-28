import {NextResponse} from 'next/server'
import {z} from 'zod'
import {createClient} from '@/lib/supabase/server'
import {storageAdmin} from '@/lib/storage/admin'

async function account(){
 const db=await createClient(),{data:{user}}=await db.auth.getUser()
 if(!user)return null
 const {data,error}=await db.rpc('system_access_status')
 return !error&&data?.allowed?{id:user.id,isAdmin:!!data.isAdmin}:null
}
const provider=z.enum(['openai','google'])
export async function GET(){
 const user=await account();if(!user)return NextResponse.json({error:'Acesso não autorizado.'},{status:401})
 const {data,error}=await storageAdmin().from('user_api_credentials').select('provider,last_four,updated_at').eq('user_id',user.id)
 if(error)return NextResponse.json({error:'Não foi possível carregar suas configurações.'},{status:503})
 return NextResponse.json({keys:data,serverOpenAIAvailable:user.isAdmin&&!!process.env.OPENAI_API_KEY},{headers:{'Cache-Control':'private, no-store'}})
}
async function mutate(request:Request,remove:boolean){
 if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'Origem inválida.'},{status:403})
 const user=await account();if(!user)return NextResponse.json({error:'Acesso não autorizado.'},{status:401})
 const parsed=z.object({provider,key:z.string().trim().min(20).max(1024).regex(/^\S+$/).optional()}).safeParse(await request.json().catch(()=>null))
 if(!parsed.success||(!remove&&!parsed.data.key))return NextResponse.json({error:'Confira o provedor e informe uma chave válida.'},{status:400})
 const args={p_user_id:user.id,p_provider:parsed.data.provider,...(!remove?{p_key:parsed.data.key}: {})}
 const {error}=await storageAdmin().rpc(remove?'remove_user_api_credential':'save_user_api_credential',args)
 if(error)return NextResponse.json({error:'Não foi possível salvar suas configurações. Tente novamente.'},{status:503})
 return NextResponse.json({ok:true},{headers:{'Cache-Control':'private, no-store'}})
}
export async function PUT(request:Request){return mutate(request,false)}
export async function DELETE(request:Request){return mutate(request,true)}
