# DP Fitness

A Bun workspace holding the two things DP Fitness ships and the design system
they are both built from.

```
apps/
  pwa/        the member-facing PWA — the 6-week challenge itself   → :3000
  web/        the public landing site people arrive on              → :3001
packages/
  theme/      @dpfit/theme — the design system, as a Nuxt layer
```

The split is by audience, not by technology. `apps/pwa` is a signed-in product
someone opens every morning: client-rendered, offline-capable, driven entirely
by member data. `apps/web` is a page a stranger lands on: prerendered to static
HTML so a crawler gets the copy and the first paint is the finished page. Those
are opposite calls about rendering, which is exactly why they are separate apps
rather than routes in one.

What they must never disagree about is what the brand looks like, and that is
what `packages/theme` is for. One palette, one type ramp, one set of control
recipes, extended by both.

## Getting started

```bash
bun install          # installs every workspace

bun run dev:web      # the landing site  → http://localhost:3001
bun run dev:pwa      # the member app    → http://localhost:3000
```

Both apps read a local `.env`, and both ship an example to copy:

```bash
cp apps/pwa/.env.example apps/pwa/.env
cp apps/web/.env.example apps/web/.env
```

The landing site's is much shorter and only one thing needs it: the registration
form, which issues the member's access code and therefore needs a Firebase
service account. Every other word on that page renders without any of it.

| Script | What it does |
| --- | --- |
| `bun run dev:web` / `dev:pwa` | Dev server for one app |
| `bun run build` | Build both apps |
| `bun run build:web` / `build:pwa` | Build one |
| `bun run typecheck` | `vue-tsc` across both apps |
| `bun run rules:diff` | Whether the staging Firestore rules still match production |
| `bun run deploy:rules` | Publish Firestore and Storage rules |

> Run a build with that app's dev server **stopped**. Both write to `.nuxt`, and
> a concurrent dev server leaves a dev shell in `.output`.

## The shared design system

`packages/theme` is a [Nuxt layer](https://nuxt.com/docs/getting-started/layers):
both apps name it in `extends`, and it contributes the Tailwind v4 build, the
five webfonts, and `styles/theme.css` — the semantic token layer where every
colour, radius, shadow and type family in either product is defined once.

One wrinkle is worth knowing before you move anything. The layer does **not**
register `theme.css` as a `css` entry. Tailwind v4 resolves `@theme inline`
against the stylesheet that pulled in `tailwindcss` itself, so tokens declared
in a separate file publish no utilities at all — `bg-surface` would simply not
exist. Each app therefore owns a short CSS entry that imports Tailwind and then
`@dpfit/theme/styles/theme.css`, which keeps the whole system inside one
Tailwind root:

```css
@import 'tailwindcss';
@import '@dpfit/theme/styles/theme.css';
@source '../..';   /* this app's own components, for the class scan */
```

Anything genuinely local to one app stays in that app's entry — see the landing
page's own tokens in [`apps/web/app/assets/styles/main.css`](apps/web/app/assets/styles/main.css).

### The logo

`/logo` at the repo root is the brand's own export — the source of truth, and
the only place the artwork is authored. Nothing builds against it directly.
It reaches the two apps by two routes, both of them through the layer:

- **On the page**, as `<BrandLogo/>` and `<BrandIcon/>` in
  [`packages/theme/components`](packages/theme/components). They are the two
  geometries the brand ships, drawn in `currentColor`, so the eight SVG exports
  are a text colour and one `mono` prop rather than eight files. Both apps
  auto-import them from the layer, so there is one copy of the mark, not two.
- **Everywhere a browser will not take an SVG** — the ICO, the apple-touch PNG,
  the manifest icons — as `packages/theme/public/`, which Nuxt serves from the
  layer at `/brand/…` in both apps. Those are generated, not hand-made:

  ```sh
  bun run brand:assets   # re-renders public/brand/ from /logo
  ```

Run that after changing anything in `/logo`, and don't retouch a PNG by hand.
The one colour the artwork carries that is not already an accent is the mark's
plum, which is `--brand-mark` in `theme.css` — it lifts to the wordmark's
off-white in dark mode, because on a dark ground the brand's own answer is the
white lockup.

## Firebase

Firestore rules, indexes, Storage rules and the emulator config stay at the root
because they belong to the project rather than to either app: both read the same
database. `firebase.json` is the only file that reaches into an app, and only to
name the PWA's build output.

See [FIREBASE.md](FIREBASE.md) for the data model and the rules.

## Further reading

- [`apps/pwa/README.md`](apps/pwa/README.md) — how the member app is put together
- [`apps/web/README.md`](apps/web/README.md) — how the landing page is put together
