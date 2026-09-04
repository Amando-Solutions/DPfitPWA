<script setup lang="ts">
const props = withDefaults(
  defineProps<{ size?: 'sm' | 'md' | 'lg'; stacked?: boolean }>(),
  { size: 'md', stacked: false },
)

const DP: Record<NonNullable<typeof props.size>, string> = {
  sm: 'text-[21px] tracking-[-1.05px]',
  md: 'text-[28px]',
  lg: 'text-[44px]',
}

const FITNESS: Record<NonNullable<typeof props.size>, string> = {
  sm: 'text-[10px]',
  md: 'text-sm',
  lg: 'text-[20px]',
}
</script>

<template>
  <div
    class="inline-flex"
    :class="stacked ? 'flex-col items-start gap-0.5' : 'items-baseline gap-2'"
  >
    <span
      class="font-display font-black tracking-[-1px] text-rose-fill"
      :class="DP[size]"
    >
      DP
    </span>
    <span
      class="font-data font-bold tracking-[1.8px] text-ink"
      :class="FITNESS[size]"
    >
      FITNESS
    </span>
  </div>
</template>
