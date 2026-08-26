<script setup lang="ts">
import {
  ProgressIndicator as RekaProgressIndicator,
  ProgressRoot as RekaProgressRoot,
  useForwardPropsEmits,
  type ProgressRootEmits,
  type ProgressRootProps,
} from 'reka-ui'
import { computed, type HTMLAttributes } from 'vue'
import { cn } from '~/lib/utils'

const props = withDefaults(
  defineProps<
    ProgressRootProps & {
      class?: HTMLAttributes['class']
      /** Classes for the filled portion, so callers can swap the fill. */
      indicatorClass?: HTMLAttributes['class']
    }
  >(),
  { max: 100 },
)
const emits = defineEmits<ProgressRootEmits>()

const delegated = computed(() => {
  const { class: _class, indicatorClass: _indicatorClass, ...rest } = props
  return rest
})

const forwarded = useForwardPropsEmits(delegated, emits)

// Reka emits `aria-valuemin`/`max`/`now` and a `data-state` of
// loading / complete / indeterminate; the hand-rolled bar was missing
// `aria-valuemin` and had no notion of an unknown value at all.
const pct = computed(() =>
  props.modelValue == null
    ? 0
    : Math.max(0, Math.min(100, (props.modelValue / (props.max ?? 100)) * 100)),
)
</script>

<template>
  <RekaProgressRoot
    v-bind="forwarded"
    :class="cn('relative h-1.5 w-full overflow-hidden rounded-pill bg-fill-muted', props.class)"
  >
    <RekaProgressIndicator
      class="h-full rounded-pill transition-[width] duration-400 ease-out"
      :class="cn('bg-rose-fill', indicatorClass)"
      :style="{ width: `${pct}%` }"
    />
  </RekaProgressRoot>
</template>
