import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  // The design system — tokens, type ramp, control recipes, the Tailwind build
  // and the five webfonts — is a layer shared with the public site in
  // `apps/web`. `app/assets/styles/main.css` imports its stylesheet; everything
  // else it contributes arrives through this extend.
  extends: ['../../packages/theme'],

  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // Single-page app. Every screen is driven by member data held on the device,
  // so server rendering would only ever emit an empty shell and then have to be
  // replaced on hydration. `spa-loading-template.html` covers the first paint.
  ssr: false,

  // `ssr: false` alone leaves Nitro rendering the SPA shell per request, so
  // `nuxt build` emits no HTML at all into `.output/public`. The service worker
  // needs one: @vite-pwa/nuxt rewrites the precached `index.html` entry to `/`,
  // which is the `navigateFallback` below, and without that entry Workbox
  // throws `non-precached-url :: [{"url":"/"}]` on registration and every
  // offline navigation fails. Prerendering `/` writes the shell to disk so it
  // lands in the precache manifest. `crawlLinks` stays off because the shell is
  // the only thing worth prerendering; every route renders from it on the
  // client anyway.
  nitro: {
    prerender: {
      routes: ['/'],
      crawlLinks: false,
    },
  },

  /**
   * Keep the handle on the sign-in popup.
   *
   * `signInWithPopup` opens a window, waits for it to post the credential
   * back, and then closes it. `accounts.google.com` sets its own
   * Cross-Origin-Opener-Policy, and against our default of `unsafe-none` the
   * browser severs the opener relationship: the sign-in still completes, but
   * the tidy-up afterwards cannot, so Chrome logs "Cross-Origin-Opener-Policy
   * policy would block the window.close call" and the member is left staring
   * at a stranded Google window over an app that has already signed them in.
   *
   * `same-origin-allow-popups` is the pairing Google's own docs ask for. It is
   * *stricter* than the default in every direction except the one that matters
   * — a window this page opened itself stays reachable — so nothing else on
   * the origin loosens to buy it.
   *
   * Set here for `nuxt dev` and `nuxt preview`, and compiled by Nitro into
   * whatever the deploy target reads. `firebase.json` declares the same header
   * for the days this is served from Firebase Hosting, so the two have to be
   * changed together.
   */
  routeRules: {
    '/**': {
      headers: { 'Cross-Origin-Opener-Policy': 'same-origin-allow-popups' },
    },

    /**
     * The worker and the manifest must never be answered from a cache.
     *
     * A released change only reaches a device that already has the app when the
     * browser's update check fetches a byte-different `/sw.js`: that is what
     * triggers an install, and `registerType: 'autoUpdate'` reloads the page
     * from there. Served under a host's default `max-age`, that check gets the
     * old bytes back, no install happens, and the precache the old worker is
     * holding stays exactly where it was — which is the whole of the
     * "deployed, but still serving the old app" symptom.
     *
     * `firebase.json` declares the same header, but only Firebase Hosting reads
     * that file. These rules are compiled into whatever the deploy target
     * actually reads — `.vercel/output/config.json` on Vercel, `_headers` on
     * Netlify and Cloudflare Pages — so the guarantee travels with the app
     * instead of belonging to one host. Keep the two in step.
     *
     * Nothing else needs this: `/_nuxt/**` is content-hashed, and so is the
     * `workbox-*.js` the worker imports, so a new build is a new filename.
     */
    '/sw.js': {
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    },
    '/manifest.webmanifest': {
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    },
  },

  modules: [
    '@vite-pwa/nuxt',
    // Nuxt's app manifest lives at `.nuxt/manifest/meta/<buildId>.json` and is
    // reached through the server-only `#app-manifest` alias. Nitro writes that
    // file when it bundles, which during `nuxt dev` happens *after* Vite has
    // pre-transformed the composable importing it, hence the cold-start
    // "Failed to resolve import '#app-manifest'" errors. Nuxt seeds a
    // placeholder itself for `nuxt build` but not for `nuxt dev`, so do it
    // here; Nitro overwrites it with the real manifest moments later.
    (_options, nuxt) => {
      if (!nuxt.options.dev) return
      nuxt.hook('build:before', async () => {
        const manifestPath = nuxt.options.alias['#app-manifest']
        if (typeof manifestPath !== 'string' || existsSync(manifestPath)) return
        await mkdir(dirname(manifestPath), { recursive: true })
        await writeFile(
          manifestPath,
          JSON.stringify({
            id: basename(manifestPath, '.json'),
            timestamp: Date.now(),
            prerendered: [],
          }),
        )
      })
    },
  ],

  // Auto-import components by filename (no directory prefix), so
  // components/shell/AppShell.vue is <AppShell/>, etc.
  //
  // `extensions` is narrowed to Vue files because the shadcn components under
  // `components/ui/*` ship a barrel `index.ts` each, and Nuxt would otherwise
  // register that barrel as a component named after its directory: `Dialog`
  // from `ui/dialog/index.ts` colliding with `Dialog` from `ui/dialog/Dialog.vue`,
  // and the same for the other six. Keeping the barrels means `shadcn-vue add`
  // output drops in unchanged and explicit imports still work.
  components: [{ path: '~/components', pathPrefix: false, extensions: ['vue'] }],

  // The splash now sits at `app/spa-loading-template.html`, which is exactly
  // where Nuxt 4 looks by default (`<srcDir>/spa-loading-template.html`), so the
  // explicit path this used to need is gone.

  css: ['~/assets/styles/main.css'],

  // Env-driven configuration. Values are overridden at runtime by the matching
  // NUXT_PUBLIC_* variables (see .env.example). Nuxt parses them against the
  // types declared here, so `useMockData` stays a real boolean.
  runtimeConfig: {
    public: {
      // NUXT_PUBLIC_USE_MOCK_DATA: serve every screen from `data/*.ts`.
      useMockData: process.env.NUXT_PUBLIC_USE_MOCK_DATA !== 'false',
      // NUXT_PUBLIC_API_BASE: backend origin used when mock data is off and
      // the REST implementation is selected. See `lib/datasource/index.ts`.
      apiBase: process.env.NUXT_PUBLIC_API_BASE || '',
      // NUXT_PUBLIC_APP_ENV: free-form label for the running environment.
      appEnv: process.env.NUXT_PUBLIC_APP_ENV || 'development',
      /**
       * Firebase web config. Public by design — these identify the project,
       * they do not authorise anything. What stops a stranger reading the
       * database is the security rules, never the secrecy of these values.
       *
       * Nested rather than flat so `config.public.firebase` can be passed to
       * `initializeApp` whole, which is how `plugins/firebase.client.ts` reads
       * it.
       */
      firebase: {
        apiKey: process.env.NUXT_PUBLIC_FIREBASE_API_KEY || '',
        authDomain: process.env.NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
        projectId: process.env.NUXT_PUBLIC_FIREBASE_PROJECT_ID || '',
        storageBucket: process.env.NUXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
        messagingSenderId: process.env.NUXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
        appId: process.env.NUXT_PUBLIC_FIREBASE_APP_ID || '',
        measurementId: process.env.NUXT_PUBLIC_FIREBASE_MEASUREMENT_ID || '',
        // Which database in the project. Empty means `(default)`. See
        // `FirebaseWebConfig.databaseId` for why this is configuration and not
        // something derived from `NODE_ENV`.
        databaseId: process.env.NUXT_PUBLIC_FIREBASE_DATABASE_ID || '',
      },
    },
  },

  app: {
    head: {
      title: 'DP Fitness · Recomp Challenge',
      viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
      meta: [
        { charset: 'utf-8' },
        { name: 'theme-color', content: '#241b2e' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        {
          name: 'apple-mobile-web-app-status-bar-style',
          content: 'black-translucent',
        },
        {
          name: 'description',
          content:
            'DP Fitness Recomp Challenge. Train with purpose, transform with proof.',
        },
      ],
      // Resolves the theme before the first frame, so neither the SPA loading
      // template nor the app can flash the wrong palette. Reads the same
      // `dpfit:theme` key that `useTheme` writes (a JSON string), falling back
      // to the OS preference. Kept inline and dependency-free on purpose, since it
      // has to run ahead of every bundle.
      //
      // It also preloads the boot splash's wordmark. The splash picks between
      // the light and dark export in CSS, so the correct file is only knowable
      // once `d` is resolved. A static <link> would have to guess, and getting
      // it wrong costs a wasted fetch plus a late-painting logo. Reusing `d`
      // also means the preload honours a stored override, so a member who
      // forces light on a dark phone still gets the light wordmark.
      script: [
        {
          key: 'theme-boot',
          tagPosition: 'head',
          innerHTML: `(function(){try{var s=localStorage.getItem('dpfit:theme');var p=s?JSON.parse(s):'system';var d=p==='dark'||(p!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',d?'#14101a':'#f3eae4');var l=document.createElement('link');l.rel='preload';l.as='image';l.href=d?'/DP_wordmark_dark.png':'/DP_wordmark_light.png';document.head.appendChild(l);}catch(e){document.documentElement.dataset.theme='light';}})();`,
        },
      ],

      link: [
        // Files in `public/` are served at the web root as-is, so these resolve
        // to `/favicon.svg`, `/icons/…` etc. Everything under `/icons/` is
        // generated from `public/DP.png`, which is the source of truth for
        // the mark, so regenerate the set rather than editing a PNG by hand.
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        // Safari ignores SVG icons for the home screen, so the raster ones are
        // what an iOS member actually gets when they "Add to Home Screen".
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/icons/favicon-32.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/icons/apple-touch-icon.png' },
        // The boot splash's own wordmark is preloaded from the theme script
        // below, because which file it needs isn't known until the theme is resolved.
        // Cohort avatars and the two photographic card washes all come from
        // here, and the first of them is requested as soon as Home renders.
        // The webfont preconnects and the stylesheet that needs them are part
        // of the design system, so they arrive from the shared layer.
        { rel: 'preconnect', href: 'https://images.unsplash.com', crossorigin: '' },
      ],
    },
  },

pwa: {
  registerType: 'autoUpdate',

  manifest: {
    id: '/',
    name: 'DP Fitness · Recomp Challenge',
    short_name: 'DP Fitness',
    description:
      'Train with purpose, transform with proof. The DP Fitness 6-week recomp challenge.',

    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',

    theme_color: '#241b2e',
    background_color: '#fbf6f2',

    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    screenshots: [
    {
      src: '/screenshots/desktop.png',
      sizes: '1280x720',
      type: 'image/png',
      form_factor: 'wide',
    },
    {
      src: '/screenshots/mobile.png',
      sizes: '390x844',
      type: 'image/png',
    },
  ],
  },

  workbox: {
    // Important for an SPA: unknown navigations fall back
    // to the cached application shell.
    navigateFallback: '/',
    skipWaiting: true,
    clientsClaim: true,

    globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],

    // Don't precache the onboarding illustrations.
    globIgnores: ['**/onboarding_tour/**'],

    runtimeCaching: [
      {
        urlPattern: /\/onboarding_tour\//,
        handler: 'CacheFirst',
        options: {
          cacheName: 'dpfit-onboarding-art',
          expiration: {
            maxEntries: 6,
            maxAgeSeconds: 60 * 60 * 24 * 30,
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },

      {
        urlPattern: /^https:\/\/images\.unsplash\.com\//,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'dpfit-remote-images',
          expiration: {
            maxEntries: 60,
            maxAgeSeconds: 60 * 60 * 24 * 14,
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },

      // Coach-authored imagery out of Cloud Storage: workout day heroes, and
      // the member's own proof and progress photos read back. Cache-first,
      // because a Storage object is immutable at its URL — a replaced hero is
      // a new upload with a new token, so a cached copy can never go stale, and
      // the alternative is Home's largest asset blocking on the network every
      // morning. Without this the hero is the one thing on the screen that
      // disappears offline, which is exactly when a gym has no signal.
      {
        urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\//,
        handler: 'CacheFirst',
        options: {
          cacheName: 'dpfit-storage-images',
          expiration: {
            maxEntries: 80,
            maxAgeSeconds: 60 * 60 * 24 * 30,
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },

      {
        urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'dpfit-font-css',
        },
      },

      {
        urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
        handler: 'CacheFirst',
        options: {
          cacheName: 'dpfit-font-files',
          expiration: {
            maxEntries: 20,
            maxAgeSeconds: 60 * 60 * 24 * 365,
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
    ],
  },

  client: {
    // true = capture beforeinstallprompt so you can
    // trigger installation yourself with $pwa.install()
    installPrompt: true,
  },

  devOptions: {
    enabled: false,
    type: 'module',
  },
},
})
