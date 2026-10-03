// https://nuxt.com/docs/api/configuration/nuxt-config

/**
 * The site's own origin, for the share card and the canonical URL.
 *
 * Deployment metadata, read at build time to make absolute share-card URLs.
 * Cohort and offer content is fetched separately at request time.
 *
 * Unset, a Vercel build falls back to the project's production domain, which
 * Vercel hands every build as `VERCEL_PROJECT_PRODUCTION_URL` (bare host, no
 * scheme). Anywhere else the tags fall back to site-relative paths. Most
 * scrapers resolve those against the page they found them on, but Facebook and
 * LinkedIn hold the spec to its word and drop a relative image — so set
 * `NUXT_PUBLIC_SITE_URL` whenever the custom domain is not the one Vercel picks.
 */
const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL
const siteUrl = (
  process.env.NUXT_PUBLIC_SITE_URL || (vercelHost ? `https://${vercelHost}` : '')
).replace(/\/+$/, '')
const absolute = (path: string) => `${siteUrl}${path}`

const OG_IMAGE = '/og/card.png'
const OG_IMAGE_ALT =
  'The DP Fitness Body Recomp Challenge page: a 6-week coaching challenge for women to build muscle and lose fat at the same time.'

export default defineNuxtConfig({
  // Same design system as the member app in `apps/pwa`: tokens, type ramp,
  // control recipes, the Tailwind build and the five webfonts.
  extends: ['../../packages/theme'],

  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // Render cohort content at request time so deployments never bake in a stale cohort.
  nitro: { prerender: { crawlLinks: false } },

  /**
   * The confirmation page is client-only.
   *
   * It exists only for the moment after a payment, and polls for its answer
   * on the client, so there is nothing to render at build time; `ssr: false`
   * also keeps it out of the crawl that `crawlLinks` runs, which would
   * otherwise try to render a payment confirmation with no payment behind it.
   */
  routeRules: {
    '/': { prerender: false, headers: { 'Cache-Control': 'no-store' } },
    '/registration/complete': {
      ssr: false,
      prerender: false,
      // Nothing to index, and a payment confirmation in a search result is a
      // confusing thing to land on. The robots module turns this into an
      // `X-Robots-Tag: noindex, nofollow` header and keeps the page out of the
      // sitemap. It is deliberately not a `Disallow` in robots.txt: a crawler
      // barred from fetching the page never reads the header.
      robots: false,
    },
  },

  /**
   * robots.txt and sitemap.xml.
   *
   * `zeroRuntime` prerenders `/sitemap.xml` into a static file, because the
   * pages are fixed and there is nothing to work out per request. On App
   * Hosting the robots module serves `/robots.txt` from the server, with a
   * four-hour Cache-Control. (It prerenders robots.txt only for the classic
   * `firebase` preset, which this site no longer uses.)
   *
   * Whether the site may be indexed comes from `site.env`, which defaults to
   * NODE_ENV — `production` for every build, staging included. A staging build
   * has to set NUXT_SITE_ENV=staging, which turns robots.txt into
   * `Disallow: /` and adds a noindex header to every page. See .env.example.
   */
  modules: ['@nuxtjs/robots', '@nuxtjs/sitemap'],

  site: {
    name: 'DP Fitness',
    // The modules read NUXT_PUBLIC_SITE_URL on their own; this only matters
    // when `siteUrl` came from the Vercel fallback above.
    ...(siteUrl ? { url: siteUrl } : {}),
  },

  robots: {
    // Detection is for pages that act on who is asking. None here do.
    botDetection: false,
  },

  sitemap: {
    zeroRuntime: true,
  },

  // A server runtime is required for current Firestore content and checkout.
  // `nuxt generate` cannot provide these API handlers.

  // Auto-import components by filename, matching the PWA's convention, so
  // `components/landing/HeroSection.vue` is `<HeroSection/>`.
  components: [{ path: '~/components', pathPrefix: false, extensions: ['vue'] }],

  css: ['~/assets/styles/main.css'],

  runtimeConfig: {
    /**
     * Server-only, and note the missing `PUBLIC`. Everything under `public`
     * below is compiled into the browser bundle; these are read by the
     * `server/` routes alone and never leave the server.
     *
     * The service account is a project-level credential that bypasses every
     * security rule. It writes `registrations`, which no client may, and it
     * is the identity `createAccessCode` in `apps/functions` accepts when
     * this site asks for a buyer's access code.
     */
    firebaseServiceAccount: process.env.NUXT_FIREBASE_SERVICE_ACCOUNT || '',
    googleApplicationCredentials: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',

    // Where `createAccessCode` answers. Empty builds the deployed URL from
    // the service account's project; set it to reach the emulator, e.g.
    // http://127.0.0.1:5001/recomp-48b7b/africa-south1/createAccessCode
    accessCodeFunctionUrl: process.env.NUXT_ACCESS_CODE_FUNCTION_URL || '',

    // Which database in the project. Empty is `(default)`. Set per environment
    // and never from NODE_ENV, which is `production` for any built bundle
    // including a staging one — the member app's `.env.example` has the long
    // version of this warning.
    firebaseDatabaseId: process.env.NUXT_FIREBASE_DATABASE_ID || '',

    // Temporary fallback only, while the admin console gains these fields.
    // Empty means unavailable; there are no hardcoded cohort/offer defaults.
    registrationCohortId: process.env.NUXT_REGISTRATION_COHORT_ID || '',
    registrationCodeTtlDays: process.env.NUXT_REGISTRATION_CODE_TTL_DAYS || '',
    // The pre-order window, for a cohort whose `registration` map has neither
    // end set. ISO 8601 with an offset, e.g. 2026-10-01T00:00:00+01:00.
    registrationPreorderStartsAt: process.env.NUXT_REGISTRATION_PREORDER_STARTS_AT || '',
    registrationPreorderEndsAt: process.env.NUXT_REGISTRATION_PREORDER_ENDS_AT || '',

    /**
     * What `POST /api/preorder/release` must be sent as a bearer token.
     *
     * The scheduled `releasePreorderCodes` function in `apps/functions` holds
     * the same value as its `PREORDER_RELEASE_SECRET`. Unset, the route refuses
     * everything, and codes held during a pre-order are never sent.
     */
    preorderReleaseSecret: process.env.NUXT_PREORDER_RELEASE_SECRET || '',


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
    // Empty uses the designed markup in `server/emails/access-code.ts`.
    brevoTemplateId: process.env.NUXT_BREVO_TEMPLATE_ID || '',

    public: {
      // Where the "Sign in" and "Register" calls-to-action send someone. The
      // member app is a separate deployment, so this is an absolute origin in
      // production and the local PWA dev server otherwise.
      appUrl: process.env.NUXT_PUBLIC_APP_URL || 'http://localhost:3000',

      /**
       * The address the footer publishes, and the same one Brevo sends the
       * access code from — one address the business answers on, configured
       * once. It has to be a sender Brevo has verified either way, which is
       * the thing that keeps it real rather than aspirational.
       *
       * `public` because the footer is rendered on the client too, and a
       * private key is `undefined` there — which would hydrate the address
       * away on a page that had just printed it. That also means the value
       * ships in the page payload, so this is only ever an address meant to
       * be read by anyone who looks.
       *
       * Empty renders no contact row at all. See `footerColumns`.
       */
      contactEmail: process.env.NUXT_BREVO_SENDER_EMAIL || '',

      /**
       * The Instagram handle the footer links to — `dpfitness`, `@dpfitness`
       * or the full profile URL, whichever got pasted in. Empty drops the
       * row.
       *
       * Deployment metadata, separate from Firestore cohort content.
       */
      instagramHandle: process.env.NUXT_PUBLIC_INSTAGRAM_HANDLE || '',

      /** The TikTok handle the footer links to, in any of the same forms. Empty drops it. */
      tiktokHandle: process.env.NUXT_PUBLIC_TIKTOK_HANDLE || '',

      // Used by the server only when Firestore has no corresponding offer field.
      price: process.env.NUXT_PUBLIC_PRICE || '',
      priceCurrency: process.env.NUXT_PUBLIC_PRICE_CURRENCY || '',


    },
  },

  app: {
    head: {
      htmlAttrs: {
        lang: 'en',
        // The marketing site is a single authored composition — a lavender
        // paper page with plum panels — so it pins the light palette instead
        // of following the visitor's OS. The
        // member app, where someone spends real time, is the one that flips.
        'data-theme': 'light',
      },
      title: 'DP Fitness · Body Recomp Challenge',
      viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
      meta: [
        { charset: 'utf-8' },
        { name: 'theme-color', content: '#1d1628' },
        {
          name: 'description',
          content:
            'Build muscle and lose fat at the same time. A coached body recomp challenge for women: a structured gym program, weekly check-ins and a community of goal-driven women, all inside the DP Fitness app.',
        },
        { property: 'og:type', content: 'website' },
        {
          property: 'og:title',
          content: 'DP Fitness · Body Recomp Challenge',
        },
        {
          property: 'og:description',
          content:
            'Build muscle and lose fat at the same time. A structured gym program, weekly check-ins and a goal-driven community, all inside the DP Fitness app.',
        },
        /**
         * The share card. `summary_large_image` was already being declared
         * without an `og:image` to back it, which is the one combination that
         * renders worse than claiming nothing: the platform reserves the big
         * slot and then has nothing to put in it, so every shared link
         * unfurled to a blank rectangle.
         *
         * `/og/card.png` is this site's own card: the landing page's opening
         * screen, rendered by `scripts/generate-og-image.mjs` from a running
         * copy of the site, without the countdown or the row of cohort dates,
         * which a card cached for weeks would carry past their cohort. Rerun
         * that script after changing the hero rather than editing the PNG.
         * It is 1200 x 630, the 1.91:1 every platform lays a large card out
         * at, so none of them crops it differently. It is kept a PNG for the
         * type and well under WhatsApp's ~300KB ceiling, past which WhatsApp
         * unfurls the link with no image at all. The dimensions are stated
         * because a scraper that knows the size up front can lay the card out
         * without fetching the image first.
         *
         * Scrapers cache the image by URL, for weeks in Facebook's and
         * WhatsApp's case, so a new card wants a new filename, not the old one
         * overwritten.
         */
        { name: 'twitter:card', content: 'summary_large_image' },
        { property: 'og:image', content: absolute(OG_IMAGE) },
        { property: 'og:image:type', content: 'image/png' },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:alt', content: OG_IMAGE_ALT },
        { name: 'twitter:image', content: absolute(OG_IMAGE) },
        { name: 'twitter:image:alt', content: OG_IMAGE_ALT },
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
        // Instrument Serif for the italic half of every heading. Manrope, the
        // page's sans, already comes in with the theme layer's font request.
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap',
        },
        { rel: 'icon', type: 'image/svg+xml', href: '/brand/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/brand/favicon-32.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/brand/apple-touch-icon.png' },
      ],
    },
  },
})
