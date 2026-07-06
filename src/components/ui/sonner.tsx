import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "@/contexts/ThemeContext"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme()

  return (
    <Sonner
      theme={resolvedTheme as ToasterProps["theme"]}
      className="toaster group"
      richColors
      closeButton
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast border shadow-lg !bg-background !text-foreground !border-border",
          title: "font-semibold text-sm",
          description: "text-sm opacity-90",
          actionButton: "!bg-primary !text-primary-foreground",
          cancelButton: "!bg-muted !text-muted-foreground",
          success: "!bg-emerald-50 !text-emerald-900 !border-emerald-300 dark:!bg-emerald-950 dark:!text-emerald-100 dark:!border-emerald-800",
          error: "!bg-red-50 !text-red-900 !border-red-300 dark:!bg-red-950 dark:!text-red-100 dark:!border-red-800",
          warning: "!bg-amber-50 !text-amber-900 !border-amber-300 dark:!bg-amber-950 dark:!text-amber-100 dark:!border-amber-800",
          info: "!bg-sky-50 !text-sky-900 !border-sky-300 dark:!bg-sky-950 dark:!text-sky-100 dark:!border-sky-800",
        },
      }}
      style={
        {
          "--normal-bg": "hsl(var(--background))",
          "--normal-text": "hsl(var(--foreground))",
          "--normal-border": "hsl(var(--border))",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
