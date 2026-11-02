import 'server-only'
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

/** Server-side access only. Never expose these credentials to the browser. */
function settings() {
  const account = process.env.R2_ACCOUNT_ID
  const bucket = process.env.R2_BUCKET_NAME
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!account || !bucket || !accessKeyId || !secretAccessKey) throw new Error('Armazenamento R2 não configurado no servidor.')
  return { account, bucket, accessKeyId, secretAccessKey }
}

function client() {
  const config = settings()
  return { bucket: config.bucket, s3: new S3Client({ region: 'auto', endpoint: `https://${config.account}.r2.cloudflarestorage.com`, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } }) }
}

export async function signR2Read(key: string) {
  const { s3, bucket } = client()
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 3600 })
}

export async function signR2Upload(key: string, contentType: string, contentLength: number) {
  const { s3, bucket } = client()
  return getSignedUrl(s3, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: contentLength }), { expiresIn: 300 })
}

export async function statR2Object(key: string) {
  const { s3, bucket } = client()
  return s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
}

export async function deleteR2Object(key: string) {
  const { s3, bucket } = client()
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}
