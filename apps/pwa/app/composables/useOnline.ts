/**
 * Whether the browser believes it has a network, live.
 *
 * `navigator.onLine` is only trustworthy in one direction. `false` is a fact —
 * there is no interface up, and nothing will leave the device. `true` means
 * there is *an* interface, which a captive portal or a dead Wi-Fi router also
 * satisfies. So this is what decides whether to say "you're offline", and never
 * what decides that something was delivered: that is the server's to say. See
 * `ChatDelivery`.
 *
 * One ref and one pair of listeners for the whole app, attached on first use,
 * rather than a pair per caller that each has to remember to take them down.
 */
const online = ref(true)
let listening = false

export const useOnline = (): Readonly<Ref<boolean>> => {
  if (!listening && import.meta.client) {
    listening = true
    online.value = navigator.onLine !== false
    window.addEventListener('online', () => {
      online.value = true
    })
    window.addEventListener('offline', () => {
      online.value = false
    })
  }
  return readonly(online)
}
