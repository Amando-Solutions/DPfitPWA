# DP Fitness · public landing site

The page people arrive on. One route, thirteen sections, built from the Figma
composition
[`DP Fitness · Landing Page`](https://www.figma.com/design/B931SXWG53I3zKWa2MS9pY/DP-Fitness?node-id=444-2)
(desktop frame `448:2`, with tablet and mobile artboards alongside it).

```bash
bun install          # from the repo root
bun run dev:web      # http://localhost:3001
```

## How it is put together

```
app/data/landing.ts          every word on the page, and the types around them
        ↓
app/components/landing/      one component per section, plus three shared pieces
        ↓
app/pages/index.vue          nothing but the order of the sections
```

The same split the member app makes between `data/` and `components/`: the
components own layout and behaviour, `data/landing.ts` owns the copy. A price
change is one edit, and the three places the price appears cannot drift apart.

`PageContainer`, `CtaButton` and `BrandMark` are the only shared pieces. Every
other component is a section, named for what it says rather than where it sits,
so re-ordering the argument is a matter of moving a line in `index.vue`.

## Decisions worth knowing

**Prerendered, not client-rendered.** The opposite of the PWA's call, for the
opposite reason: every word here is known at build time and the page's whole job
is to be found and read by someone who has never heard of DP Fitness. `nitro.prerender`
crawls in-page links, so adding a route to `pages/` is enough to get it rendered
to static HTML.

**Pinned to the light palette.** `data-theme="light"` is set on `<html>` in
`nuxt.config.ts`. This is one authored composition — a warm paper page with two
deliberately dark panels — rather than a surface someone lives in, so it does not
follow the visitor's OS the way the member app does.

**Its own tokens are few and named.** Almost everything comes from
`@dpfit/theme`. What the marketing composition genuinely adds — the paper page,
the near-black panels, the heavier rules, the marketing type scale — is declared
at the top of `app/assets/styles/main.css` with a note on why each one is not
just the app's equivalent.

**The FAQ is `<details>`.** Keyboard-operable, announced as expandable, findable
with the browser's own find-in-page, and open-able with JavaScript off. The only
thing written by hand is the rotation of the `+`.

## What is not finished

- **Registration stops after step one.** The card collects and validates "About
  you" and emits a typed payload; "Your stats" and "Personalise" are designed in
  the same Figma file as separate pages and are not built. Nothing is persisted
  or charged — see the note on the `submit` emit in
  [`RegisterSection.vue`](app/components/landing/RegisterSection.vue).
- **The refund answer is placeholder copy.** The Figma frame draws the FAQ
  collapsed, so it carries the questions but no answers. Every other answer is
  written from what the page already commits to; the refund one needs the real
  policy. It is flagged as `REFUND_ANSWER_IS_PLACEHOLDER` in `data/landing.ts`.
- **The hero's start date is hard-coded** ("starts 12 August"), as it is in the
  design. It will need to come from wherever cohorts are defined.
