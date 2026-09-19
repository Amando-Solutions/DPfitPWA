<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    // `null` is a real value here: the profile stores "not answered yet" as
    // null for age, height and weight, and those fields bind straight to this.
    modelValue?: string | number | null
    label?: string
    placeholder?: string
    type?: string
    suffix?: string
    icon?: string
    error?: string
    mono?: boolean
    /**
     * Forwarded to the input rather than left to fall through: this component's
     * root is the <label>, so an unclaimed attribute would land there and the
     * phone would still raise the wrong keyboard.
     */
    inputmode?: 'text' | 'decimal' | 'numeric' | 'tel' | 'email' | 'url' | 'search'
    /**
     * Forwarded for the same reason. It is what a password manager reads: iOS
     * offers a strong password on `new-password` and fills a saved one on
     * `current-password`, and neither happens against the label.
     */
    autocomplete?: string
    /** For a field whose visible label sits outside the component. */
    ariaLabel?: string
    /**
     * A show/hide control on a `type="password"` field.
     *
     * Opt-in rather than automatic on every password box: a member typing a
     * password they are *choosing* cannot check it any other way — the
     * characters are dots and the confirmation box only says whether two
     * unreadable strings agree — whereas one they already know is a shoulder
     * to read over for nothing.
     */
    reveal?: boolean
  }>(),
  { type: 'text', mono: false, reveal: false },
)

defineEmits<{
  (e: 'update:modelValue', v: string): void
  // `blur` doesn't bubble, so it has to be re-emitted from the input itself for
  // save-on-blur forms to work.
  (e: 'blur', ev: FocusEvent): void
}>()

const revealed = ref(false)

/** Only a password field has anything to reveal. */
const revealable = computed(() => props.reveal && props.type === 'password')

/**
 * What the input is actually set to.
 *
 * The `type` attribute is switched rather than the characters being redrawn,
 * which is the only way that works: a password input's dots are the browser's
 * rendering of the real value, and nothing else can un-render them.
 */
const inputType = computed(() => (revealable.value && revealed.value ? 'text' : props.type))
</script>

<template>
  <!-- min-w-0: grid/flex items default to min-width:auto, and a number input's
       intrinsic width is wide enough to burst a two-column row. -->
  <label class="block min-w-0">
    <!-- Sentence case in the body face, matching the labels that sit outside
         this component on the same forms. The uppercase Space Mono these used
         to be was a third font doing a label's job. -->
    <span v-if="label" class="mb-1.5 block text-[13px] text-soft">
      {{ label }}
    </span>

    <div
      class="flex h-13.5 min-w-0 items-center gap-2.5 rounded-2xl border bg-sunken px-4.25 transition-colors duration-150"
      :class="
        error
          ? 'border-primary'
          : 'border-hairline focus-within:border-primary'
      "
    >
      <AppIcon v-if="icon" :name="icon" :size="18" class="text-muted" />
      <input
        class="w-full min-w-0 flex-1 appearance-none border-none bg-transparent text-[15px] text-ink outline-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
        :class="mono && 'font-data tracking-[1px]'"
        :type="inputType"
        :inputmode="inputmode"
        :autocomplete="autocomplete"
        :aria-label="ariaLabel"
        :value="modelValue ?? ''"
        :placeholder="placeholder"
        @input="
          $emit('update:modelValue', ($event.target as HTMLInputElement).value)
        "
        @blur="$emit('blur', $event as FocusEvent)"
      />
      <span v-if="suffix" class="text-[13px] font-semibold text-muted">
        {{ suffix }}
      </span>

      <!--
        Inside the <label>, which is this component's root, and safe there: a
        label does not forward activation to its input for clicks that land on
        an interactive descendant, so the eye toggles without also being a
        click on the box.

        `type="button"` for the ordinary reason — an unmarked button inside a
        form submits it, and revealing a password would post the form.
      -->
      <button
        v-if="revealable"
        type="button"
        class="-mr-2 grid size-9 shrink-0 place-items-center rounded-pill text-muted transition-colors duration-150 active:text-ink"
        :aria-label="revealed ? 'Hide password' : 'Show password'"
        :aria-pressed="revealed"
        @click="revealed = !revealed"
      >
        <AppIcon :name="revealed ? 'eyeOff' : 'eye'" :size="18" />
      </button>
    </div>

    <span v-if="error" class="mt-1.5 block text-xs font-semibold text-primary">
      {{ error }}
    </span>
  </label>
</template>
