import { useMemo, useState, type ReactNode } from "react"
import {
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnVisibilityState,
  type SortingState,
  useTable,
} from "@tanstack/react-table"
import { ChevronDownIcon, SearchIcon } from "lucide-react"

import { dataTableFeatures, type DataTableFeatures } from "@/components/data-table/data-table-features"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

const searchColumnId = "__search"

export function DataTable<TData extends object>({
  columns,
  data,
  searchAccessor,
  searchPlaceholder = "Filter results...",
  columnLabels = {},
  pageSize = 10,
  onRowClick,
  isRowClickable,
  getRowLabel,
  className,
  toolbarAfterSearch,
  showColumnVisibility = true,
}: {
  columns: ColumnDef<DataTableFeatures, TData, unknown>[]
  data: TData[]
  searchAccessor?: (row: TData) => string
  searchPlaceholder?: string
  columnLabels?: Record<string, string>
  pageSize?: number
  onRowClick?: (row: TData) => void
  isRowClickable?: (row: TData) => boolean
  getRowLabel?: (row: TData) => string
  className?: string
  toolbarAfterSearch?: ReactNode
  showColumnVisibility?: boolean
}) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({
    [searchColumnId]: false,
  })

  const tableColumns = useMemo<ColumnDef<DataTableFeatures, TData, unknown>[]>(
    () =>
      searchAccessor
        ? [
            ...columns,
            {
              id: searchColumnId,
              accessorFn: searchAccessor,
              filterFn: "includesString",
              enableHiding: false,
              enableSorting: false,
            },
          ]
        : columns,
    [columns, searchAccessor],
  )

  const table = useTable({
    features: dataTableFeatures,
    columns: tableColumns,
    data,
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize,
      },
    },
    state: {
      sorting,
      columnFilters,
      columnVisibility,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
  })

  const searchColumn = searchAccessor ? table.getColumn(searchColumnId) : undefined
  const filteredCount = table.getPrePaginatedRowModel().rows.length

  return (
    <div className={cn("flex flex-col gap-3 p-4", className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
          {searchColumn ? (
            <div className="relative w-full sm:max-w-sm">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                aria-label={searchPlaceholder}
                placeholder={searchPlaceholder}
                value={(searchColumn.getFilterValue() as string | undefined) ?? ""}
                onChange={(event) => searchColumn.setFilterValue(event.target.value)}
                className="h-11 pl-9 sm:h-8"
              />
            </div>
          ) : null}
          {toolbarAfterSearch}
        </div>

        {showColumnVisibility && <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button type="button" variant="outline" className="min-h-11 sm:min-h-8" />}
          >
            Columns
            <ChevronDownIcon data-icon="inline-end" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuGroup>
              {table
                .getAllColumns()
                .filter((column) => column.id !== searchColumnId && column.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(checked) => column.toggleVisibility(checked)}
                  >
                    {columnLabels[column.id] ?? column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>}
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => {
                const clickable = Boolean(
                  onRowClick && (!isRowClickable || isRowClickable(row.original)),
                )

                return (
                  <TableRow
                    key={row.id}
                    className={cn(clickable && "cursor-pointer focus-visible:bg-muted focus-visible:outline-none")}
                    tabIndex={clickable ? 0 : undefined}
                    aria-label={clickable ? getRowLabel?.(row.original) : undefined}
                    onClick={clickable ? () => onRowClick?.(row.original) : undefined}
                    onKeyDown={
                      clickable
                        ? (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault()
                              onRowClick?.(row.original)
                            }
                          }
                        : undefined
                    }
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        <table.FlexRender cell={cell} />
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={table.getVisibleLeafColumns().length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground">
          {filteredCount} result{filteredCount === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <span className="text-muted-foreground">
            Page {table.state.pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
