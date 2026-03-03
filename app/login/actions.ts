'use server'

import { headers } from 'next/headers'
import crypto from 'crypto'

/**
 * Generates a signed callback URL that includes the user's email.
 * This allows the auth callback to auto-login the user even when PKCE
 * code exchange fails (e.g. different browser opened the email).
 * 
 * The email is signed with HMAC using the service role key to prevent forgery.
 */
export async function getSignedCallbackUrl(email: string) {
  const headerList = await headers()
  const host = headerList.get('host')
  const protocol = headerList.get('x-forwarded-proto') || 'https'
  const origin = `${protocol}://${host}`

  const normalizedEmail = email.toLowerCase().trim()
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const sig = crypto
    .createHmac('sha256', secret)
    .update(normalizedEmail)
    .digest('hex')
    .substring(0, 16)

  return `${origin}/auth/callback?e=${encodeURIComponent(normalizedEmail)}&s=${sig}`
}
