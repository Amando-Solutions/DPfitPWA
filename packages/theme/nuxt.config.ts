import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'

/**
 * Resolved from this file rather than written as `~/components`, because `~`
 * in a merged array is the *consuming app's* srcDir: both apps declare their
 * own `~/components` entry, and a second one here would just be a duplicate of
 * theirs and never find the layer's.
 */
const componentsDir = fileURLToPath(new URL('./components', import.meta.url))

/**
 * DP Fitness design system, as a Nuxt layer.
 *
 * Both apps in this repo — the member PWA and the public site — extend this, so
 * a colour, a radius or a type ramp is defined once and the two can never drift
 * apart. What lives here is everything that is true of *the brand* rather than
 * of either product: the Tailwind build, the five typefaces, and the token
 * stylesheet in `styles/theme.css`.
 *
 * The one thing this layer deliberately does NOT do is register `theme.css` as
 * a `css` entry. Tailwind v4 resolves `@theme inline` against the stylesheet
 * that pulled in `tailwindcss` itself, so tokens declared in a *separate* file
 * would publish no utilities at all — `bg-surface` would simply not exist. Each
 * app therefore owns a one-line CSS entry that imports Tailwind and then this
 * file, which keeps the whole design system inside one Tailwind root.
 */
export default defineNuxtConfig({
  // Tailwind v4 is a Vite plugin: no PostCSS config, no tailwind.config.js. The
  // theme is `@theme inline` in `styles/theme.css`.
  vite: {
    plugins: [tailwindcss()],
  },

  /**
   * The brand artwork, as components rather than files.
   *
   * `BrandLogo` and `BrandIcon` are `currentColor` drawings of the two
   * geometries the brand ships, which is why they live in the layer next to
   * the tokens instead of being copied into each app's `public/`: the eight
   * SVG exports are those two shapes under three fills, so a colourway is a
   * class here and the two apps cannot end up on different versions of the
   * mark. Both apps set `pathPrefix: false`, and this matches, so they are
   * `<BrandLogo/>` and `<BrandIcon/>` in either one.
   */
  components: [
    { path: componentsDir, pathPrefix: false, extensions: ['vue'] },
  ],

  app: {
    head: {
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        // Source Serif 4 covers display, body and exercise names; JetBrains
        // Mono covers eyebrows and data — the two families the `--font-*`
        // names in `styles/theme.css` resolve to. One request for both.
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,200..900;1,8..60,200..900&family=JetBrains+Mono:wght@400;500;700&display=swap',
        },
      ],
    },
  },
})
