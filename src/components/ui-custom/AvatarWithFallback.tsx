/**
 * Avatar with initials fallback.
 * Shows the profile photo when `src` is provided; falls back to the user's
 * initials on a branded background when the image is missing or fails to load.
 */

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn, getInitials } from '@/lib/utils';

interface AvatarWithFallbackProps {
  src?: string;
  firstName: string;
  lastName: string;
  className?: string;
  fallbackClassName?: string;
}

export function AvatarWithFallback({
  src,
  firstName,
  lastName,
  className,
  fallbackClassName,
}: AvatarWithFallbackProps) {
  const initials = getInitials(firstName, lastName);
  
  return (
    <Avatar className={cn(className)}>
      <AvatarImage src={src} alt={`${firstName} ${lastName}`} />
      <AvatarFallback
        className={cn(
          'bg-primary text-primary-foreground font-medium',
          fallbackClassName
        )}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
