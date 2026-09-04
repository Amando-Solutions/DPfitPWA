import tailwindcss from '@tailwindcss/vite'

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

  app: {
    head: {
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        // Chivo (display), Chivo Mono (eyebrows), Schibsted Grotesk (body),
        // Manrope (exercise names) and Space Mono (data) — the five families
        // `--font-*` names in `styles/theme.css`. One request for all of them.
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Chivo:ital,wght@0,300;0,400;0,700;0,900;1,700&family=Chivo+Mono:wght@400;500;700&family=Manrope:wght@400;500;600;700;800&family=Schibsted+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap',
        },
      ],
    },
  },
})
