<script setup lang="ts">
/**
 * The build credit: "Powered by", set against amando's wordmark.
 *
 * This is the one piece of artwork in the repo that is not DP Fitness's, and it
 * follows the opposite rule to `BrandLogo` next door: it is meant to be quiet.
 * The wordmark is `currentColor` by default, so it takes the colour of the
 * muted line it is placed on and never reads as a second logo competing with
 * the brand it sits under. amando's own terracotta is reserved for the two
 * moments it is earned — `brand`, and the hover state of the link:
 *
 *   <PoweredBy />                    the credit in the caller's text colour
 *   <PoweredBy brand />              the wordmark in amando's terracotta
 *   <PoweredBy href="https://..." /> the same, as a link out, warming on hover
 *   <PoweredBy inverse ... />        the terracotta a dark ground needs
 *
 * The brand ships this in three flat colourways -- terracotta, black and white
 * -- which are one geometry under three fills, exactly as DP Fitness's own mark
 * is. So the colourway is a class here rather than three more files to keep in
 * step, and `poweredBy/Main logo.svg` stays the single source of the geometry.
 *
 * Reach for `inverse` on any dark surface. `--credit-mark` is #8f4d2a, which
 * measures 2.5:1 on the app's near-black -- fine as a fill on paper, not
 * legible on a dark footer -- so the token has a lifted companion at the same
 * hue, and this prop is how a caller asks for it.
 */
const props = withDefaults(
  defineProps<{
    /**
     * Rendered height of the wordmark. A bare number is px; a string is passed
     * through as-is. The words scale with it, so this is the one knob: the
     * whole credit grows and shrinks as a single lockup.
     */
    size?: number | string
    /**
     * Link the credit out to amando. Left off, this renders as a plain `span`,
     * which is what a surface with no outward links wants -- the app's own
     * boot splash, an email. Given, it opens in a new tab: it leaves the
     * product, and `noopener` because a tab you open should not get a handle
     * back to yours.
     */
    href?: string
    /** Paint the wordmark in amando's terracotta rather than inheriting. */
    brand?: boolean
    /**
     * Use the lifted terracotta -- the one that stays legible on a dark
     * ground. What a dark footer, an ink panel or the night splash wants.
     */
    inverse?: boolean
    /**
     * The words in front of the mark. "Powered by" unless a surface has a
     * reason to say something else.
     */
    text?: string
  }>(),
  { size: 13, brand: false, inverse: false, text: 'Powered by' },
)

/**
 * The artwork is 117 x 21, so width follows from the height the caller asks
 * for.
 *
 * Spelled out rather than left to `w-auto` for the same reason `BrandLogo`
 * spells it out: an SVG with an `auto` width is a flex item with an `auto`
 * cross-size, and one dropped into a `flex-col` gets stretched to the whole
 * column, at which point `preserveAspectRatio` quietly centres the artwork
 * inside all that width. A width that is a length is never stretched. `calc`
 * so a caller can still pass `0.8rem` and get a width in the same unit.
 */
const height = computed(() =>
  typeof props.size === 'number' ? `${props.size}px` : props.size,
)
const width = computed(() => `calc(${height.value} * 117 / 21)`)

/**
 * The words, at 0.72 of the wordmark's height.
 *
 * Tied to `size` rather than fixed, so the credit stays one lockup at any
 * scale instead of the label drifting away from the mark as the mark grows.
 * 0.72 is measured: it sets "POWERED BY" in Space Mono at a cap height that
 * matches the wordmark's x-height, which is what makes the two read as one
 * line rather than as a caption next to a logo.
 */
const labelSize = computed(() => `calc(${height.value} * 0.72)`)

/**
 * The space between the words and the mark, also off `size`.
 *
 * Not a `gap-[0.55em]` class, which is the obvious way to write it and the
 * wrong one: `em` on the root resolves against the *inherited* font size, so
 * the gap would stay 8.8px on a 16px page whether the credit was set at 12px
 * or at 40px. Tying it to the same height the rest of the lockup is built from
 * is what keeps `size` the single knob it is documented to be.
 */
const gap = computed(() => `calc(${height.value} * 0.68)`)

/**
 * amando's terracotta, in the version the ground can carry. Bound as a custom
 * property rather than picked in the class list because it is wanted in two
 * places -- the `brand` fill and the hover -- and a variable keeps those from
 * being two independent chances to get the dark case wrong.
 */
const accent = computed(() =>
  props.inverse ? 'var(--credit-mark-inverse)' : 'var(--credit-mark)',
)

/**
 * An anchor only when there is somewhere to go. Everything else about the
 * credit is identical between the two, so the element is the only thing that
 * changes -- there is no second template to keep in step.
 */
const tag = computed(() => (props.href ? 'a' : 'span'))
const linkAttrs = computed(() =>
  props.href
    ? { href: props.href, target: '_blank', rel: 'noopener noreferrer' }
    : {},
)
</script>

<template>
  <component
    :is="tag"
    v-bind="linkAttrs"
    class="group inline-flex items-center rounded-xs align-middle outline-offset-4"
    :style="{ '--credit-accent': accent, gap }"
  >
    <!--
      Real text, not part of the artwork. It is the half of the credit that
      should be translatable, selectable and read aloud, and keeping it out of
      the SVG is also what lets it sit in the app's own mono face rather than
      in whatever the export was set in.

      `leading-none` so the words measure exactly their cap height: with normal
      line-height the label's box is taller than the wordmark beside it and
      `items-center` then centres the two boxes rather than the two marks,
      which drops the words a pixel below the baseline of the logo.
    -->
    <span
      class="font-data font-normal uppercase leading-none whitespace-nowrap"
      :style="{ fontSize: labelSize, letterSpacing: '0.11em' }"
    >{{ text }}</span>

    <!--
      The wordmark. `role="img"` with a title rather than `aria-hidden`,
      because unlike `BrandLogo` -- which is almost always sat next to the
      words "DP Fitness" -- this artwork is the only thing in the markup that
      says whose credit this is. Hide it and the line reads "Powered by".
    -->
    <svg
      class="block shrink-0 transition-colors duration-150"
      :class="brand ? 'text-(--credit-accent)' : href ? 'group-hover:text-(--credit-accent) group-focus-visible:text-(--credit-accent)' : ''"
      :style="{ height, width }"
      viewBox="0 0 117 21"
      fill="none"
      role="img"
    >
      <title>amando</title>
      <path
        d="M65.9658 20.6488C65.6946 20.2099 66.1419 12.7322 66.5071 11.6008C67.0182 10.0175 68.9618 8.10059 70.6286 7.5358C74.0733 6.36857 77.563 7.6988 79.3045 10.8429C79.9708 12.0458 79.9727 12.0606 80.0461 16.3843L80.1196 20.7196H79.336H78.5524L78.4681 16.7221C78.3932 13.1713 78.3302 12.624 77.9038 11.8238C76.8773 9.8971 75.2678 8.92573 73.1037 8.9268C70.9029 8.9278 69.2837 9.93013 68.2414 11.9364C67.9034 12.587 67.816 13.419 67.7406 16.7004L67.6493 20.6761L66.8721 20.7668C66.4446 20.8167 66.0368 20.7638 65.9658 20.6488ZM4.26257 20.3508C2.972 19.8935 1.3608 18.4167 0.640971 17.0314C-0.172199 15.4664 -0.21912 12.5936 0.54298 11.0287C1.32157 9.42975 2.28812 8.41521 3.68748 7.72805C4.81198 7.17585 5.23837 7.09441 7.00473 7.09441C8.80563 7.09441 9.17871 7.16891 10.3511 7.763C11.9361 8.56607 13.2593 10.0306 13.875 11.6634C14.261 12.6869 14.324 13.4064 14.324 16.7869V20.7196H13.5358H12.7476V17.2697C12.7476 12.2178 12.1102 10.6423 9.55078 9.36682C7.40483 8.29745 4.81762 8.638 3.18742 10.2044C0.607429 12.6834 1.26312 16.8488 4.4953 18.513C5.24312 18.898 5.87513 19.001 7.68035 19.0319C10.9189 19.0874 10.7207 19.0289 10.7207 19.9314V20.7196L7.96182 20.7018C6.14208 20.6901 4.88288 20.5706 4.26257 20.3508ZM18.1526 16.5933C18.1526 11.506 18.335 10.8203 20.181 8.97241C21.5888 7.56314 22.979 6.9818 24.9412 6.9818C26.9937 6.9818 29.5573 8.3829 30.5041 10.0221L30.7643 10.4726L31.0266 10.0221C31.932 8.46785 34.0654 7.23255 36.1746 7.04129C38.2125 6.8565 39.8268 7.46476 41.3658 8.99729C43.1911 10.8149 43.376 11.5135 43.376 16.5933V20.7196L42.5315 20.7199L41.6869 20.7202L41.7604 17.3476C41.8548 13.0134 41.6085 11.7574 40.4086 10.4555C38.0551 7.90233 34.0009 8.312 32.3408 11.2708C31.8052 12.2252 31.7741 12.4804 31.7039 16.4969L31.6301 20.7196H30.7468H29.8635L29.8585 16.6095C29.8525 11.9828 29.6677 11.2196 28.2627 10.035C27.2031 9.14158 26.2435 8.78349 24.9088 8.78349C22.8779 8.78349 21.2021 9.82542 20.3812 11.5986C20.0241 12.3699 19.9634 13.0903 19.9592 16.6095L19.9542 20.7196H19.0533H18.1525L18.1526 16.5933ZM51.7099 20.3268C51.0763 20.1033 50.2262 19.4982 49.4376 18.7096C47.8317 17.1038 47.3277 15.7444 47.479 13.4275C47.6502 10.8074 48.9381 8.84209 51.2174 7.72276C52.33 7.17642 52.7616 7.09441 54.5239 7.09441C56.289 7.09441 56.717 7.17602 57.8377 7.72639C59.4162 8.50154 60.7735 9.9951 61.3853 11.6302C61.7815 12.6892 61.8432 13.3841 61.8432 16.7869V20.7196H61.055H60.2667V17.4651C60.2667 15.6752 60.1561 13.6946 60.0208 13.0639C59.1831 9.15771 54.0338 7.40203 50.9267 9.96317C48.6523 11.8379 48.4553 15.3987 50.5166 17.374C51.9517 18.7492 52.574 18.9511 55.5063 18.993L58.1272 19.0305L58.1971 19.8751L58.267 20.7196L55.4946 20.7018C53.5789 20.6895 52.4094 20.5737 51.7099 20.3268ZM88.273 20.2636C85.9614 19.3488 84.3197 17.3053 83.9335 14.8622C83.7342 13.6015 83.9938 11.7444 84.5084 10.7493C85.0789 9.64597 86.4288 8.32223 87.6154 7.70253C88.6543 7.15993 89.0311 7.09949 91.8523 7.0228L94.949 6.93861V7.86103V8.78347L92.4154 8.78448C89.1207 8.78648 88.3362 9.01464 87.0405 10.3502C84.9518 12.503 85.0851 15.7849 87.3383 17.6848C88.4448 18.6178 89.3584 18.9176 91.0945 18.9176C93.0823 18.9176 94.3124 18.4041 95.5532 17.0561C97.0951 15.3811 97.2011 14.723 97.2011 6.82806V0H98.1159H99.0307L98.9605 7.37561L98.8902 14.7512L98.1871 16.235C97.3533 17.9947 96.2669 19.1458 94.66 19.9723C93.0375 20.8068 89.9963 20.9457 88.273 20.2636ZM106.299 20.1801C103.046 18.6655 101.545 14.9249 102.758 11.3572C103.306 9.74628 105.293 7.81324 106.888 7.33962C111.202 6.05841 115.421 8.50638 116.073 12.6698C116.584 15.9318 115.187 18.7629 112.419 20.0721C110.574 20.9453 108.038 20.99 106.299 20.1801ZM111.771 18.5023C114.449 17.1363 115.361 13.7336 113.745 11.1396C111.631 7.74664 106.325 7.99534 104.475 11.5741C104.287 11.9374 104.081 12.8142 104.016 13.5225C103.805 15.8519 105.199 17.9756 107.504 18.8355C108.616 19.2505 110.61 19.0948 111.771 18.5023Z"
        fill="currentColor"
      />
    </svg>
  </component>
</template>
