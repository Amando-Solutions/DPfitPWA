// =============================================================================
// The slot-reservation email, as markup.
//
// What a pre-order payment gets instead of the access code. The code already
// exists — it is minted at payment — but it is held until the pre-order
// closes, and this email's job is to say when it will arrive and what the
// days between that and training are for. `access-code.ts` is the email that
// follows; both sit in `layout.ts`.
// =============================================================================

import { BODY, DISPLAY, INK, INK_SOFT, escape, firstNameOf, layout, panel, steps } from './layout'

export interface SlotReservedTemplate {
  fullName: string
  /** Where the code will be sent. */
  email: string
  /** Absolute, with scheme. Only used for the lockups; there is nothing to open yet. */
  appUrl: string
  /** When the pre-order closes and the code is sent, in the cohort's zone. */
  codesOn: string
  /** When training opens: the cohort's start date. */
  startsOn: string
}

export const subject = 'Your DP Fitness spot is reserved'

export const preheader = (codesOn: string) =>
  `Payment received. Your access code arrives by email on ${codesOn}.`

export const text = ({ fullName, email, codesOn, startsOn }: SlotReservedTemplate) =>
  `Hi ${firstNameOf(fullName)},

Payment received: your spot on the 6-Week Recomp Challenge is reserved.

There's nothing to enter yet. Your access code arrives by email when
pre-orders close:

    ${codesOn}

What happens next:

  1. We email your access code to ${email} on ${codesOn}.
  2. Sign in to the app with that address and enter the code. Until training
     opens you can set up your profile, join the group chat and take your
     first progress photo.
  3. Training opens on ${startsOn}.

If you didn't register for the Recomp Challenge, you can ignore this email.

— DP FITNESS
The Recomp Challenge, 6-week group program

Results vary by individual and depend on consistency with training and
nutrition. This program does not replace medical advice, so check with a doctor
before starting if you have any health concerns.
`

export const html = (data: SlotReservedTemplate) => {
  const first = escape(firstNameOf(data.fullName))
  const email = escape(data.email)
  const codesOn = escape(data.codesOn)
  const startsOn = escape(data.startsOn)

  return layout({
    title: subject,
    preheader: preheader(data.codesOn),
    appUrl: data.appUrl,
    content: `<h1 class="h1 t-ink" style="margin:0 0 16px;font-family:${DISPLAY};font-size:28px;line-height:1.2;font-weight:900;letter-spacing:-0.5px;color:${INK};">
          Your spot is reserved, ${first}.
        </h1>

        <p class="t-ink" style="margin:0 0 26px;font-family:${BODY};font-size:16px;line-height:1.65;color:${INK};">
          Payment received. Your place on the 6-Week Recomp Challenge is held,
          and there's nothing to enter yet: your access code comes by email
          when pre-orders close.
        </p>

        <!-- The date, where the access-code email puts the code: it is the one
             thing this email has to tell them. Display face rather than mono,
             because a date is read, not typed. -->
        ${panel('Your access code arrives', `<div class="t-ink" style="margin-top:12px;font-family:${DISPLAY};font-size:22px;line-height:1.3;font-weight:900;color:${INK};">
                ${codesOn}
              </div>`)}

        ${steps('What happens next', [
          `We email your access code to <span class="t-ink" style="color:${INK};font-weight:600;">${email}</span> on ${codesOn}.`,
          `Sign in to the app with that address and enter the code. Until training opens you can set up your profile, join the group chat and take your first progress photo.`,
          `Training opens on <span class="t-ink" style="color:${INK};font-weight:600;">${startsOn}</span>.`,
        ])}

        <p class="t-soft" style="margin:26px 0 0;font-family:${BODY};font-size:14px;line-height:1.6;color:${INK_SOFT};">
          If you didn't register for the Recomp Challenge, you can ignore this
          email.
        </p>`,
  })
}
