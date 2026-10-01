import type { Column } from "@tanstack/react-table"
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
} from "lucide-react"

import type { DataTableFeatures } from "@/components/data-table/data-table-features"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function DataTableColumnHeader<TData extends object, TValue>({
  column,
  title,
  className,
}: {
  column: Column<DataTableFeatures, TData, TValue>
  title: string
  className?: string
}) {
  if (!column.getCanSort()) {
    return <span className={className}>{title}</span>
  }

  const sorted = column.getIsSorted()

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("-ml-2 h-8", className)}
      onClick={() => column.toggleSorting(sorted === "asc")}
      aria-label={`Sort by ${title}`}
    >
      {title}
      {sorted === "asc" ? (
        <ArrowUpIcon data-icon="inline-end" />
      ) : sorted === "desc" ? (
        <ArrowDownIcon data-icon="inline-end" />
      ) : (
        <ArrowUpDownIcon data-icon="inline-end" />
      )}
    </Button>
  )
}
