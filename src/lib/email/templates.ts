import type { DateOnly } from '@/lib/date'

/* -------------------------------------------------------------------------- */
/* Shared shell                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Email HTML has to be table-based and inline-styled to survive Outlook and
 * Gmail, so these templates deliberately don't share the app's Tailwind.
 * Colours mirror the design tokens by hand.
 */
const COLOURS = {
  canvas: '#FBFAF8',
  surface: '#FFFFFF',
  border: '#E7E2DA',
  ink: '#232120',
  inkMuted: '#6E6862',
  brand: '#1E5F74',
  danger: '#C2402D',
  dangerSoft: '#FCEEEC',
  warning: '#B8791F',
  warningSoft: '#FCF4E6',
  success: '#2F8F5B',
} as const

function shell(options: { title: string; preheader: string; body: string; ctaUrl?: string }) {
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(options.title)}</title>
</head>
<body style="margin:0;padding:0;background:${COLOURS.canvas};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${COLOURS.ink};">
  <span style="display:none;font-size:1px;color:${COLOURS.canvas};max-height:0;overflow:hidden;">${escapeHtml(options.preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOURS.canvas};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${COLOURS.surface};border:1px solid ${COLOURS.border};border-radius:14px;overflow:hidden;">
          <tr>
            <td style="padding:24px 28px 8px;">
              <p style="margin:0;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${COLOURS.inkMuted};font-weight:600;">Peckers · Sauce Management</p>
              <h1 style="margin:8px 0 0;font-size:22px;line-height:1.25;letter-spacing:-0.02em;color:${COLOURS.ink};">${escapeHtml(options.title)}</h1>
            </td>
          </tr>
          <tr><td style="padding:16px 28px 28px;">${options.body}</td></tr>
          ${
            options.ctaUrl
              ? `<tr><td style="padding:0 28px 28px;">
                   <a href="${options.ctaUrl}" style="display:inline-block;background:${COLOURS.brand};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:10px;">Open the dashboard</a>
                 </td></tr>`
              : ''
          }
        </table>
        <p style="max-width:600px;margin:16px auto 0;font-size:11px;line-height:1.6;color:${COLOURS.inkMuted};text-align:center;">
          Sent by the Peckers Sauce Management System. Change who receives this in Settings → Notifications.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/* -------------------------------------------------------------------------- */
/* Daily expiry digest                                                        */
/* -------------------------------------------------------------------------- */

export interface DigestSiteSection {
  siteName: string
  expiringToday: Array<{ sauceName: string; bags: number }>
  expiringSoon: Array<{ sauceName: string; bags: number; days: number }>
  lowStock: Array<{ sauceName: string; usableBags: number; burnRate: number }>
}

export interface DigestPayload {
  date: DateOnly
  dateLabel: string
  nextPrepLabel: string
  sections: DigestSiteSection[]
  appUrl?: string
}

export function renderDigestEmail(payload: DigestPayload): { subject: string; html: string; text: string } {
  const totalToday = payload.sections.reduce(
    (sum, section) => sum + section.expiringToday.reduce((n, item) => n + item.bags, 0),
    0,
  )
  const totalSoon = payload.sections.reduce(
    (sum, section) => sum + section.expiringSoon.reduce((n, item) => n + item.bags, 0),
    0,
  )

  const subject =
    totalToday > 0
      ? `${totalToday} bag${totalToday === 1 ? '' : 's'} expiring today · Peckers SMS`
      : totalSoon > 0
        ? `${totalSoon} bag${totalSoon === 1 ? '' : 's'} expiring soon · Peckers SMS`
        : 'All clear today · Peckers SMS'

  const intro = `<p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:${COLOURS.inkMuted};">
    ${escapeHtml(payload.dateLabel)} · next prep is ${escapeHtml(payload.nextPrepLabel)}.
  </p>`

  const body =
    totalToday === 0 && totalSoon === 0 && payload.sections.every((s) => s.lowStock.length === 0)
      ? `${intro}<div style="background:#EAF6EF;border:1px solid #D2ECDD;border-radius:10px;padding:16px;">
           <p style="margin:0;font-size:14px;color:${COLOURS.success};font-weight:600;">Nothing expiring and nothing running low.</p>
           <p style="margin:6px 0 0;font-size:13px;color:${COLOURS.inkMuted};">Every bag at both sites has 3 or more days of life left.</p>
         </div>`
      : intro + payload.sections.map(renderSection).join('')

  const text = [
    `Peckers SMS — ${payload.dateLabel}`,
    `Next prep: ${payload.nextPrepLabel}`,
    '',
    ...payload.sections.flatMap((section) => [
      section.siteName.toUpperCase(),
      ...section.expiringToday.map((item) => `  ! ${item.sauceName}: ${item.bags} expiring TODAY`),
      ...section.expiringSoon.map(
        (item) => `  ~ ${item.sauceName}: ${item.bags} expiring in ${item.days} day(s)`,
      ),
      ...section.lowStock.map(
        (item) =>
          `  ↓ ${item.sauceName}: ${item.usableBags} left, using ~${item.burnRate}/day`,
      ),
      '',
    ]),
  ].join('\n')

  return {
    subject,
    html: shell({
      title: 'Daily stock digest',
      preheader: subject,
      body,
      ctaUrl: payload.appUrl,
    }),
    text,
  }
}

function renderSection(section: DigestSiteSection): string {
  const rows: string[] = []

  for (const item of section.expiringToday) {
    rows.push(row(item.sauceName, `${item.bags} expiring today`, COLOURS.danger, COLOURS.dangerSoft))
  }
  for (const item of section.expiringSoon) {
    rows.push(
      row(
        item.sauceName,
        `${item.bags} bag${item.bags === 1 ? '' : 's'} · ${item.days} day${item.days === 1 ? '' : 's'} left`,
        COLOURS.warning,
        COLOURS.warningSoft,
      ),
    )
  }
  for (const item of section.lowStock) {
    rows.push(
      row(
        item.sauceName,
        `${item.usableBags} left · using ~${item.burnRate}/day`,
        COLOURS.warning,
        COLOURS.warningSoft,
      ),
    )
  }

  if (rows.length === 0) {
    rows.push(
      `<tr><td style="padding:10px 0;font-size:13px;color:${COLOURS.inkMuted};">Nothing to flag.</td></tr>`,
    )
  }

  return `<div style="margin-bottom:24px;">
    <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${COLOURS.inkMuted};font-weight:600;">${escapeHtml(section.siteName)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join('')}</table>
  </div>`
}

function row(name: string, detail: string, accent: string, background: string): string {
  return `<tr>
    <td style="padding:4px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${background};border-radius:10px;">
        <tr>
          <td style="padding:11px 14px;border-left:3px solid ${accent};border-radius:10px;">
            <span style="font-size:14px;font-weight:600;color:${COLOURS.ink};">${escapeHtml(name)}</span>
            <span style="display:block;margin-top:2px;font-size:12px;color:${accent};font-weight:500;">${escapeHtml(detail)}</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>`
}

/* -------------------------------------------------------------------------- */
/* Immediate low-stock alert                                                  */
/* -------------------------------------------------------------------------- */

export interface LowStockEmailPayload {
  siteName: string
  sauceName: string
  usableBags: number
  burnRate: number
  nextPrepLabel: string
  actions: Array<{ label: string; description: string }>
  appUrl?: string
}

export function renderLowStockEmail(payload: LowStockEmailPayload): {
  subject: string
  html: string
  text: string
} {
  const subject = `${payload.sauceName} running low at ${payload.siteName} · Peckers SMS`

  const actions = payload.actions
    .map(
      (action) => `<li style="margin:0 0 8px;font-size:13px;line-height:1.6;color:${COLOURS.ink};">
        <strong>${escapeHtml(action.label)}</strong>
        <span style="display:block;color:${COLOURS.inkMuted};">${escapeHtml(action.description)}</span>
      </li>`,
    )
    .join('')

  const body = `
    <div style="background:${COLOURS.dangerSoft};border:1px solid #F8D8D3;border-radius:10px;padding:16px;margin-bottom:20px;">
      <p style="margin:0;font-size:15px;font-weight:600;color:${COLOURS.danger};">
        ${escapeHtml(payload.sauceName)} — ${payload.usableBags} bag${payload.usableBags === 1 ? '' : 's'} left at ${escapeHtml(payload.siteName)}
      </p>
      <p style="margin:6px 0 0;font-size:13px;line-height:1.6;color:${COLOURS.inkMuted};">
        Using about ${payload.burnRate} bags a day. Next prep is ${escapeHtml(payload.nextPrepLabel)}, so this will run out before restock.
      </p>
    </div>
    <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${COLOURS.inkMuted};font-weight:600;">Suggested actions</p>
    <ul style="margin:0;padding-left:18px;">${actions}</ul>`

  const text = [
    `${payload.sauceName} running low at ${payload.siteName}`,
    `${payload.usableBags} bags left, using ~${payload.burnRate}/day. Next prep: ${payload.nextPrepLabel}.`,
    '',
    'Suggested actions:',
    ...payload.actions.map((action) => `- ${action.label}: ${action.description}`),
  ].join('\n')

  return {
    subject,
    html: shell({ title: 'Low stock alert', preheader: subject, body, ctaUrl: payload.appUrl }),
    text,
  }
}
