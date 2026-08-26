<script setup lang="ts">
import type { ThemePreference } from '~/composables/useTheme'

// Three-way, not two: "System" has to stay selectable so the app can keep
// following the OS after the member has looked at the setting.
const { preference, set } = useTheme()

const OPTIONS: { value: ThemePreference; label: string; icon: string }[] = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'Auto', icon: 'settings' },
]
</script>

<template>
  <!-- shadcn's RadioGroup supplies the roving tabindex and arrow-key movement
       the hand-written `role="radiogroup"` here never had: all three options
       used to sit in the tab order and respond only to a click. -->
  <RadioGroup
    :model-value="preference"
    orientation="horizontal"
    aria-label="Appearance"
    class="flex gap-0.5 rounded-pill bg-fill-subtle p-0.75"
    @update:model-value="set($event as ThemePreference)"
  >
    <RadioGroupItem
      v-for="option in OPTIONS"
      :key="option.value"
      :value="option.value"
      variant="plain"
      class="flex items-center gap-1.5 rounded-pill px-3 py-1.5 font-eyebrow text-[10px] font-bold tracking-[0.5px] text-muted transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-ring data-[state=checked]:btn-raised data-[state=checked]:bg-inverse data-[state=checked]:text-on-inverse data-[state=checked]:[--btn-face:var(--surface-inverse)]"
    >
      <AppIcon :name="option.icon" :size="13" :stroke="2.2" />
      {{ option.label }}
    </RadioGroupItem>
  </RadioGroup>
</template>
