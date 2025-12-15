/**
 * Badge component for displaying notifications and counts.
 */

import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-full font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-primary-600 text-white',
        secondary: 'bg-muted text-muted-foreground',
        destructive: 'bg-destructive text-destructive-foreground',
        outline: 'border border-border bg-transparent text-foreground',
      },
      size: {
        sm: 'h-4 min-w-[1rem] px-1 text-[10px]',
        default: 'h-5 min-w-[1.25rem] px-1.5 text-xs',
        lg: 'h-6 min-w-[1.5rem] px-2 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span className={badgeVariants({ variant, size, className })} {...props} />
}

// eslint-disable-next-line react-refresh/only-export-components
export { Badge, badgeVariants }

