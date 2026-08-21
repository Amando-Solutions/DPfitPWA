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
  <div
    class="flex gap-0.5 rounded-pill bg-fill-subtle p-0.75"
    role="radiogroup"
    aria-label="Appearance"
  >
    <button
      v-for="option in OPTIONS"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="preference === option.value"
      class="flex items-center gap-1.5 rounded-pill px-3 py-1.5 font-eyebrow text-[10px] font-bold tracking-[0.5px]"
      :class="
        preference === option.value
          ? 'btn-raised bg-inverse text-on-inverse [--btn-face:var(--surface-inverse)]'
          : 'text-muted transition-colors duration-150 hover:text-ink'
      "
      @click="set(option.value)"
    >
      <AppIcon :name="option.icon" :size="13" :stroke="2.2" />
      {{ option.label }}
    </button>
  </div>
</template>
