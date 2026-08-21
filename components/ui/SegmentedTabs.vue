<script setup lang="ts">
defineProps<{
  modelValue: string
  tabs: { id: string; label: string }[]
}>()

defineEmits<{ (e: 'update:modelValue', v: string): void }>()
</script>

<template>
  <div class="flex gap-1 rounded-pill bg-fill-subtle p-1">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      class="h-9.5 flex-1 rounded-pill font-eyebrow text-[11px] font-bold uppercase tracking-[0.5px]"
      :class="
        modelValue === tab.id
          ? 'btn-raised bg-inverse text-on-inverse [--btn-face:var(--surface-inverse)]'
          : 'text-muted transition-colors duration-150 hover:text-ink'
      "
      @click="$emit('update:modelValue', tab.id)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>
