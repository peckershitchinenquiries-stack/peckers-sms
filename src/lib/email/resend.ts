import 'server-only'

import { Resend } from 'resend'

export interface SendEmailInput {
  to: string[]
  subject: string
  html: string
  text: string
}

export interface SendEmailResult {
  sent: boolean
  skipped?: string
  id?: string
}

/**
 * Sends through Resend.
 *
 * Missing configuration is a skip, not a throw: a kitchen app should keep
 * working when the mail provider isn't set up yet, and the caller logs the
 * reason.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL

  if (!apiKey) return { sent: false, skipped: 'RESEND_API_KEY is not set' }
  if (!from) return { sent: false, skipped: 'RESEND_FROM_EMAIL is not set' }
  if (input.to.length === 0) return { sent: false, skipped: 'No recipients configured' }

  const resend = new Resend(apiKey)

  const { data, error } = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  })

  if (error) {
    throw new Error(`Resend: ${error.message}`)
  }

  return { sent: true, id: data?.id }
}
