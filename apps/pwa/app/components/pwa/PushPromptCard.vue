<script setup lang="ts">
// The ask for push, floating over every screen of the app layout until it's
// answered or closed. The Profile switch is the lasting control; this is how a
// member finds out it exists.
//
// Positioned against the layout rather than the scroller it's rendered in, so
// it stays put while the page moves under it: above the tab bar on a phone, in
// the corner beside the content on desktop. Not over chat or a workout in
// progress, which leave the layout for screens of their own, and whose bottom
// edge is the composer and the set logger.
//
// Nor on Profile, which is where its link goes: the switch there is the same
// control with room to explain itself, and the card would sit on top of it.
//
// Gone for good once push is on, once the browser says notifications are
// blocked (there's nothing left for it to do), or once closed. Closing is
// remembered per account, so sign-out clears it and the next member on the
// device is asked too.
import { storage } from '~/lib/storage'

const DISMISSED_KEY = 'push-prompt-dismissed'

/** Space between the card and whatever the page scrolls up to meet it. */
const CLEARANCE_GAP = 16

const push = usePushNotifications()
const route = useRoute()
const dismissed = ref(storage.read<boolean>(DISMISSED_KEY, false))

const show = computed(
  () =>
    !dismissed.value &&
    route.path !== '/profile' &&
    push.availability.value === 'available' &&
    !push.enabled.value &&
    push.permission.value !== 'denied',
)

/**
 * How much the layout has to add to the bottom of the page for its last line
 * to scroll clear of the card. A floating card otherwise hides whatever ends up
 * underneath it for as long as it is up, with no way to scroll it into view.
 * Measured rather than fixed, because the card grows when it shows an error.
 */
const clearance = useState<number>('push-prompt-clearance', () => 0)
const panel = ref<HTMLElement | null>(null)
let observer: ResizeObserver | null = null

watch(panel, (el) => {
  observer?.disconnect()
  observer = null
  if (!el) {
    clearance.value = 0
    return
  }
  observer = new ResizeObserver(() => {
    clearance.value = el.offsetHeight + CLEARANCE_GAP
  })
  observer.observe(el)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  clearance.value = 0
})

const dismiss = () => {
  dismissed.value = true
  storage.write(DISMISSED_KEY, true)
}

// Straight through: the permission prompt has to be asked for inside the tap.
const turnOn = () => void push.enable()
</script>

<template>
  <Transition
    enter-from-class="opacity-0 translate-y-3"
    enter-active-class="transition duration-240 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
    leave-active-class="transition duration-200 ease-in motion-reduce:transition-none"
    leave-to-class="opacity-0 translate-y-3"
  >
    <div
      v-if="show"
      class="push-prompt pointer-events-none absolute inset-x-0 bottom-[calc(100px+env(safe-area-inset-bottom))] z-50 px-3.5 lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-95 lg:px-0"
    >
      <!-- Frozen while the registration is written. Not while the browser's
           prompt is up: that may never be answered, and "Turn on" again is how
           a member gets a prompt they clicked away from back. -->
      <section
        ref="panel"
        aria-labelledby="push-prompt-title"
        class="pointer-events-auto flex gap-3 rounded-card border border-hairline bg-raised p-3.5 shadow-raised sm:max-lg:mx-auto sm:max-lg:w-[min(520px,100%)]"
        :inert="push.busy.value"
      >
        <span class="grid size-9 shrink-0 place-items-center rounded-pill bg-primary-soft text-primary">
          <AppIcon name="bell" :size="17" :stroke="2" />
        </span>

        <div class="min-w-0 flex-1">
          <p id="push-prompt-title" class="m-0 font-display text-[14px] font-black tracking-[-0.2px] text-ink">
            Turn on notifications
          </p>
          <p aria-live="polite" class="mt-1 mb-0 text-[12.5px] leading-[1.45] text-soft">
            <template v-if="push.asking.value">
              Choose Allow in the prompt to finish.
            </template>
            <template v-else>
              Know when your coach posts, or when someone mentions, replies or reacts to you.
            </template>
          </p>
          <p class="mt-1 mb-0 text-[12px] leading-[1.45] text-soft">
            You can change this anytime in
            <NuxtLink to="/profile" class="font-bold text-primary">Profile &amp; settings</NuxtLink>.
          </p>
          <p v-if="push.error.value" role="alert" class="mt-1.5 mb-0 text-[12.5px] font-bold text-primary">
            {{ push.error.value }}
          </p>

          <button
            type="button"
            class="mt-2.5 h-9 rounded-pill bg-primary-fill px-4 text-[13px] font-bold whitespace-nowrap text-on-primary transition-transform duration-100 ease-out active:scale-[0.98] disabled:opacity-45"
            :disabled="push.busy.value"
            @click="turnOn"
          >
            {{ push.busy.value ? 'Turning on…' : 'Turn on' }}
          </button>
        </div>

        <button
          type="button"
          class="-mt-1 -mr-1 grid size-7 shrink-0 place-items-center rounded-pill text-soft"
          aria-label="Close"
          @click="dismiss"
        >
          <AppIcon name="close" :size="15" :stroke="2.2" />
        </button>
      </section>
    </div>
  </Transition>
</template>
