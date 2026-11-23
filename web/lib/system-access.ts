export const ACCESS_ADMIN_EMAIL = 'empresaalob@gmail.com'
export const ACCESS_REQUEST_URL = `mailto:${ACCESS_ADMIN_EMAIL}?subject=${encodeURIComponent('Solicitação de acesso ao SyncExpress')}`

export interface SystemAccessStatus { allowed: boolean; isAdmin: boolean }
export const normalizeAccessEmail = (email: string) => email.trim().toLowerCase()
