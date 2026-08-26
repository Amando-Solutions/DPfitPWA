<script setup lang="ts">
/*
  The segmented pill control. Despite the name it is a *choice* rather than a
  set of tab panels — it picks the pose a progress photo is filed under, or the
  member's sex during setup — so it is built on shadcn's RadioGroup, which is
  what carries the right semantics and keyboard behaviour: one tab stop for the
  whole control, arrow keys to move between options, `role="radiogroup"` around
  `role="radio"` items.

  Where the app really does have tab panels (Rewards' badges / leaderboard) it
  uses <Tabs> directly, which draws the same pill with `role="tablist"`.
*/
defineProps<{
  modelValue: string
  tabs: { id: string; label: string }[]
}>()

defineEmits<{ (e: 'update:modelValue', v: string): void }>()
</script>

<template>
  <RadioGroup
    :model-value="modelValue"
    orientation="horizontal"
    class="flex gap-1 rounded-pill bg-fill-subtle p-1"
    @update:model-value="$emit('update:modelValue', $event as string)"
  >
    <RadioGroupItem
      v-for="tab in tabs"
      :key="tab.id"
      :value="tab.id"
      variant="plain"
      class="h-9.5 flex-1 rounded-pill font-eyebrow text-[11px] font-bold uppercase tracking-[0.5px] text-muted transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-ring data-[state=checked]:btn-raised data-[state=checked]:bg-inverse data-[state=checked]:text-on-inverse data-[state=checked]:[--btn-face:var(--surface-inverse)]"
    >
      {{ tab.label }}
    </RadioGroupItem>
  </RadioGroup>
</template>
