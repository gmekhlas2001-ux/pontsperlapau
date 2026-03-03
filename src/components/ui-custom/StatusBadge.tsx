import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: 'active' | 'inactive' | 'pending' | 'available' | 'borrowed' | 'out_of_stock' | 'overdue' | 'returned' | 'good' | 'damaged' | 'lost';
  className?: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  active: {
    label: 'Active',
    className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
  },
  inactive: {
    label: 'Inactive',
    className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
  },
  pending: {
    label: 'Pending',
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',
  },
  available: {
    label: 'Available',
    className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
  },
  borrowed: {
    label: 'Borrowed',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
  },
  out_of_stock: {
    label: 'Out of Stock',
    className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100',
  },
  overdue: {
    label: 'Overdue',
    className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
  },
  returned: {
    label: 'Returned',
    className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
  },
  good: {
    label: 'Good',
    className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
  },
  damaged: {
    label: 'Damaged',
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',
  },
  lost: {
    label: 'Lost',
    className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  
  return (
    <Badge
      variant="secondary"
      className={cn(config.className, className)}
    >
      {config.label}
    </Badge>
  );
}
