import tailwindcss from '@tailwindcss/vite'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
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

  // Nuxt only auto-detects `~/app/spa-loading-template.html`; this project keeps
  // it at the root, so without an explicit path the boot splash is compiled in
  // empty and the first paint is a blank page.
  spaLoadingTemplate: 'spa-loading-template.html',

  css: ['~/assets/styles/main.css'],

  // Tailwind v4 is a Vite plugin: no PostCSS config, no tailwind.config.js.
  // The theme itself lives in `assets/styles/main.css` under `@theme inline`.
  vite: {
    plugins: [tailwindcss()],
  },

  // Env-driven configuration. Values are overridden at runtime by the matching
  // NUXT_PUBLIC_* variables (see .env.example). Nuxt parses them against the
  // types declared here, so `useMockData` stays a real boolean.
  runtimeConfig: {
    public: {
      // NUXT_PUBLIC_USE_MOCK_DATA: serve every screen from `data/*.ts`.
      useMockData: true,
      // NUXT_PUBLIC_API_BASE: backend origin used when mock data is off.
      apiBase: '',
      // NUXT_PUBLIC_APP_ENV: free-form label for the running environment.
      appEnv: 'development',
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
        {
          rel: 'preconnect',
          href: 'https://fonts.googleapis.com',
        },
        {
          rel: 'preconnect',
          href: 'https://fonts.gstatic.com',
          crossorigin: '',
        },
        // Cohort avatars and the two photographic card washes all come from
        // here, and the first of them is requested as soon as Home renders.
        { rel: 'preconnect', href: 'https://images.unsplash.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Chivo:ital,wght@0,300;0,400;0,700;0,900;1,700&family=Chivo+Mono:wght@400;500;700&family=Schibsted+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap',
        },
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
