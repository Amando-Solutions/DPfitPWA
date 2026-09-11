// =============================================================================
// The access-code email, as markup.
//
// Kept apart from `server/utils/email.ts` because the two change for unrelated
// reasons: that file is about talking to Brevo and would not change if the
// design did, and this one is a design that would not change if the provider
// did.
//
// WRITING HTML FOR EMAIL, IN SHORT
//
// Email clients are not browsers, and Outlook on Windows renders through Word.
// Four rules follow from that and every odd-looking thing below is one of them:
//
//   1. Tables, not divs. Word ignores `max-width` on a block element, so the
//      column is a table with a fixed `width` attribute. `role="presentation"`
//      keeps a screen reader from announcing the layout as data.
//   2. Inline styles for anything that matters. Several clients strip `<style>`
//      entirely, so the `<style>` block below carries only enhancements — dark
//      mode and the mobile breakpoint — and never a rule the email needs.
//   3. No web fonts. Chivo and Space Mono will not load, so the stacks start
//      with them for the handful of clients that render locally installed
//      fonts and fall back to system faces everywhere else. The brand survives
//      as weight, colour and spacing rather than as letterforms.
//   4. Images are guilty until proven innocent — Gmail blocks them outright
//      for a sender nobody has replied to, which this one is. So the only two
//      here are the brand lockups, each carrying the wordmark as styled `alt`
//      text, and nothing this email has to say lives only in a picture.
//
//      Alt text is only a fallback if it FITS. A blocked image leaves a box of
//      exactly the declared width and clips whatever does not fit inside it,
//      so the two sizes below are not free: each is the smallest exact
//      downscale of the 192x150 export whose `alt` still fits on one line at a
//      legible size — 96px at 16px type, 64px at 11px. Shrink either and the
//      masthead reads DP FITNES. Measure before changing them.
//
//      They are also only emitted when `appUrl` is an origin a third party's
//      network can actually reach — see `reachableOrigin` — because a `src`
//      nobody can fetch is worse than no `src` at all.
//
// Every colour is a literal, taken from `packages/theme/styles/theme.css` and
// `apps/web/app/assets/styles/main.css`. A CSS variable would resolve to
// nothing in most clients, so the values are copied and named in comments; if
// the palette moves, this file has to be updated by hand.
// =============================================================================

export interface AccessCodeTemplate {
  fullName: string
  code: string
  /** Absolute, with scheme. Relative links do not exist in an inbox. */
  appUrl: string
  /** Where the code was sent, restated so it can be checked at a glance. */
  email: string
}

// --- Palette ---------------------------------------------------------------
// Named for the token each one copies, so the two can be compared.
const PAPER = '#fbf8f5' //  --page      the warm page the site sits on
const NIGHT = '#0f0a14' //  --night     the hero and closing panels
const INK = '#241b2e' //    --text      body copy
const INK_SOFT = '#6a5f72' // --ink-mute  asides and captions
const ROSE = '#c81e5c' //   --rose-fill the accent, as a solid
const ROSE_SOFT = '#fdf0f4' // --rose-softer, flattened: no alpha in Outlook
const RULE = '#e6dfd9' //   --rule, flattened against PAPER for the same reason

// Chivo and Space Mono are the brand faces; the rest of each stack is what
// actually renders in an inbox.
const DISPLAY = "'Chivo', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const BODY =
  "'Schibsted Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const MONO = "'Space Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace"

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )

const firstNameOf = (fullName: string) => fullName.trim().split(/\s+/)[0] ?? ''

/**
 * Hosts that exist only on the machine that names them.
 *
 * Loopback, the three private IPv4 blocks, and mDNS. A dev origin is the
 * common one and the only one anybody sets on purpose, but a staging box on a
 * LAN address fails the same way and for the same reason.
 */
const PRIVATE_HOST =
  /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[?::1\]?|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|.+\.local)$/i

/**
 * The origin as an email may use it, or `null` if it may not.
 *
 * Returned without a trailing slash so a path can be appended directly. `null`
 * for anything a third party's network could not resolve: a relative or
 * malformed URL, a scheme other than http(s) — a `capacitor://` or custom
 * scheme is a real thing to find in an app URL and is not fetchable — and any
 * of the private hosts above.
 */
export const reachableOrigin = (url: string): string | null => {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
  if (PRIVATE_HOST.test(parsed.hostname)) return null
  return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '')
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
  /**
   * The origin the two lockups are fetched from, or `null` for nowhere.
   *
   * The member app serves `/brand/` out of the shared design-system layer
   * exactly as the site does, and `appUrl` already has to be an absolute
   * origin for the button below to work at all — so hanging the images off it
   * needs no second URL kept in configuration, and cannot end up pointing
   * somewhere the call to action does not.
   *
   * `null` when that origin is not one an inbox could fetch from, which is the
   * default state of a checkout: `NUXT_PUBLIC_APP_URL` ships as
   * `http://localhost:3000`. An image in an email is not loaded by the reader's
   * machine — Gmail fetches it through a proxy on Google's own network, and
   * every other client is somewhere else too — so a loopback or LAN origin
   * resolves to *their* localhost, which is nothing, and the masthead lands as
   * a broken-image icon. Falling back to the typeset wordmark below is not a
   * degraded email; it is the masthead this one had before the artwork
   * existed, and it renders everywhere.
   */
  // From the raw value, not `appUrl` above: `escape` has already turned any
  // `&` into `&amp;`, which `new URL` would carry into the parsed result.
  const origin = reachableOrigin(data.appUrl)
  const assets = origin ? escape(origin) : null

  return `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<!-- Tells a client this email has a dark treatment of its own, which stops
     Apple Mail and Outlook inventing one by inverting the colours. Gmail
     inverts regardless; the palette below is chosen to survive that. -->
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escape(subject)}</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings>
  <o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings></xml></noscript>
<![endif]-->
<style>
  /* Enhancements only. Everything this email needs to read correctly is
     inlined below, because a fair number of clients discard this block. */
  body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
  table { border-collapse: collapse !important; }
  /* Stops iOS and Outlook.com auto-linking the code and the address, which
     turns them blue and underlined in the middle of a considered layout. */
  a[x-apple-data-detectors], .unstyle-auto a { color: inherit !important; text-decoration: none !important; }

  @media only screen and (max-width: 620px) {
    .container { width: 100% !important; }
    .pad { padding-left: 24px !important; padding-right: 24px !important; }
    .code { font-size: 26px !important; letter-spacing: 3px !important; }
    .h1 { font-size: 25px !important; }
  }

  /* Dark mode, for the clients that honour a declared one rather than
     inverting. The paper becomes the night panel the site already uses, so
     this reads as the same brand rather than as a washed-out light email. */
  @media (prefers-color-scheme: dark) {
    .bg-outer { background: #07040a !important; }
    .bg-card { background: #16101c !important; }
    .bg-code { background: #201525 !important; border-color: #3d2436 !important; }
    .t-ink { color: ${PAPER} !important; }
    .t-soft { color: #b3a8bc !important; }
    .rule { border-color: #2e2436 !important; }
    /* The footer lockup, swapped for the colourway the night panel can carry.
       Both are hidden and shown inline as well, so a client that drops this
       block shows the light one on its own rather than both. */
    .logo-light { display: none !important; }
    .logo-dark { display: inline-block !important; }
    /* And the build credit with it. #8f4d2a is 2.5:1 on the night panel, so
       the terracotta lifts rather than simply carrying over. */
    .credit-light { display: none !important; }
    .credit-dark { display: inline-block !important; }
  }
</style>
</head>
<body class="bg-outer" style="margin:0;padding:0;background:${PAPER};">

<!-- The inbox preview line. Hidden in the body, then padded with zero-width
     characters so the client does not pull the greeting in after it. -->
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
  ${escape(preheader(data.code))}
  ${'&#8204;&nbsp;'.repeat(60)}
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg-outer" style="background:${PAPER};">
<tr><td align="center" style="padding:32px 12px;">

  <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">

    <!-- Masthead: the brand lockup, as a hosted PNG.
         An inbox takes neither the <BrandLogo> component nor an SVG — Gmail
         strips <svg> outright and refuses a data: URI on an <img> — so a
         raster off the app's own origin is the only way the real artwork gets
         here. /brand/logo-white.png is generated from /logo at the repo
         root by "bun run brand:assets"; don't retouch it by hand.

         All-white rather than the plum mark, per BrandLogo's own note: the
         plum is a deep violet and disappears into a surface this dark.

         The alt text is the wordmark, and the img's own font and colour
         rules style it, so a client with images off falls back to the typeset
         lockup rather than to a broken-image icon. -->
    <tr>
      <td align="center" style="background:${NIGHT};border-radius:14px 14px 0 0;padding:${assets ? '24px' : '26px 24px'};">
        ${
          assets
            ? `<img src="${assets}/brand/logo-white.png" width="96" height="75" alt="DP FITNESS" style="display:block;width:96px;height:75px;border:0;outline:none;text-decoration:none;font-family:${DISPLAY};font-size:16px;font-weight:900;letter-spacing:-0.02em;color:${PAPER};">`
            : `<span style="font-family:${DISPLAY};font-size:19px;font-weight:900;letter-spacing:-0.02em;color:${PAPER};">DP<span style="color:${ROSE};">.</span>FITNESS</span>`
        }
      </td>
    </tr>

    <tr>
      <td class="bg-card pad" style="background:#ffffff;border-radius:0 0 14px 14px;padding:38px 44px 34px;">

        <h1 class="h1 t-ink" style="margin:0 0 16px;font-family:${DISPLAY};font-size:28px;line-height:1.2;font-weight:900;letter-spacing:-0.5px;color:${INK};">
          You're in, ${first}.
        </h1>

        <p class="t-ink" style="margin:0 0 26px;font-family:${BODY};font-size:16px;line-height:1.65;color:${INK};">
          Your spot on the 6-Week Recomp Challenge is registered. Here's the
          access code that opens the app.
        </p>

        <!-- The code. The one thing this email exists to deliver, so it gets
             the only tinted panel and the largest type on the page. Text, not
             an image, so it can be copied and read aloud. -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="unstyle-auto">
          <tr>
            <td class="bg-code" align="center" style="background:${ROSE_SOFT};border:1px solid ${RULE};border-radius:12px;padding:24px 16px;">
              <div style="font-family:${MONO};font-size:11px;line-height:1;letter-spacing:1.6px;text-transform:uppercase;color:${INK_SOFT};">
                Your access code
              </div>
              <div class="code t-ink" style="margin-top:12px;font-family:${MONO};font-size:30px;line-height:1.1;font-weight:700;letter-spacing:4px;color:${INK};">
                ${code}
              </div>
            </td>
          </tr>
        </table>

        <!-- Bulletproof button: VML for Outlook, a padded anchor everywhere
             else. Outlook will not paint a background colour on an <a>, so
             without the conditional block it renders as bare blue text. -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="padding:28px 0 6px;">
            <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${appUrl}" style="height:48px;v-text-anchor:middle;width:230px;" arcsize="52%" stroke="f" fillcolor="${ROSE}">
              <w:anchorlock/>
              <center style="color:#ffffff;font-family:${BODY};font-size:16px;font-weight:600;">Open the app</center>
            </v:roundrect>
            <![endif]-->
            <!--[if !mso]><!-- -->
            <a href="${appUrl}" style="display:inline-block;background:${ROSE};color:#ffffff;font-family:${BODY};font-size:16px;font-weight:600;line-height:1;text-decoration:none;padding:16px 34px;border-radius:999px;">Open the app</a>
            <!--<![endif]-->
          </td></tr>
        </table>

        <!-- Three steps, because "enter your code" leaves out the part people
             actually get stuck on: signing in with the right address first. -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:30px;">
          <tr>
            <td class="rule" style="border-top:1px solid ${RULE};padding-top:24px;">
              <div style="font-family:${MONO};font-size:11px;line-height:1;letter-spacing:1.6px;text-transform:uppercase;color:${INK_SOFT};padding-bottom:14px;">
                What to do next
              </div>
              ${[
                `Open the app and choose to sign in.`,
                `Use <span class="t-ink" style="color:${INK};font-weight:600;">${email}</span> — the address you registered with.`,
                `Enter the code above when it asks for one.`,
              ]
                .map(
                  (step, i) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                <td width="26" valign="top" style="font-family:${MONO};font-size:13px;line-height:1.6;font-weight:700;color:${ROSE};padding-bottom:${i === 2 ? '0' : '8px'};">${i + 1}.</td>
                <td class="t-ink" valign="top" style="font-family:${BODY};font-size:15px;line-height:1.6;color:${INK};padding-bottom:${i === 2 ? '0' : '8px'};">${step}</td>
              </tr></table>`,
                )
                .join('')}
            </td>
          </tr>
        </table>

        <p class="t-soft" style="margin:26px 0 0;font-family:${BODY};font-size:14px;line-height:1.6;color:${INK_SOFT};">
          The code only works for ${email}, so there's nothing to gain by
          forwarding it. If you didn't register for the Recomp Challenge, you
          can ignore this email.
        </p>

      </td>
    </tr>

    <!-- Footer. The disclaimer is the same sentence the site's footer carries;
         it belongs here for the same reason it belongs there. -->
    <tr>
      <td align="center" style="padding:26px 24px 8px;">
        <!-- The lockup again, in whichever colourway the ground calls for.
             The plum mark over a black wordmark cannot be read on the night
             panel that dark mode swaps in, so the all-white export travels
             beside it and the <style> block above trades the two. Each is
             hidden or shown inline as well, per rule 2, so a client that
             discards that block still shows exactly one. -->
        ${
          assets
            ? `<img class="logo-light" src="${assets}/brand/logo-color.png" width="64" height="50" alt="DP FITNESS" style="display:inline-block;width:64px;height:50px;border:0;outline:none;text-decoration:none;font-family:${DISPLAY};font-size:11px;font-weight:900;letter-spacing:-0.02em;color:${INK_SOFT};">
        <img class="logo-dark" src="${assets}/brand/logo-white.png" width="64" height="50" alt="DP FITNESS" style="display:none;width:64px;height:50px;border:0;outline:none;text-decoration:none;font-family:${DISPLAY};font-size:11px;font-weight:900;letter-spacing:-0.02em;color:#b3a8bc;">`
            : `<div style="font-family:${DISPLAY};font-size:14px;font-weight:900;letter-spacing:-0.02em;color:${INK_SOFT};">DP<span style="color:${ROSE};">.</span>FITNESS</div>`
        }
        <div class="t-soft" style="margin-top:8px;font-family:${BODY};font-size:12.5px;line-height:1.6;color:${INK_SOFT};">
          The Recomp Challenge · 6-week group program
        </div>
        <div class="t-soft" style="margin-top:14px;font-family:${BODY};font-size:11.5px;line-height:1.6;color:${INK_SOFT};max-width:430px;">
          Results vary by individual and depend on consistency with training and
          nutrition. This program does not replace medical advice, so check with
          a doctor before starting if you have any health concerns.
        </div>

        <!-- The build credit, on the floor of the email.

             "Powered by" stays live text — it is the half that should be
             selectable and read aloud, and it takes the footer's muted ink
             through .t-soft rather than being frozen into a raster at one
             colour. Only amando's artwork is an image, for the reason the
             lockups above are: a mail client will not take an SVG.

             text-transform is on the label alone. The wordmark is lowercase by
             design, and the rule would otherwise reach the alt text and set
             the brand as AMANDO on any client with images turned off.

             (No backticks anywhere in here: this whole document is one
             template literal, and one would end it.) -->
        <div style="margin-top:20px;font-family:${MONO};font-size:9.5px;line-height:1;color:${INK_SOFT};">
          <span class="t-soft" style="letter-spacing:1px;text-transform:uppercase;color:${INK_SOFT};">Powered by</span>
          ${
            assets
              ? `<img class="credit-light" src="${assets}/brand/credit-color.png" width="62" height="11" alt="amando" style="display:inline-block;vertical-align:middle;margin-left:6px;width:62px;height:11px;border:0;outline:none;text-decoration:none;font-family:${BODY};font-size:11px;color:#8f4d2a;">
          <img class="credit-dark" src="${assets}/brand/credit-lifted.png" width="62" height="11" alt="amando" style="display:none;vertical-align:middle;margin-left:6px;width:62px;height:11px;border:0;outline:none;text-decoration:none;font-family:${BODY};font-size:11px;color:#c4794f;">`
              : `<span style="font-family:${BODY};font-size:11px;color:#8f4d2a;">amando</span>`
          }
        </div>
      </td>
    </tr>

  </table>
  <!--[if mso]></td></tr></table><![endif]-->

</td></tr>
</table>
</body>
</html>`
}
