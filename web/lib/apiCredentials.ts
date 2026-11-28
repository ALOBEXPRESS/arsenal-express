import 'server-only'
import {storageAdmin} from '@/lib/storage/admin'

export async function personalApiKey(userId:string,provider:'openai'|'google'):Promise<string|null> {
  const {data,error}=await storageAdmin().rpc('read_user_api_credential',{p_user_id:userId,p_provider:provider})
  if(error)throw Error('Não foi possível consultar sua chave de API. Tente novamente.')
  return data || null
}
