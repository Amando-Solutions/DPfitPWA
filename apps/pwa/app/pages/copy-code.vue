<script setup lang="ts">
/**
 * Copy code: where the copy icon in the access-code email lands.
 *
 * An inbox runs no script, so the icon cannot reach the clipboard itself. It
 * links here instead, with the code in the fragment — `/copy-code#DPF-XXXX-XXXX`
 * — which a browser never sends to a server, and this page does the copying.
 * The link is built by `copyCodeUrl` in `apps/web/server/emails/access-code.ts`.
 *
 * Chrome lets a page in the foreground write to the clipboard as it loads, so
 * there the code is copied before the member has done anything. Safari and
 * Firefox only allow it from a tap, so there the button does it. For a browser
 * that allows neither, the code stays on screen and selects as one piece.
 *
 * Open to every gate, because the email reaches people signed out, signed in
 * and long since set up. `auth.global.ts` lets it through for that reason.
 */
definePageMeta({ layout: 'default' })

const route = useRoute()

/**
 * The code, from the fragment, trimmed and upper-cased the way the redeem path
 * reads one, so what lands on the clipboard is what the app accepts. Empty for
 * a link that lost its fragment on the way, which some forwarding does.
 */
const code = computed(() => {
  let raw = route.hash.replace(/^#/, '')
  try {
    raw = decodeURIComponent(raw)
  } catch {
    // A stray `%` is not worth refusing the link over; show it as it came.
  }
  const normalised = raw.trim().toUpperCase()
  return /^\S{1,64}$/.test(normalised) ? normalised : ''
})

/** `manual` is a browser that refused the write even from a tap. */
const status = ref<'idle' | 'copied' | 'manual'>('idle')

const codeEl = ref<HTMLElement | null>(null)

/** False when the browser refuses, and when there is no Clipboard API at all. */
const write = async () => {
  try {
    await navigator.clipboard.writeText(code.value)
    return true
  } catch {
    return false
  }
}

/** Selects the code on screen, so it can be copied by hand. */
const selectCode = () => {
  const selection = window.getSelection()
  if (!codeEl.value || !selection) return
  const range = document.createRange()
  range.selectNodeContents(codeEl.value)
  selection.removeAllRanges()
  selection.addRange(range)
}

const copy = async () => {
  if (await write()) {
    status.value = 'copied'
  } else {
    selectCode()
    status.value = 'manual'
  }
}

// Without a tap. Chrome allows it; elsewhere it is refused, and quietly: the
// button is the way there, so a refusal here is not a failure to report.
onMounted(async () => {
  if (code.value && (await write())) status.value = 'copied'
})

const heading = computed(() => {
  if (!code.value) return 'No code in this link'
  return status.value === 'copied' ? 'Code copied' : 'Copy your access code'
})

const standfirst = computed(() => {
  if (!code.value) return 'Copy the code from your email instead.'
  if (status.value === 'copied') return 'Paste it when the app asks for your access code.'
  if (status.value === 'manual') return 'This browser won’t copy it for you. Press and hold the code to copy it.'
  return 'Tap the button to put it on your clipboard.'
})
</script>

<template>
  <div class="copy flex-1 min-h-0 flex flex-col p-[40px_24px_24px] relative overflow-hidden lg:p-[44px_44px_36px]">
    <div class="copy__glow absolute w-65 h-65 -top-20 -right-20 rounded-[50%] bg-[radial-gradient(circle,var(--primary-ring),transparent_70%)] filter-[blur(8px)] pointer-events-none" />

    <div class="copy__intro relative mt-auto mb-6 flex flex-col gap-2 lg:mt-0 lg:mb-7">
      <BrandLogo :size="56" class="text-ink" label="DP Fitness" />

      <h1 class="copy__title m-[10px_0_0] font-display font-black text-[27px] leading-[1.12] tracking-[-0.4px] text-ink lg:text-[30px]">
        {{ heading }}
      </h1>
      <!-- A status region, so "Code copied" is read out when the copy lands
           rather than only painted. -->
      <p role="status" class="copy__sub m-0 text-(--violet-45) text-[14px] leading-[1.45] lg:text-[15px]">
        {{ standfirst }}
      </p>
    </div>

    <AppCard v-if="code" variant="raised" class="copy__card relative flex flex-col gap-4 shadow-raised">
      <p
        ref="codeEl"
        class="copy__code m-0 select-all break-all text-center font-data text-[26px] font-bold leading-[1.2] tracking-[3px] text-ink"
      >
        {{ code }}
      </p>

      <AppButton :variant="status === 'copied' ? 'secondary' : 'primary'" @click="copy">
        <span class="inline-flex items-center gap-2">
          <AppIcon :name="status === 'copied' ? 'check' : 'copy'" :size="18" />
          {{ status === 'copied' ? 'Copied' : 'Copy code' }}
        </span>
      </AppButton>
    </AppCard>

    <!-- On to wherever this device belongs: `/` decides, the same as a cold
         launch, so a member signed out lands on the door and one set up lands
         on Home. Quiet until the code is copied, then the next step. -->
    <div class="copy__foot mt-auto flex flex-col pt-5">
      <AppButton :variant="status === 'copied' || !code ? 'primary' : 'ghost'" to="/">
        Continue
      </AppButton>
    </div>
  </div>
</template>
