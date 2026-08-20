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
    class="opt"
    :class="{ 'opt--selected': selected, 'opt--compact': compact }"
    type="button"
  >
    <div v-if="icon" class="opt__icon">
      <AppIcon :name="icon" :size="18" :stroke="2.2" />
    </div>
    <div class="opt__text">
      <span class="opt__label">{{ label }}</span>
      <span v-if="desc" class="opt__desc">{{ desc }}</span>
    </div>
    <div class="opt__check">
      <AppIcon v-if="selected" name="check" :size="14" :stroke="3" />
    </div>
  </button>
</template>

<style scoped lang="scss">
.opt {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: var(--radius-md);
  background: var(--paper);
  box-shadow: inset 0 0 0 1.5px rgba(36, 27, 46, 0.1);
  text-align: left;
  transition: all 0.15s ease;

  &--compact {
    padding: 12px 14px;
  }

  &--selected {
    background: rgba(200, 30, 92, 0.06);
    box-shadow: inset 0 0 0 1.5px var(--rose);
  }

  &__icon {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    display: grid;
    place-items: center;
    background: rgba(36, 27, 46, 0.06);
    color: var(--ink);
    flex-shrink: 0;

    .opt--selected & {
      background: var(--rose);
      color: var(--paper-raised);
    }
  }

  &__text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__label {
    font-weight: 700;
    font-size: 15px;
    color: var(--ink);
  }

  &__desc {
    font-size: 12.5px;
    color: var(--violet-45);
  }

  &__check {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    color: var(--paper-raised);

    .opt--selected & {
      background: var(--rose);
    }
  }
}
</style>
