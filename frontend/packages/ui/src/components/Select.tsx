"use client";

import { Select as SelectPrimitive } from "@base-ui-components/react/select";
import {
  ChevronDownIcon,
  ChevronsUpDownIcon,
  ChevronUpIcon,
} from "lucide-react";

import { cn } from "../utils/cn";

const Select = SelectPrimitive.Root;

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: "sm" | "default" | "lg";
}) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        "relative inline-flex w-full min-w-36 select-none items-center justify-between gap-2 rounded-lg border border-input bg-background bg-clip-padding px-3 py-1.5 text-left text-base/5 shadow-xs outline-none ring-ring/24 transition-shadow pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 focus-visible:border-ring focus-visible:ring-[3px] data-disabled:pointer-events-none data-placeholder:text-muted-foreground data-disabled:opacity-64 sm:text-sm dark:bg-input/32 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:opacity-72",
        size === "sm" && "gap-1.5 px-2.5 py-1",
        size === "lg" && "py-2",
        className,
      )}
      data-slot="select-trigger"
      {...props}
    >
      {children}
      <SelectPrimitive.Icon data-slot="select-icon">
        <ChevronsUpDownIcon className="-me-1 size-4 opacity-72" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      className={cn("flex-1 truncate", className)}
      data-slot="select-value"
      {...props}
    />
  );
}

function SelectPopup({
  className,
  children,
  sideOffset = 4,
  alignItemWithTrigger = true,
  ...props
}: SelectPrimitive.Popup.Props & {
  sideOffset?: SelectPrimitive.Positioner.Props["sideOffset"];
  alignItemWithTrigger?: SelectPrimitive.Positioner.Props["alignItemWithTrigger"];
}) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        alignItemWithTrigger={alignItemWithTrigger}
        className="z-50 select-none"
        data-slot="select-positioner"
        sideOffset={sideOffset}
      >
        <SelectPrimitive.Popup
          className="origin-(--transform-origin) transition-[opacity,transform] duration-200 ease-out data-ending-style:pointer-events-none data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0"
          data-slot="select-popup"
          {...props}
        >
          <SelectPrimitive.ScrollUpArrow
            className="top-0 z-50 flex h-6 w-full cursor-default items-center justify-center before:pointer-events-none before:absolute before:inset-x-px before:top-px before:h-[200%] before:rounded-t-lg before:bg-gradient-to-b before:from-50% before:from-popover"
            data-slot="select-scroll-up-arrow"
          >
            <ChevronUpIcon className="relative size-4" />
          </SelectPrimitive.ScrollUpArrow>
          <span className="relative block h-full rounded-lg border bg-popover bg-clip-padding before:pointer-events-none before:absolute before:inset-0 before:rounded-lg before:shadow-lg dark:bg-card">
            <SelectPrimitive.List
              className={cn(
                "max-h-[var(--available-height)] min-w-[var(--anchor-width)] overflow-y-auto p-1",
                className,
              )}
              data-slot="select-list"
            >
              {children}
            </SelectPrimitive.List>
          </span>
          <SelectPrimitive.ScrollDownArrow
            className="bottom-0 z-50 flex h-6 w-full cursor-default items-center justify-center before:pointer-events-none before:absolute before:inset-x-px before:bottom-px before:h-[200%] before:rounded-b-lg before:bg-gradient-to-t before:from-50% before:from-popover"
            data-slot="select-scroll-down-arrow"
          >
            <ChevronDownIcon className="relative size-4" />
          </SelectPrimitive.ScrollDownArrow>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "grid cursor-default grid-cols-[1rem_1fr] items-center gap-2 rounded-sm py-1 ps-2 pe-4 text-base outline-none data-disabled:pointer-events-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-64 sm:text-sm [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      data-slot="select-item"
      {...props}
    >
      <SelectPrimitive.ItemIndicator className="col-start-1">
        <svg
          fill="none"
          height="24"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width="24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M5.252 12.7 10.2 18.63 18.748 5.37" />
        </svg>
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText className="col-start-2 min-w-0">
        {children}
      </SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      className={cn("mx-2 my-1 h-px bg-border", className)}
      data-slot="select-separator"
      {...props}
    />
  );
}

function SelectGroup(props: SelectPrimitive.Group.Props) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

function SelectGroupLabel(props: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      className="px-2 py-1.5 font-medium text-muted-foreground text-xs"
      data-slot="select-group-label"
      {...props}
    />
  );
}

export {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectPopup as SelectContent,
  SelectItem,
  SelectSeparator,
  SelectGroup,
  SelectGroupLabel,
};


