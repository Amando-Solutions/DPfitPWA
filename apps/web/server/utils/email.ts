// =============================================================================
// Sending the access code, through Brevo's transactional API.
//
// SCOPE, because this repository has a standing decision that looks like it
// contradicts this file. The magic-link sign-in email stays on Firebase's own
// mailer and is not to be routed through a third party — that is settled, and
// nothing here touches it. This is a different email entirely: the one that
// hands somebody the access code they just registered for, which Firebase has
// no equivalent of and which nothing sent at all until now.
//
// HTTP rather than the `@getbrevo/brevo` SDK. One POST to one documented
// endpoint, against a `fetch` that is already in the runtime — a dependency
// would be carrying a client library to save writing an object literal.
// =============================================================================

import * as template from '../emails/access-code'

/** What the email has to say. Everything else about it is configuration. */
export interface AccessCodeEmail {
  to: string
  fullName: string
  code: string
  /** Where the member goes to redeem it. The PWA's origin. */
  appUrl: string
}

export interface BrevoConfig {
  apiKey: string
  senderEmail: string
  senderName: string
  replyTo: string
  /**
   * A template authored in Brevo. When set, the copy lives there and this
   * sends only the parameters, so the coach can rewrite the email without a
   * deploy — at the cost of the design in `server/emails/access-code.ts`,
   * which is the better-looking of the two and the default.
   */
  templateId: string
}

/** Brevo wants `{{ params.FIRST_NAME }}`; these are the names it gets. */
const params = (email: AccessCodeEmail) => ({
  FIRST_NAME: email.fullName.trim().split(' ')[0] ?? '',
  FULL_NAME: email.fullName,
  ACCESS_CODE: email.code,
  APP_URL: email.appUrl,
})

/**
 * Split `Name <someone@example.com>` into the two fields Brevo wants.
 *
 * Worth doing rather than documenting the restriction, because writing a
 * reply-to as `Support <support@example.com>` is what everybody does — it is
 * the form mail clients show and the form every other tool accepts. Sent to
 * Brevo whole it lands in `email`, fails address validation, and comes back as
 * a 400 that says nothing about the angle brackets.
 *
 * A bare address passes through untouched.
 */
const address = (value: string): { email: string; name?: string } | null => {
  const trimmed = value.trim()
  if (!trimmed) return null
  const angled = trimmed.match(/^(.*?)\s*<([^>]+)>$/)
  if (!angled) return { email: trimmed }
  const name = angled[1]!.trim().replace(/^["']|["']$/g, '')
  return name ? { email: angled[2]!.trim(), name } : { email: angled[2]!.trim() }
}

/**
 * Whether enough is configured to send anything.
 *
 * Checked separately from sending so the route can tell "nobody set this up"
 * apart from "Brevo refused", which are different problems with different
 * fixes and would otherwise arrive as the same silent false.
 */
export const canSendEmail = (config: BrevoConfig) =>
  Boolean(config.apiKey && config.senderEmail)

/**
 * Send it, and say whether it went.
 *
 * Never throws. The caller has already issued a code and written it to the
 * database by the time this runs, and an email provider having a bad afternoon
 * must not turn a registration that succeeded into a 500 that tells somebody
 * to try again — they would register twice and get the same code back, which
 * is fine, but they would also have been told something false.
 */
export const sendAccessCodeEmail = async (
  config: BrevoConfig,
  email: AccessCodeEmail,
): Promise<boolean> => {
  if (!canSendEmail(config)) {
    console.warn(
      '[email] Brevo is not configured, so the access code was not emailed. The page ' +
        'still shows it. Set NUXT_BREVO_API_KEY and NUXT_BREVO_SENDER_EMAIL.',
    )
    return false
  }

  // An SMTP key is not an API key, and Brevo answers the difference with
  // `401 {"message":"Key not found"}` — which reads like a typo'd key and sends
  // people to regenerate the wrong credential. The prefixes are unambiguous, so
  // this says it outright rather than letting the 401 mislead.
  if (config.apiKey.startsWith('xsmtpsib-')) {
    console.error(
      '[email] NUXT_BREVO_API_KEY is an SMTP key (xsmtpsib-…), which the REST API ' +
        'rejects with "Key not found". This route needs a v3 API key (xkeysib-…): ' +
        'Brevo → SMTP & API → API Keys, not the SMTP tab beside it.',
    )
    return false
  }

  const sender = address(config.senderEmail)!
  const body: Record<string, unknown> = {
    // An explicit NUXT_BREVO_SENDER_NAME wins; otherwise a name written into
    // the address itself is used, and a bare address sends without one.
    sender: { email: sender.email, name: config.senderName || sender.name || undefined },
    to: [{ email: email.to, name: email.fullName }],
    params: params(email),
  }
  const replyTo = address(config.replyTo)
  if (replyTo) body.replyTo = replyTo

  if (config.templateId) {
    body.templateId = Number(config.templateId)
  } else {
    body.subject = template.subject
    body.htmlContent = template.html({ ...email, email: email.to })
    // Sent alongside the HTML, not instead of it. A message with no text part
    // reads as bulk mail to a spam filter, and some people prefer text.
    body.textContent = template.text({ ...email, email: email.to })
  }

  try {
    // Ten seconds. A registration is waiting on this response, and a provider
    // that has not answered by then is not going to answer usefully.
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': config.apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      // Brevo puts the actionable part in the body — an unverified sender and a
      // bad key look identical from the status code alone.
      console.error(
        `[email] Brevo refused (${response.status}): ${(await response.text()).slice(0, 500)}`,
      )
      return false
    }
    return true
  } catch (cause) {
    console.error('[email] could not reach Brevo:', cause)
    return false
  }
}
