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

  modules: [
    '@vite-pwa/nuxt',
    // Nuxt's app manifest lives at `.nuxt/manifest/meta/<buildId>.json` and is
    // reached through the server-only `#app-manifest` alias. Nitro writes that
    // file when it bundles, which during `nuxt dev` happens *after* Vite has
    // pre-transformed the composable importing it — hence the cold-start
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
  components: [{ path: '~/components', pathPrefix: false }],

  // Nuxt only auto-detects `~/app/spa-loading-template.html`; this project keeps
  // it at the root, so without an explicit path the boot splash is compiled in
  // empty and the first paint is a blank page.
  spaLoadingTemplate: 'spa-loading-template.html',

  css: ['~/assets/styles/main.css'],

  // Tailwind v4 is a Vite plugin — no PostCSS config, no tailwind.config.js.
  // The theme itself lives in `assets/styles/main.css` under `@theme inline`.
  vite: {
    plugins: [tailwindcss()],
  },

  // Env-driven configuration. Values are overridden at runtime by the matching
  // NUXT_PUBLIC_* variables (see .env.example) — Nuxt parses them against the
  // types declared here, so `useMockData` stays a real boolean.
  runtimeConfig: {
    public: {
      // NUXT_PUBLIC_USE_MOCK_DATA — serve every screen from `data/*.ts`.
      useMockData: true,
      // NUXT_PUBLIC_API_BASE — backend origin used when mock data is off.
      apiBase: '',
      // NUXT_PUBLIC_APP_ENV — free-form label for the running environment.
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
            'DP Fitness Recomp Challenge — train with purpose, transform with proof.',
        },
      ],
      // Resolves the theme before the first frame, so neither the SPA loading
      // template nor the app can flash the wrong palette. Reads the same
      // `dpfit:theme` key that `useTheme` writes (a JSON string), falling back
      // to the OS preference. Kept inline and dependency-free on purpose — it
      // has to run ahead of every bundle.
      script: [
        {
          key: 'theme-boot',
          tagPosition: 'head',
          innerHTML: `(function(){try{var s=localStorage.getItem('dpfit:theme');var p=s?JSON.parse(s):'system';var d=p==='dark'||(p!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',d?'#14101a':'#f3eae4');}catch(e){document.documentElement.dataset.theme='light';}})();`,
        },
      ],

      link: [
        // Files in `public/` are served at the web root as-is, so this
        // resolves to `/favicon.svg`. SVG covers every current browser; add
        // { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/icons/favicon-32.png' }
        // and { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' } once
        // those PNGs exist (Safari ignores SVG for the home-screen icon).
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        {
          rel: 'preconnect',
          href: 'https://fonts.googleapis.com',
        },
        {
          rel: 'preconnect',
          href: 'https://fonts.gstatic.com',
          crossorigin: '',
        },
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
      name: 'DP Fitness · Recomp Challenge',
      short_name: 'DP Fitness',
      description:
        'Train with purpose, transform with proof — the DP Fitness 6-week recomp challenge.',
      theme_color: '#241b2e',
      background_color: '#fbf6f2',
      display: 'standalone',
      orientation: 'any',
      start_url: '/',
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
    },
    workbox: {
      navigateFallback: '/',
      globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
    },
    client: {
      installPrompt: true,
    },
    devOptions: {
      enabled: false,
      type: 'module',
    },
  },
})
