"use client";

import { Dialog as DialogPrimitive } from "@base-ui-components/react/dialog";
import { XIcon } from "lucide-react";
import { cn } from "../utils/cn";
import { ScrollArea } from "./ScrollArea";

const Dialog = DialogPrimitive.Root;

const DialogPortal = DialogPrimitive.Portal;

function DialogTrigger(props: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogClose(props: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogBackdrop({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      className={cn(
        "fixed inset-0 z-50 bg-black/32 backdrop-blur-sm transition-all duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0",
        className,
      )}
      data-slot="dialog-backdrop"
      {...props}
    />
  );
}

function DialogViewport({
  className,
  ...props
}: DialogPrimitive.Viewport.Props) {
  return (
    <DialogPrimitive.Viewport
      className={cn(
        "fixed inset-0 z-50 grid grid-rows-[1fr_auto] justify-items-center pt-12 sm:grid-rows-[1fr_auto_3fr] sm:p-4",
        className,
      )}
      data-slot="dialog-viewport"
      {...props}
    />
  );
}

function DialogPopup({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean;
}) {
  return (
    <DialogPortal>
      <DialogBackdrop />
      <DialogViewport>
        <DialogPrimitive.Popup
          className={cn(
            "relative row-start-2 flex max-h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-xl transition-[scale,opacity,translate] duration-200 ease-in-out will-change-transform data-nested-dialog-open:origin-top data-ending-style:opacity-0 data-starting-style:opacity-0 max-sm:rounded-b-none max-sm:border-b-0 max-sm:data-ending-style:translate-y-4 max-sm:data-starting-style:translate-y-4 sm:max-w-lg sm:-translate-y-[calc(1.25rem*var(--nested-dialogs))] sm:scale-[calc(1-0.1*var(--nested-dialogs))] sm:opacity-[calc(1-0.1*var(--nested-dialogs))] sm:data-nested:data-ending-style:translate-y-8 sm:data-nested:data-starting-style:translate-y-8 sm:data-ending-style:scale-98 sm:data-starting-style:scale-98",
            className,
          )}
          data-slot="dialog-popup"
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close className="absolute end-2 top-2 inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent text-muted-foreground opacity-72 outline-none transition-[color,background-color,box-shadow,opacity] pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 hover:bg-accent hover:text-foreground hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0">
              <XIcon />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Popup>
      </DialogViewport>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 p-6 in-[[data-slot=dialog-popup]:has([data-slot=dialog-panel])]:pb-3 max-sm:pb-4",
        className,
      )}
      data-slot="dialog-header"
      {...props}
    />
  );
}

function DialogFooter({
  className,
  variant = "bare",
  ...props
}: React.ComponentProps<"div"> & {
  variant?: "default" | "bare";
}) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 px-6 pb-6 pt-4 sm:flex-row sm:justify-end",
        variant === "default" && "border-t border-border bg-muted/50",
        className,
      )}
      data-slot="dialog-footer"
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      className={cn("font-heading text-xl leading-none", className)}
      data-slot="dialog-title"
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      className={cn("text-muted-foreground text-sm", className)}
      data-slot="dialog-description"
      {...props}
    />
  );
}

function DialogPanel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <ScrollArea>
      <div
        className={cn(
          "px-6 in-[[data-slot=dialog-popup]:has([data-slot=dialog-header])]:pt-1 in-[[data-slot=dialog-popup]:not(:has([data-slot=dialog-header]))]:pt-6 in-[[data-slot=dialog-popup]:not(:has([data-slot=dialog-footer]))]:pb-6! in-[[data-slot=dialog-popup]:not(:has([data-slot=dialog-footer].border-t))]:pb-1 pb-6",
          className,
        )}
        data-slot="dialog-panel"
        {...props}
      />
    </ScrollArea>
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogBackdrop,
  DialogBackdrop as DialogOverlay,
  DialogPopup,
  DialogPopup as DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogViewport,
};

