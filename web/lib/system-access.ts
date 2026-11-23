export const ACCESS_ADMIN_EMAIL = 'empresaalob@gmail.com'
export const ACCESS_REQUEST_URL = '/request-access'

export interface SystemAccessStatus { allowed: boolean; isAdmin: boolean }
export const normalizeAccessEmail = (email: string) => email.trim().toLowerCase()
