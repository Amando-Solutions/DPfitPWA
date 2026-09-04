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

Both apps read a local `.env`. The member app ships an example to copy:

```bash
cp apps/pwa/.env.example apps/pwa/.env
```

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

## Firebase

Firestore rules, indexes, Storage rules and the emulator config stay at the root
because they belong to the project rather than to either app: both read the same
database. `firebase.json` is the only file that reaches into an app, and only to
name the PWA's build output.

See [FIREBASE.md](FIREBASE.md) for the data model and the rules.

## Further reading

- [`apps/pwa/README.md`](apps/pwa/README.md) — how the member app is put together
- [`apps/web/README.md`](apps/web/README.md) — how the landing page is put together
