<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    desc?: string
    icon?: string
    selected?: boolean
    compact?: boolean
  }>(),
  { selected: false, compact: false },
)
</script>

<template>
  <button
    type="button"
    class="flex w-full items-center gap-3 rounded-md bg-sunken text-left transition-all duration-150"
    :class="[
      compact ? 'px-3.5 py-3' : 'px-4 py-3.5',
      selected
        ? 'bg-rose-softer shadow-[inset_0_0_0_1.5px_var(--rose)]'
        : 'shadow-[inset_0_0_0_1.5px_var(--hairline)]',
    ]"
  >
    <div
      v-if="icon"
      class="grid size-9 shrink-0 place-items-center rounded-[10px] transition-colors"
      :class="selected ? 'bg-rose-fill text-on-rose' : 'bg-fill-subtle text-ink'"
    >
      <AppIcon :name="icon" :size="18" :stroke="2.2" />
    </div>

    <div class="flex flex-1 flex-col gap-0.5">
      <span class="text-[15px] font-bold text-ink">{{ label }}</span>
      <span v-if="desc" class="text-[12.5px] text-muted">{{ desc }}</span>
    </div>

    <div
      class="grid size-5.5 shrink-0 place-items-center rounded-full text-on-rose"
      :class="selected && 'bg-rose-fill'"
    >
      <AppIcon v-if="selected" name="check" :size="14" :stroke="3" />
    </div>
  </button>
</template>
