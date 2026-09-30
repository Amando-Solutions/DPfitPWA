// =============================================================================
// The access-code email, as markup.
//
// Kept apart from `server/utils/email.ts` because the two change for unrelated
// reasons: that file is about talking to Brevo and would not change if the
// design did, and this one is a design that would not change if the provider
// did.
//
// The shell it sits in — masthead, footer, and the rules for writing HTML
// that survives an inbox — is `layout.ts`, shared with the reservation email.
// =============================================================================

import { BODY, DISPLAY, INK, INK_SOFT, MONO, button, escape, firstNameOf, layout, panel, steps } from './layout'

export { reachableOrigin } from './layout'

export interface AccessCodeTemplate {
  fullName: string
  code: string
  /** Absolute, with scheme. Relative links do not exist in an inbox. */
  appUrl: string
  /** Where the code was sent, restated so it can be checked at a glance. */
  email: string
}

/** The line that shows in the inbox next to the subject. */
export const preheader = (code: string) =>
  `Your access code is ${code}. It gets you into the app — enter it after you sign in.`

export const subject = 'Your DP Fitness access code'

/**
 * The plain-text alternative, and not an afterthought.
 *
 * Sent alongside the HTML because a message with no text part looks like bulk
 * mail to a spam filter, and because some people read mail as text on purpose.
 * It carries the same information in the same order, so nothing is only
 * available to one of the two.
 */
export const text = ({ fullName, code, appUrl, email }: AccessCodeTemplate) =>
  `Hi ${firstNameOf(fullName)},

You're registered for the 6-Week Recomp Challenge. Here is the access code that
gets you into the app:

    ${code}

How to use it:

  1. Open ${appUrl}
  2. Sign in with ${email} — you'll get a link, or use Google
  3. Enter the code when it asks

The code only works for ${email}, so there is nothing to gain by forwarding it.
Keep it somewhere you can find it again.

If you didn't register for the Recomp Challenge, you can ignore this email.

— DP FITNESS
The Recomp Challenge, 6-week group program

Results vary by individual and depend on consistency with training and
nutrition. This program does not replace medical advice, so check with a doctor
before starting if you have any health concerns.
`

export const html = (data: AccessCodeTemplate) => {
  const first = escape(firstNameOf(data.fullName))
  const code = escape(data.code)
  const appUrl = escape(data.appUrl)
  const email = escape(data.email)

  return layout({
    title: subject,
    preheader: preheader(data.code),
    appUrl: data.appUrl,
    content: `<h1 class="h1 t-ink" style="margin:0 0 16px;font-family:${DISPLAY};font-size:28px;line-height:1.2;font-weight:900;letter-spacing:-0.5px;color:${INK};">
          You're in, ${first}.
        </h1>

        <p class="t-ink" style="margin:0 0 26px;font-family:${BODY};font-size:16px;line-height:1.65;color:${INK};">
          Your spot on the 6-Week Recomp Challenge is registered. Here's the
          access code that opens the app.
        </p>

        <!-- The code. Text, not an image, so it can be copied and read aloud. -->
        ${panel('Your access code', `<div class="code t-ink" style="margin-top:12px;font-family:${MONO};font-size:30px;line-height:1.1;font-weight:700;letter-spacing:4px;color:${INK};">
                ${code}
              </div>`)}

        ${button(appUrl, 'Open the app')}

        <!-- Three steps, because "enter your code" leaves out the part people
             actually get stuck on: signing in with the right address first. -->
        ${steps('What to do next', [
          `Open the app and choose to sign in.`,
          `Use <span class="t-ink" style="color:${INK};font-weight:600;">${email}</span> — the address you registered with.`,
          `Enter the code above when it asks for one.`,
        ])}

        <p class="t-soft" style="margin:26px 0 0;font-family:${BODY};font-size:14px;line-height:1.6;color:${INK_SOFT};">
          The code only works for ${email}, so there's nothing to gain by
          forwarding it. If you didn't register for the Recomp Challenge, you
          can ignore this email.
        </p>`,
  })
}
