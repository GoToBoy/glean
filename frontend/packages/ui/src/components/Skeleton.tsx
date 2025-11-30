import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

const skeletonVariants = cva(
  'animate-pulse rounded-md bg-muted',
  {
    variants: {
      variant: {
        default: 'bg-muted',
        text: 'bg-muted/60',
        circle: 'rounded-full',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface SkeletonProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof skeletonVariants> {}

/**
 * Skeleton component for loading states.
 * 
 * @example
 * ```tsx
 * <Skeleton className="h-12 w-12" variant="circle" />
 * <Skeleton className="h-4 w-full" />
 * ```
 */
export function Skeleton({ className, variant, ...props }: SkeletonProps) {
  return (
    <div
      className={skeletonVariants({ variant, className })}
      {...props}
    />
  )
}

