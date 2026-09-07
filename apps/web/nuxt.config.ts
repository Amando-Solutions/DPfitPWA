// https://nuxt.com/docs/api/configuration/nuxt-config

/**
 * The site's own origin, for the share card and the canonical URL.
 *
 * Read here at build time rather than through `runtimeConfig`, because this
 * page is prerendered: the HTML a crawler is served is written during the
 * build, so that is when the value has to exist. It is only ever used to make
 * an absolute URL out of a path.
 *
 * Unset, the tags fall back to site-relative paths. Most scrapers resolve
 * those against the page they found them on and the card still renders, but
 * the spec asks for absolute and some of them hold it to that — so set
 * `NUXT_PUBLIC_SITE_URL` in production.
 */
const siteUrl = (process.env.NUXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '')
const absolute = (path: string) => `${siteUrl}${path}`

export default defineNuxtConfig({
  // Same design system as the member app in `apps/pwa`: tokens, type ramp,
  // control recipes, the Tailwind build and the five webfonts.
  extends: ['../../packages/theme'],

  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  /**
   * The opposite call from the PWA, for the opposite reason.
   *
   * Every word on this site is known at build time and its whole job is to be
   * found and read by someone who has never heard of DP Fitness, so it is
   * rendered to static HTML: a crawler gets the copy without running any
   * JavaScript, and the first paint is the finished page rather than a shell.
   * `crawlLinks` follows the in-page anchors, so adding a route to `pages/` is
   * enough to get it prerendered.
   */
  nitro: {
    prerender: {
      routes: ['/'],
      crawlLinks: true,
    },
  },

  /**
   * The confirmation page is the one route that must not be prerendered.
   *
   * It exists only for the moment after a payment, and polls for its answer
   * on the client, so there is nothing to render at build time; `ssr: false`
   * also keeps it out of the crawl that `crawlLinks` runs, which would
   * otherwise try to render a payment confirmation with no payment behind it.
   */
  routeRules: {
    '/registration/complete': {
      ssr: false,
      prerender: false,
      // Nothing to index, and a payment confirmation in a search result is a
      // confusing thing to land on. `robots: false` would need the robots
      // module; the header is understood without it.
      headers: { 'X-Robots-Tag': 'noindex, nofollow' },
    },
  },

  // NOTE: `server/api/register.post.ts` needs a server runtime. Prerendering
  // `/` is fine — it renders the page to HTML at build time and the route is
  // still served at request time — but `nuxt generate` is not: it produces a
  // pure static output with no handler behind `/api/register`, and the
  // registration form would 404 on submit.

  // Auto-import components by filename, matching the PWA's convention, so
  // `components/landing/HeroSection.vue` is `<HeroSection/>`.
  components: [{ path: '~/components', pathPrefix: false, extensions: ['vue'] }],

  css: ['~/assets/styles/main.css'],

  runtimeConfig: {
    /**
     * Server-only, and note the missing `PUBLIC`. Everything under `public`
     * below is compiled into the browser bundle; these are read by
     * `server/api/register.post.ts` alone and never leave the server.
     *
     * The service account is a project-level credential that bypasses every
     * security rule, which is exactly why the access code is minted on the
     * server: `firestore.rules` allows `create` on `accessCodes` only to a
     * coach, and the visitor filling in the form is not signed in at all.
     */
    firebaseServiceAccount: process.env.NUXT_FIREBASE_SERVICE_ACCOUNT || '',
    googleApplicationCredentials: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',

    // Which database in the project. Empty is `(default)`. Set per environment
    // and never from NODE_ENV, which is `production` for any built bundle
    // including a staging one — the member app's `.env.example` has the long
    // version of this warning.
    firebaseDatabaseId: process.env.NUXT_FIREBASE_DATABASE_ID || '',

    // The cohort a self-serve registration joins. It has to name a real
    // cohort: the member-create rule re-reads the code document and refuses to
    // write a member into a cohort the code does not name.
    registrationCohortId: process.env.NUXT_REGISTRATION_COHORT_ID || 'cohort-01',

    // How long an issued code stays redeemable. The claim rule refuses a past
    // `expiresAt`, so this is the window somebody has to actually sign up.
    registrationCodeTtlDays: process.env.NUXT_REGISTRATION_CODE_TTL_DAYS || '30',

    /**
     * Selar. A product link and a secret, and neither is optional.
     *
     * There is no API key here because there is no API: Selar has no call that
     * initialises a transaction and none that verifies one. The product is
     * created once in their dashboard, carries its own price, and is sold from
     * the hosted page this URL points at — `server/api/register.post.ts` only
     * pre-fills that page and sends the browser to it.
     *
     * Which leaves the secret doing all the work. Selar signs nothing, so the
     * token below is the only thing separating `api/payment/webhook` from
     * anybody who can guess the URL and post a made-up sale. It is generated by
     * us, set on both ends, and wants to be long and random.
     */
    selarProductUrl: process.env.NUXT_SELAR_PRODUCT_URL || '',
    selarWebhookSecret: process.env.NUXT_SELAR_WEBHOOK_SECRET || '',

    /**
     * Brevo, for the one email this site sends: the access code.
     *
     * Not the sign-in email. That one is Firebase's own mailer and stays there
     * — it lives in the member app, and this deployment has no part in it.
     *
     * Unset is a supported state only in the sense that nothing crashes:
     * `sendAccessCodeEmail` warns and reports that it did not send, the seat is
     * still issued, and `emailed: false` is written so it can be found. The code
     * is never rendered anywhere, so a buyer whose email did not send has to be
     * reached by hand.
     */
    brevoApiKey: process.env.NUXT_BREVO_API_KEY || '',
    brevoSenderEmail: process.env.NUXT_BREVO_SENDER_EMAIL || '',
    brevoSenderName: process.env.NUXT_BREVO_SENDER_NAME || 'DP Fitness',
    brevoReplyTo: process.env.NUXT_BREVO_REPLY_TO || '',
    // A template authored in Brevo, so the copy can change without a deploy.
    // Empty uses the fallback markup in `server/utils/email.ts`.
    brevoTemplateId: process.env.NUXT_BREVO_TEMPLATE_ID || '',

    public: {
      // Where the "Sign in" and "Register" calls-to-action send someone. The
      // member app is a separate deployment, so this is an absolute origin in
      // production and the local PWA dev server otherwise.
      appUrl: process.env.NUXT_PUBLIC_APP_URL || 'http://localhost:3000',
    },
  },

  app: {
    head: {
      htmlAttrs: {
        lang: 'en',
        // The marketing site is a single authored composition — the hero and
        // the closing panel are dark *by design*, on a warm paper page — so it
        // pins the light palette instead of following the visitor's OS. The
        // member app, where someone spends real time, is the one that flips.
        'data-theme': 'light',
      },
      title: 'DP Fitness · Lose the fat. Keep the muscle. Do both at once.',
      viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
      meta: [
        { charset: 'utf-8' },
        { name: 'theme-color', content: '#241b2e' },
        {
          name: 'description',
          content:
            'A 6-week body recomposition challenge for people who are done choosing between losing fat and building muscle. Coached programming, weekly check-ins, and proof you can measure.',
        },
        { property: 'og:type', content: 'website' },
        {
          property: 'og:title',
          content: 'DP Fitness · Lose the fat. Keep the muscle. Do both at once.',
        },
        {
          property: 'og:description',
          content:
            'A 6-week body recomposition challenge. Coached programming, weekly check-ins, and proof you can measure.',
        },
        /**
         * The share card. `summary_large_image` was already being declared
         * without an `og:image` to back it, which is the one combination that
         * renders worse than claiming nothing: the platform reserves the big
         * slot and then has nothing to put in it, so every shared link
         * unfurled to a blank rectangle.
         *
         * `/brand/og.png` comes from the shared layer like the rest of the
         * artwork. The dimensions are stated because a scraper that knows the
         * size up front can lay the card out without fetching the image first.
         */
        { name: 'twitter:card', content: 'summary_large_image' },
        { property: 'og:image', content: absolute('/brand/og.png') },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:alt', content: 'DP Fitness' },
        { name: 'twitter:image', content: absolute('/brand/og.png') },
        { property: 'og:site_name', content: 'DP Fitness' },
        // Only when the origin is actually known: a relative `og:url` is
        // meaningless, where a relative `og:image` at least resolves.
        ...(siteUrl ? [{ property: 'og:url', content: siteUrl + '/' }] : []),
      ],
      // Everything under `/brand/` is served out of the shared design-system
      // layer, not this app's `public/`, so the tab icon here and the one on a
      // member's home screen are the same file rather than two copies that can
      // drift. Regenerate the set with `bun run brand:assets` after changing
      // anything in `/logo`; don't retouch a PNG by hand.
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/brand/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/brand/favicon-32.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/brand/apple-touch-icon.png' },
      ],
    },
  },
})
