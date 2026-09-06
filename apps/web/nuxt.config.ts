// https://nuxt.com/docs/api/configuration/nuxt-config
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
   * It exists only for a `reference` in a query string, so there is nothing to
   * render at build time; `ssr: false` also keeps it out of the crawl that
   * `crawlLinks` runs, which would otherwise try to render a payment
   * confirmation with no payment behind it.
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
     * Brevo, for the one email this site sends: the access code.
     *
     * Not the sign-in email. That one is Firebase's own mailer and stays there
     * — it lives in the member app, and this deployment has no part in it.
     *
     * Unset is a supported state. `sendAccessCodeEmail` warns and reports that
     * it did not send; the code still appears on the page, so registration
     * works with none of this configured.
     */
    /**
     * Paystack. The secret key only — the redirect flow initialises the
     * transaction server-side and hands the browser a URL, so no public key is
     * bundled and the amount is never decided in the client.
     *
     * The same key signs the webhook, which is why there is no separate
     * webhook secret to configure.
     */
    paystackSecretKey: process.env.NUXT_PAYSTACK_SECRET_KEY || '',

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

      // This deployment's own origin. Needed because Paystack redirects a
      // browser back here from its own domain, and a relative callback URL
      // means nothing there. Wrong value, and buyers pay and land nowhere.
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3001',
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
        { name: 'twitter:card', content: 'summary_large_image' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/icons/favicon-32.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/icons/apple-touch-icon.png' },
      ],
    },
  },
})
