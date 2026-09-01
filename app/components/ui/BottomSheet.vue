<script setup lang="ts">
import { VisuallyHidden } from 'reka-ui'

/*
  A bottom sheet on a phone, a centred dialog once there is desktop room.

  The panel itself is shadcn's Sheet (Reka UI's Dialog underneath), which is
  what supplies the behaviour this component used to be missing: focus is
  trapped inside the panel and restored to whatever opened it, Escape and a
  click on the scrim both dismiss, the title is wired into `aria-labelledby`,
  and the body actually stops scrolling behind the sheet — the `watch` that
  used to claim to do that had an empty callback.

  The v-model API is unchanged, so every screen that opens a sheet keeps
  working as it did.
*/
const props = defineProps<{
  modelValue: boolean
  title?: string
  /** Optional supporting line, announced with the title by a screen reader. */
  description?: string
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

/* Reka always generates a description id and points `aria-describedby` at it,
   which dangles on the sheets whose body is a form or a list rather than
   prose. Passing the attribute through as `undefined` clears it; omitting the
   key entirely leaves Reka's own wiring in place for the sheets that do render
   a <SheetDescription>. */
const contentAttrs = computed(() =>
  props.description ? {} : { 'aria-describedby': undefined },
)
</script>

<template>
  <Sheet v-model:open="open">
    <!--
      Every sheet in the app is opened from application state rather than from a
      trigger element, so there is no <SheetTrigger> here. Reka still returns
      focus to whatever held it when the sheet opened.
    -->
    <SheetContent side="adaptive" v-bind="contentAttrs">
      <!-- The grab handle is mobile-only: on desktop this is a dialog. -->
      <div
        class="mx-auto mb-4 h-1 w-10 rounded-pill bg-hairline-strong lg:hidden"
        aria-hidden="true"
      />

      <SheetTitle v-if="title" :class="description ? 'mb-1' : 'mb-3'">
        {{ title }}
      </SheetTitle>
      <!-- A dialog must always be labelled, so an untitled sheet still gets a
           title in the accessibility tree, just not on screen. -->
      <VisuallyHidden v-else as-child>
        <SheetTitle>Dialog</SheetTitle>
      </VisuallyHidden>

      <SheetDescription v-if="description" class="mb-3">
        {{ description }}
      </SheetDescription>

      <slot />
    </SheetContent>
  </Sheet>
</template>
