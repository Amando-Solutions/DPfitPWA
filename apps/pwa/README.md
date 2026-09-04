# DP Fitness · Recomp Challenge, member PWA

Member-facing Nuxt PWA for the DP Fitness 6-week recomp challenge.
Design source: [Figma, DP Fitness](https://www.figma.com/design/B931SXWG53I3zKWa2MS9pY/DP-Fitness?node-id=301-2).

The palette, type ramp and control recipes come from `@dpfit/theme` in
[`packages/theme`](../../packages/theme), which the public site shares.

This is a working app, not a screen gallery: the member redeems a code, fills in
a profile, logs real sets against a real clock, uploads proof, earns real RP and
badges, and everything survives a reload.

## Getting started

This app is one workspace of the [DP Fitness monorepo](../../README.md), so
dependencies are installed once at the root and the scripts are run through it.

```bash
bun install              # from the repo root
cp apps/pwa/.env.example apps/pwa/.env   # optional; the defaults already work
bun run dev:pwa          # http://localhost:3000
```

Demo access code: **DP-RECOMP-01**

Other scripts: `bun run build:pwa`, and from inside `apps/pwa`,
`bun run preview` and `bun run generate`.

> Run the build with the dev server **stopped**. Both write to `.nuxt`, and
> a concurrent dev server will leave a dev shell in `.output`.

## How the app is put together

```
data/program.ts        authored program content (plan, guides, badges, ranks, inbox)
        ↓
lib/datasource/        the ONE contract every screen reads and writes through
  types.ts               DataSource interface: async, maps 1:1 onto REST routes
  local.ts               localStorage implementation (default)
  http.ts                HTTP implementation, ready for the backend
  index.ts               picks one from env
        ↓
lib/domain/            pure logic: challenge clock, nutrition maths, reward rules
        ↓
composables/useAppStore.ts   reactive state + actions; the only thing pages use
        ↓
pages/ + components/
```

Two rules keep this honest:

1. **No component touches storage or `$fetch`.** Everything goes through
   `useAppStore()`, which goes through `DataSource`.
2. **Program content and member data are separate.** `data/program.ts` is what
   the coach authors; everything the member creates lives behind the data source.

### Swapping localStorage for an API

Implement the backend against the routes named in
[`lib/datasource/types.ts`](lib/datasource/types.ts): `POST /session`, `GET /me`,
`GET|POST /me/sessions`, `/me/check-ins`, `/me/photos`, `/notifications`,
`/threads/:id/messages`, `/threads/:id/messages/:id/reactions`, `/me/badges`,
`/cohort/leaderboard`, `/me/settings`, then set:

```bash
NUXT_PUBLIC_USE_MOCK_DATA=false
NUXT_PUBLIC_API_BASE=https://api.example.com
```

`HttpDataSource` is already written against that contract. No page, component or
composable changes.

### What is persisted

| Key | Contents |
| --- | --- |
| `dpfit:member` | account + profile, `joinedAt` (the challenge clock's origin) |
| `dpfit:sessions` | completed workouts, including every logged set |
| `dpfit:active-session` | the workout in progress; survives a reload mid-set |
| `dpfit:check-ins` | one record per week |
| `dpfit:photos` | progress photos, downscaled to ~900px JPEG before saving |
| `dpfit:badges` | badge id → awarded timestamp |
| `dpfit:settings` | units and notification preferences |
| `dpfit:messages` | messages the member sent |
| `dpfit:message-reactions` | the member's own reactions, keyed `<thread>:<message>` |
| `dpfit:clock-offset` | milliseconds between the device clock and network time |
| `dpfit:clock-high-water` | the latest network reading seen, so the clock cannot be wound back |

[`lib/storage.ts`](lib/storage.ts) is the only file that touches Web Storage. It
is versioned (`SCHEMA_VERSION`), falls back to memory when storage is blocked,
and never throws out of a click handler when the quota is hit. A key whose write
hit the quota is read back from that memory fallback for the rest of the
session, so the two stores cannot disagree; `DataSource.storageFull()` reports
when that has happened, and the chat composer says so.

### One session a day

The plan is one workout per calendar day, and the date it is measured against
comes off the network rather than the device, so moving the phone's clock
forward does not unlock the rest of the week. [`lib/time.ts`](lib/time.ts) keeps
the *offset* between network time and the device clock, which means `trustedNow()`
stays a synchronous read and the app still works offline on the last known
offset. `plugins/clock.client.ts` re-syncs on launch and on return to the
foreground, and rolls the date over at midnight.

Once today's session is logged, `store.trainingLocked` is true: every remaining
day shows as locked, and `startSession` refuses, so a deep link into
`/train/<id>` cannot walk around it. Finishing is not gated, so a session opened
before midnight can still be closed after it.

## The flow

`middleware/auth.global.ts` gates every route:

| State | Where they can go |
| --- | --- |
| No member | `/onboarding`, `/access-code` |
| Member, setup unfinished | the four `/setup/*` steps |
| Member, setup done | the app; intro screens bounce to `/home` |

`/` has no screen of its own: it redirects straight to whichever of those the
member belongs on.

Derived, never stored: the current week and day come from `joinedAt`; each
training day's status comes from what has been logged this week; fuel targets
come from the profile (Mifflin-St Jeor → activity multiplier → goal multiplier);
RP, rank, streak and badges come from the log.

Reward economy: **25 RP** a workout, **20 RP** a check-in, **5 RP** a photo, and
**15 / 25 / 45 RP** a badge by tier. Ranks at 0 / 40 / 100 / 200 / 350 RP.

One gate sits under all of it: a session only earns RP, moves a badge, keeps a
streak alive or reaches the leaderboard if it cleared **80% of its prescribed
sets**. Anything below that still saves in full and still reaches the coach, it
just earns nothing. The rules live in
[`lib/domain/rewards.ts`](lib/domain/rewards.ts); the numbers they read
(`rewardValues`, `badgeTargets`, `ranks`) are program content in
[`data/program.ts`](data/program.ts). The two elite badge thresholds are a share
of `challenge.sessionsPerWeek × totalWeeks`, so a 3-day/week cohort is no easier
than a 4-day one without a spec change.

The leaderboard ranks the cohort on qualifying sessions logged — not RP, weight
or results — ties broken alphabetically. It is the one reward that cannot be
answered from the member's own record, so it comes from
`DataSource.listLeaderboard()` and refreshes on load. In mock mode
`LocalDataSource` pads the member's real row with a stand-in cohort; the HTTP
source returns real counts only.

## Layout model

One responsive product: no device frame, no simulated OS status bar.

| Viewport | Behaviour |
| --- | --- |
| `< 1024px` | Full-bleed, floating tab bar from the Figma UI |
| `>= 1024px` | Centred app capped at `--app-max-width` (1280px), left side rail, content capped at `--content-max` (1040px) |

The desktop surface is viewport-height with internal scrolling, so no screen
grows into one long page. Sparse screens spread into columns rather than
stacking; auth and setup become a centred card; an active workout gets a
`--focus-max` reading column. The side rail also promotes the destinations that
sit behind "More" on mobile.

The breakpoint is `1024px` throughout; grep for it when tuning.

## Environment

All configuration is public (bundled into the client), so never put secrets in a
`NUXT_PUBLIC_*` variable. See [`.env.example`](.env.example).

| Variable | Default | What it does |
| --- | --- | --- |
| `NUXT_PUBLIC_USE_MOCK_DATA` | `true` | `true` keeps everything on-device via localStorage. `false` reads from `NUXT_PUBLIC_API_BASE`. |
| `NUXT_PUBLIC_API_BASE` | *(empty)* | Backend origin, used only when mock data is off. |
| `NUXT_PUBLIC_APP_ENV` | `development` | Free-form label for the running environment. |

Live mode degrades safely: with mock data off but no API base, the app falls back
to local storage rather than going blank.

## Notes

- `ssr: false`. Every screen is driven by device-local member data, so server
  rendering would only emit an empty shell. `spa-loading-template.html` is the
  splash: it covers the first paint and Nuxt tears it down once the first real
  screen is ready, so the member never sees it twice.
- Design tokens in `assets/styles/_tokens.scss` are the Figma variables verbatim
  (colours, type ramp, radii, spacing).
- `assets/icons/` holds the SVGs exported from Figma. `AppIcon` inlines them and
  swaps the baked stroke/fill for `currentColor` so one glyph tints per context;
  two-tone brand icons (the flame) keep their own colours. A handful of glyphs
  the design never exported fall back to an inline set at the bottom of
  `components/ui/AppIcon.vue`, marked as such.
- `components/shell/ScreenIntro.vue` is the header every screen shares in the
  design: eyebrow + title, the streak/badge pill and inbox button, subtitle.
