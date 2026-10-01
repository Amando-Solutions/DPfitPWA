import { useEffect } from "react"
import {
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query"
import type { Unsubscribe } from "firebase/firestore"

type Subscribe<T> = (
  onData: (data: T) => void,
  onError: (message: string) => void,
) => Unsubscribe

export function useRealtimeQuery<T>({
  queryKey,
  subscribe,
  enabled = true,
}: {
  queryKey: QueryKey
  subscribe: Subscribe<T>
  enabled?: boolean
}) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey,
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: ({ signal }) => new Promise<T>((resolve, reject) => {
      let settled = false
      let unsubscribe: Unsubscribe = () => undefined

      unsubscribe = subscribe(
        (data) => {
          if (settled) return
          settled = true
          resolve(data)
          queueMicrotask(unsubscribe)
        },
        (message) => {
          if (settled) return
          settled = true
          reject(new Error(message))
          queueMicrotask(unsubscribe)
        },
      )

      signal.addEventListener("abort", unsubscribe, { once: true })
    }),
  })

  useEffect(() => {
    if (!enabled || !query.isSuccess) return
    return subscribe(
      (data) => queryClient.setQueryData(queryKey, data),
      () => queryClient.invalidateQueries({ queryKey, exact: true }),
    )
  }, [enabled, query.isSuccess, queryClient, queryKey, subscribe])

  return query
}
