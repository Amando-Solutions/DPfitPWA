import { Fragment } from "react"
import type { LucideIcon } from "lucide-react"
import { MoreHorizontalIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export interface DataTableRowAction {
  label: string
  onSelect: () => void
  icon?: LucideIcon
  disabled?: boolean
  variant?: "default" | "destructive"
  separatorBefore?: boolean
}

export function DataTableRowActions({
  label,
  actions,
}: {
  label: string
  actions: DataTableRowAction[]
}) {
  return (
    <div
      className="flex justify-end"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button type="button" variant="ghost" size="icon-sm" />}
        >
          <MoreHorizontalIcon />
          <span className="sr-only">{label}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            {actions.map((action, index) => {
              const Icon = action.icon

              return (
                <Fragment key={`${action.label}-${index}`}>
                  {action.separatorBefore && <DropdownMenuSeparator />}
                  <DropdownMenuItem
                    disabled={action.disabled}
                    variant={action.variant}
                    onClick={action.onSelect}
                  >
                    {Icon && <Icon />}
                    {action.label}
                  </DropdownMenuItem>
                </Fragment>
              )
            })}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
