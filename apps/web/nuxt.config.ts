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

  // Auto-import components by filename, matching the PWA's convention, so
  // `components/landing/HeroSection.vue` is `<HeroSection/>`.
  components: [{ path: '~/components', pathPrefix: false, extensions: ['vue'] }],

  css: ['~/assets/styles/main.css'],

  runtimeConfig: {
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
