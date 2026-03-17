import { type HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-[var(--color-accent)] text-white',
        secondary:
          'border-transparent bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)]',
        destructive: 'border-transparent bg-[var(--color-danger)] text-white',
        outline: 'border-[var(--color-border)] text-[var(--color-text-primary)]',
        pending:
          'border-transparent bg-amber-500/20 text-amber-400 dark:bg-amber-500/20 dark:text-amber-300',
        approved:
          'border-transparent bg-[var(--color-success)]/20 text-[var(--color-success)]',
        discarded:
          'border-transparent bg-[var(--color-danger)]/20 text-[var(--color-danger)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}
