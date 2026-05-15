/**
 * ImageUpload — reusable image upload widget.
 *
 * Uploads to the public Supabase Storage bucket `public-images` and returns
 * a public URL via the `onChange` callback. Used for profile pictures and
 * book covers.
 *
 * Variants:
 *   variant="avatar" — circular preview, ideal for user profiles
 *   variant="cover"  — rectangular preview (3:4), ideal for book covers
 */

import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { callEdgeFunction } from '@/lib/edge';

interface Props {
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  variant?: 'avatar' | 'cover';
  /** Sub-folder inside the bucket (e.g. "users", "books"). Defaults to "misc". */
  folder?: string;
  /** Max file size in bytes. Defaults to 2 MB. */
  maxBytes?: number;
  className?: string;
  disabled?: boolean;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function ImageUpload({
  value,
  onChange,
  variant = 'avatar',
  folder = 'misc',
  maxBytes = 2 * 1024 * 1024,
  className,
  disabled,
}: Props) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error('Only image files are allowed');
      return;
    }
    if (file.size > maxBytes) {
      toast.error(`File is too large (max ${(maxBytes / 1024 / 1024).toFixed(1)} MB)`);
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const res = await callEdgeFunction<{ success: boolean; publicUrl: string }>('app-actions', {
        operation: 'upload-public-image',
        folder,
        extension: ext,
        contentType: file.type,
        base64: arrayBufferToBase64(await file.arrayBuffer()),
      });

      if (!res.ok || !res.data?.publicUrl) throw new Error(res.error || 'Upload failed');

      onChange(res.data.publicUrl);
      toast.success('Image uploaded');
    } catch (err: any) {
      toast.error(err.message ?? 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function handleRemove() {
    onChange(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  const sizeClass = variant === 'avatar'
    ? 'w-24 h-24 rounded-full'
    : 'w-28 h-40 rounded-md';

  return (
    <div className={cn('flex items-center gap-4', className)}>
      {/* Preview */}
      <div className={cn(
        'relative shrink-0 overflow-hidden border-2 border-dashed bg-muted/40 flex items-center justify-center',
        sizeClass,
        value && 'border-solid border-border',
      )}>
        {value ? (
          <img src={value} alt="preview" className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
        )}
        {uploading && (
          <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-2">
        <input
          id={inputId}
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={disabled || uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || uploading}
          onClick={() => fileRef.current?.click()}
          className="gap-1.5"
        >
          <Upload className="w-3.5 h-3.5" />
          {value ? 'Replace' : 'Upload image'}
        </Button>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || uploading}
            onClick={handleRemove}
            className="gap-1.5 text-destructive hover:text-destructive"
          >
            <X className="w-3.5 h-3.5" /> Remove
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          PNG / JPG / WebP, max {(maxBytes / 1024 / 1024).toFixed(1)} MB
        </p>
      </div>
    </div>
  );
}
