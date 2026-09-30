<script setup lang="ts">
import {
  REGIONS,
  deviceZone,
  regionOption,
  zoneCity,
  zonesFor,
  type RegionChoice,
  type RegionOption,
} from '~/lib/domain/region'
import { formatTime, trustedNow } from '~/lib/time'

/*
  "Your region", as asked at setup and changed from Profile.

  The starter list, each option a zone. The three that are too broad for one —
  Other Africa, Europe, Other — open a list of the zones in that area beneath
  them, inline rather than in a sheet of its own, because Profile already shows
  this inside one. The device's zone is offered as the starting pick there when
  it belongs to the area; it is only a suggestion, and nothing reads it after.
*/
const props = defineProps<{ modelValue: RegionChoice }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: RegionChoice): void }>()

const selected = computed(() => regionOption(props.modelValue.id))

/** Read once per render, not ticking: "about 7:40 PM there" is all it has to say. */
const now = trustedNow()

/** "7:42 PM there now", so a member can see they have the right one. */
const localTime = (zone: string) => `${formatTime(now, zone)} there now`

/** "GMT+2". An offset rather than letters, which most zones do not have. */
const offset = (zone: string) => {
  for (const timeZoneName of ['shortOffset', 'short'] as const) {
    try {
      return (
        new Intl.DateTimeFormat('en-GB', { timeZone: zone, timeZoneName })
          .formatToParts(now)
          .find((part) => part.type === 'timeZoneName')?.value ?? ''
      )
    } catch {
      // `shortOffset` is newer than some browsers; `short` is everywhere.
    }
  }
  return ''
}

const describe = (option: RegionOption) =>
  option.timezone
    ? localTime(option.timezone)
    : option.id === selected.value?.id && props.modelValue.timezone
      ? `${zoneCity(props.modelValue.timezone)} · ${localTime(props.modelValue.timezone)}`
      : 'Pick your time zone'

/**
 * Choosing an option. A fixed one carries its zone. A broad one keeps the zone
 * already held if it is in the area, else starts from the device's if that is,
 * else waits for a pick.
 */
const choose = (option: RegionOption) => {
  if (option.timezone) {
    emit('update:modelValue', { id: option.id, timezone: option.timezone })
    return
  }
  const area = option.area ?? ''
  const held = props.modelValue.timezone
  const device = deviceZone()
  const timezone =
    held && held.startsWith(area) && props.modelValue.id === option.id
      ? held
      : device && device.startsWith(area)
        ? device
        : ''
  emit('update:modelValue', { id: option.id, timezone })
}

// --- The zone list, for a broad option ---------------------------------------
const query = ref('')
watch(
  () => props.modelValue.id,
  () => (query.value = ''),
)

const zones = computed(() => {
  const option = selected.value
  if (!option || option.timezone) return []
  const wanted = query.value.trim().toLowerCase().replace(/\s+/g, ' ')
  return zonesFor(option)
    .filter((zone) => !wanted || zone.replace(/_/g, ' ').toLowerCase().includes(wanted))
    .map((zone) => ({ zone, city: zoneCity(zone), offset: offset(zone) }))
})

const pickZone = (zone: string) =>
  emit('update:modelValue', { id: props.modelValue.id, timezone: zone })
</script>

<template>
  <div class="flex flex-col gap-2">
    <OptionCard
      v-for="option in REGIONS"
      :key="option.id"
      :label="option.label"
      :desc="describe(option)"
      compact
      :selected="modelValue.id === option.id"
      @click="choose(option)"
    />

    <div v-if="selected && !selected.timezone" class="mt-2 flex flex-col gap-2">
      <TextField
        v-model="query"
        label="Your time zone"
        placeholder="Search by city"
        inputmode="search"
        autocomplete="off"
      />
      <div
        role="listbox"
        aria-label="Time zones"
        class="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-md bg-sunken p-1.5"
      >
        <button
          v-for="item in zones"
          :key="item.zone"
          type="button"
          role="option"
          :aria-selected="modelValue.timezone === item.zone"
          class="flex items-center justify-between gap-3 rounded-[10px] px-3 py-2.5 text-left text-[14px] text-ink aria-selected:bg-primary-softer aria-selected:font-bold aria-selected:shadow-[inset_0_0_0_1.5px_var(--primary)]"
          @click="pickZone(item.zone)"
        >
          <span class="min-w-0 truncate">{{ item.city }}</span>
          <span class="shrink-0 text-[12.5px] text-muted tabular-nums">{{ item.offset }}</span>
        </button>
        <p v-if="!zones.length" class="m-0 px-3 py-2.5 text-[13px] text-muted">
          No time zone matches that. Try the nearest big city.
        </p>
      </div>
    </div>
  </div>
</template>
