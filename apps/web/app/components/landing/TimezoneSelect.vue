<script setup lang="ts">
/**
 * The time-zone field: a button that opens a panel of a fixed height.
 *
 * This was a native `<select>`, which was the right first answer — the OS
 * picker on a phone, type-ahead on a keyboard, and no accessibility to write.
 * What it cannot do is be a sensible size. A select with 315 options opens a
 * popup as tall as the screen on the desktop, there is no attribute for it
 * (`size` turns the control into a list box that sits in the page rather than
 * one that drops), and CSS cannot reach inside a native popup at all. So the
 * popup is ours: a scrolling list about seven rows deep, under a search box.
 *
 * The search box is what the type-ahead we gave up is replaced with, and it
 * reaches further than that did — a native select matches the start of a label
 * and nothing else, where this matches any city tzdb carries, the country, the
 * zone's name and its abbreviation. See `search` in `~/data/timezones`.
 *
 * What has not changed is that there is nothing to type into the field itself.
 * A value only ever arrives by picking a row, which is the whole point of the
 * control: the answer decides which live-call slot somebody is pointed at, and
 * it cannot be a typo.
 */
import { TIMEZONE_GROUPS, normalise, type TimezoneOption } from '~/data/timezones'

const props = defineProps<{
  modelValue: string
  /** What the form's `<label for>` points at, and what error focus finds. */
  id: string
  /** The field it stands for, for the search box's own label. */
  label: string
  placeholder: string
  invalid?: boolean
  describedby?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [string] }>()

const open = ref(false)
const query = ref('')

/**
 * The row the arrow keys are on.
 *
 * Held as a zone name rather than an index into the visible rows, because
 * typing into the search box reorders and shortens that list underneath it.
 */
const active = ref('')

const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const searchBox = ref<HTMLInputElement | null>(null)

const ALL = TIMEZONE_GROUPS.flatMap((group) => group.zones)
const selected = computed(() => ALL.find((zone) => zone.value === props.modelValue))

/** The groups with a match in them, or all of them when nothing is typed. */
const groups = computed(() => {
  const wanted = normalise(query.value.trim())
  if (!wanted) return TIMEZONE_GROUPS
  return TIMEZONE_GROUPS.map((group) => ({
    continent: group.continent,
    zones: group.zones.filter((zone) => zone.search.includes(wanted)),
  })).filter((group) => group.zones.length > 0)
})

/** The same rows flattened, which is the order the arrow keys walk. */
const visible = computed(() => groups.value.flatMap((group) => group.zones))

const listboxId = computed(() => `${props.id}-listbox`)
const optionId = (value: string) => `${props.id}-${value.replace(/[^a-zA-Z0-9]+/g, '-')}`

/**
 * Keeps the active row on screen without moving the page.
 *
 * `nearest` while arrowing, so the panel scrolls only as far as it has to and
 * a list somebody is reading does not re-centre under every press. `center`
 * once, on opening, because `nearest` would park the current answer against
 * whichever edge it came in at, with the rows either side of it — the ones
 * somebody opening the list is most likely to want — off screen.
 *
 * The rows carry a `scroll-mt` to go with this: without it, arrowing up onto
 * the first row of a group stops with the row under that group's sticky
 * heading, which is the one row that must not be the hidden one.
 */
async function revealActive(block: ScrollLogicalPosition = 'nearest') {
  await nextTick()
  document.getElementById(optionId(active.value))?.scrollIntoView({ block })
}

async function openPanel() {
  if (open.value) return
  open.value = true
  query.value = ''
  // Opens on the current answer, so a picker being corrected starts where it
  // was rather than at the top of Africa.
  active.value = props.modelValue || visible.value[0]?.value || ''
  await nextTick()
  searchBox.value?.focus()
  revealActive('center')
}

/**
 * `restoreFocus` is false when focus has already gone somewhere else of the
 * visitor's choosing — a click outside, or Tab. Pulling it back to the trigger
 * in either case would undo the thing they just did.
 */
function closePanel(restoreFocus = true) {
  if (!open.value) return
  open.value = false
  query.value = ''
  if (restoreFocus) trigger.value?.focus()
}

function choose(zone: TimezoneOption) {
  emit('update:modelValue', zone.value)
  closePanel()
}

function move(delta: number) {
  const rows = visible.value
  if (!rows.length) return
  const at = rows.findIndex((zone) => zone.value === active.value)
  const next = at === -1 ? (delta > 0 ? 0 : rows.length - 1) : (at + delta + rows.length) % rows.length
  active.value = rows[next]!.value
  revealActive()
}

function jump(to: 'first' | 'last') {
  const rows = visible.value
  if (!rows.length) return
  active.value = (to === 'first' ? rows[0] : rows[rows.length - 1])!.value
  revealActive()
}

function onSearchKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      move(1)
      break
    case 'ArrowUp':
      event.preventDefault()
      move(-1)
      break
    case 'Home':
      event.preventDefault()
      jump('first')
      break
    case 'End':
      event.preventDefault()
      jump('last')
      break
    case 'Enter': {
      event.preventDefault()
      const zone = visible.value.find((z) => z.value === active.value)
      if (zone) choose(zone)
      break
    }
    case 'Escape':
      event.preventDefault()
      closePanel()
      break
    case 'Tab':
      // Let the browser move focus, and get out of its way.
      closePanel(false)
      break
  }
}

// A filtered list can no longer hold the row the arrows were on, so the first
// match becomes the one Enter takes.
watch(query, () => {
  active.value = visible.value[0]?.value ?? ''
  revealActive()
})

/**
 * Capture, so a click that closes this panel still reaches whatever it landed
 * on. Without it the first click outside is spent closing the dropdown and the
 * button underneath has to be pressed twice.
 */
function onPointerDown(event: PointerEvent) {
  if (open.value && root.value && !root.value.contains(event.target as Node)) closePanel(false)
}

onMounted(() => document.addEventListener('pointerdown', onPointerDown, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown, true))
</script>

<template>
  <div ref="root" class="relative">
    <button
      :id="id"
      ref="trigger"
      type="button"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="open ? listboxId : undefined"
      :aria-invalid="invalid ? true : undefined"
      :aria-describedby="describedby"
      class="flex h-11.5 w-full items-center gap-2 rounded-field border bg-field py-0 pr-3.75 pl-3.75 text-left font-body text-[15px] transition-colors focus:outline-none focus-visible:border-rose-fill focus-visible:ring-2 focus-visible:ring-rose-ring"
      :class="[
        invalid ? 'border-rose-fill' : 'border-field-edge',
        // No `::placeholder` on a button, so the whole label greys out until
        // the field is answered.
        selected ? 'text-ink' : 'text-[#757575]',
      ]"
      @click="open ? closePanel() : openPanel()"
      @keydown.down.prevent="openPanel()"
      @keydown.up.prevent="openPanel()"
    >
      <span class="min-w-0 flex-1 truncate">{{ selected?.label ?? placeholder }}</span>
      <svg
        class="h-1.5 w-2.5 shrink-0 text-soft transition-transform"
        :class="open ? 'rotate-180' : ''"
        viewBox="0 0 10 6"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M1 1l4 4 4-4" />
      </svg>
    </button>

    <!-- Seven-odd rows, and never more than half the screen: on a phone the
         panel opens over the submit button below it, and one that ran the
         height of the viewport would hide the form it belongs to. -->
    <div
      v-if="open"
      class="absolute top-[calc(100%+0.5rem)] right-0 left-0 z-30 overflow-hidden rounded-field border border-field-edge bg-white shadow-[0_24px_40px_rgba(36,27,46,0.16)]"
    >
      <div class="border-b border-field-edge p-2">
        <input
          ref="searchBox"
          v-model="query"
          type="text"
          role="combobox"
          aria-expanded="true"
          :aria-controls="listboxId"
          aria-autocomplete="list"
          :aria-activedescendant="active ? optionId(active) : undefined"
          :aria-label="`Search ${label.toLowerCase()}`"
          placeholder="Search a city or country"
          autocomplete="off"
          spellcheck="false"
          class="h-9 w-full rounded-[7px] border border-transparent bg-field px-3 font-body text-[14.5px] text-ink placeholder:text-[#757575] focus:outline-none focus-visible:border-rose-fill"
          @keydown="onSearchKeydown"
        >
      </div>

      <div
        :id="listboxId"
        role="listbox"
        :aria-label="label"
        class="max-h-[min(17.5rem,50vh)] overflow-y-auto overscroll-contain py-1"
      >
        <div
          v-for="group in groups"
          :key="group.continent"
          role="group"
          :aria-label="group.continent"
        >
          <!-- Sticky, because a list this long scrolls past the heading that
               says which continent is being read. -->
          <p
            class="sticky top-0 bg-white px-3.75 pt-2 pb-1 font-data text-[10.5px] tracking-[0.06em] text-soft uppercase"
          >
            {{ group.continent }}
          </p>
          <div
            v-for="zone in group.zones"
            :id="optionId(zone.value)"
            :key="zone.value"
            role="option"
            :aria-selected="zone.value === modelValue"
            class="flex scroll-mt-9 cursor-pointer items-center gap-2 px-3.75 py-2 font-body text-[14.5px] text-ink"
            :class="[
              zone.value === active ? 'bg-[rgba(200,30,92,0.07)]' : '',
              zone.value === modelValue ? 'text-rose-fill' : '',
            ]"
            @click="choose(zone)"
            @pointermove="active = zone.value"
          >
            <span class="min-w-0 flex-1 truncate">{{ zone.label }}</span>
            <svg
              v-if="zone.value === modelValue"
              class="h-2 w-2.5 shrink-0"
              viewBox="0 0 10 8"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M1 4.2l2.6 2.6L9 1.4" />
            </svg>
          </div>
        </div>

        <p
          v-if="!visible.length"
          class="px-3.75 py-4 font-body text-[14px] text-ink-mute"
          role="status"
        >
          No time zone matches “{{ query }}”.
        </p>
      </div>
    </div>
  </div>
</template>
