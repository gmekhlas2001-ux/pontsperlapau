import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  listUserDocuments,
  uploadUserDocument,
  getDocumentDownloadUrl,
  deleteUserDocument,
  type UserDocument,
} from '@/services/documentsService';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  FileText, Upload, Download, Trash2, Loader as Loader2, Lock, Eye,
  Image as ImageIcon, FileType, Paperclip,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  /**
   * The user the documents belong to. Pass `null` while creating a new
   * user — uploads are deferred and held in local state until the
   * parent calls `flush(newUserId)` after the user is saved.
   */
  userId: string | null;
  /** When deferred, the parent owns the pending File queue via these refs. */
  pendingRef?: React.MutableRefObject<File[]>;
  /** Called when the user adds/removes pending files (deferred mode). */
  onPendingChange?: (files: File[]) => void;
  /** Compact = no card wrapper, used inside dialogs. */
  className?: string;
}

const TYPE_ICON = (mime?: string | null) => {
  if (!mime) return FileType;
  if (mime.startsWith('image/')) return ImageIcon;
  if (mime.includes('pdf')) return FileText;
  return FileType;
};

function formatSize(bytes?: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsManager({ userId, pendingRef, onPendingChange, className }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isSuperadmin = user?.role === 'superadmin';
  const isAdminOrUp = user?.role === 'superadmin' || user?.role === 'admin';

  const [docs, setDocs] = useState<UserDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<UserDocument | null>(null);
  const [pending, setPending] = useState<File[]>(pendingRef?.current ?? []);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const res = await listUserDocuments(userId);
    if (res.success && res.data) setDocs(res.data);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // Keep pendingRef in sync.
  useEffect(() => {
    if (pendingRef) pendingRef.current = pending;
    onPendingChange?.(pending);
  }, [pending, pendingRef, onPendingChange]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);

    // Deferred mode (no userId yet) — queue locally.
    if (!userId) {
      setPending((prev) => [...prev, ...arr]);
      if (fileInput.current) fileInput.current.value = '';
      return;
    }

    // Live mode — upload immediately, one at a time.
    for (let i = 0; i < arr.length; i++) {
      setUploadingIdx(i);
      const res = await uploadUserDocument({ userId, file: arr[i] });
      if (!res.success) {
        toast.error(`${arr[i].name}: ${res.error}`);
      }
    }
    setUploadingIdx(null);
    if (fileInput.current) fileInput.current.value = '';
    load();
  };

  const removePending = (idx: number) => {
    setPending((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleDownload = async (doc: UserDocument) => {
    setDownloadingId(doc.id);
    const res = await getDocumentDownloadUrl(doc.id);
    setDownloadingId(null);
    if (!res.success || !res.url) {
      toast.error(res.error || t('documents.downloadFailed'));
      return;
    }
    // Open the signed URL in a new tab; the browser handles download because
    // the storage signed URL was created with `download: filename`.
    window.open(res.url, '_blank', 'noopener,noreferrer');
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeletingId(confirmDelete.id);
    const res = await deleteUserDocument(confirmDelete.id);
    setDeletingId(null);
    setConfirmDelete(null);
    if (!res.success) {
      toast.error(res.error || t('documents.deleteFailed'));
      return;
    }
    toast.success(t('documents.deleteSuccess'));
    load();
  };

  if (!isAdminOrUp) {
    // Non-admins simply don't see this section.
    return null;
  }

  const isDeferred = !userId;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">{t('documents.title')}</h3>
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <Lock className="h-3 w-3" /> {t('documents.superadminOnly')}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isDeferred ? t('documents.deferredHint') : t('documents.liveHint')}
          </p>
        </div>
        <div>
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            multiple
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => fileInput.current?.click()}
            disabled={uploadingIdx !== null}
          >
            {uploadingIdx !== null ? (
              <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />{t('documents.uploading')}</>
            ) : (
              <><Upload className="h-4 w-4 mr-1.5" />{t('documents.attach')}</>
            )}
          </Button>
        </div>
      </div>

      {/* Deferred queue (during user creation) */}
      {isDeferred && pending.length > 0 && (
        <div className="rounded-lg border border-dashed p-2 space-y-1.5 bg-muted/30">
          {pending.map((f, idx) => {
            const Icon = TYPE_ICON(f.type);
            return (
              <div key={idx} className="flex items-center gap-2 text-sm">
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate">{f.name}</span>
                <span className="text-xs text-muted-foreground">{formatSize(f.size)}</span>
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6"
                        onClick={() => removePending(idx)}>
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Existing documents (live mode) */}
      {!isDeferred && (
        loading ? (
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : docs.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            {t('documents.noFiles')}
          </div>
        ) : (
          <div className="space-y-1.5">
            {docs.map((d) => {
              const Icon = TYPE_ICON(d.mime_type);
              return (
                <div key={d.id} className="flex items-center gap-3 rounded-lg border bg-muted/30 p-2.5">
                  <div className="h-9 w-9 rounded bg-background flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.file_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatSize(d.size_bytes)}
                      {' · '}
                      {new Date(d.uploaded_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isSuperadmin ? (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleDownload(d)}
                          disabled={downloadingId === d.id}
                          title={t('documents.download')}
                        >
                          {downloadingId === d.id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Download className="h-4 w-4" />}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-600"
                          onClick={() => setConfirmDelete(d)}
                          disabled={deletingId === d.id}
                          title={t('documents.delete')}
                        >
                          {deletingId === d.id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Trash2 className="h-4 w-4" />}
                        </Button>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground inline-flex items-center gap-1 px-2">
                        <Eye className="h-3 w-3" /> {t('documents.hiddenForRole')}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('documents.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('documents.deleteDescription', { name: confirmDelete?.file_name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Helper to flush a queued list of files after the user is created. */
export async function flushPendingDocuments(userId: string, files: File[]): Promise<{ uploaded: number; failed: { name: string; error: string }[] }> {
  let uploaded = 0;
  const failed: { name: string; error: string }[] = [];
  for (const f of files) {
    const res = await uploadUserDocument({ userId, file: f });
    if (res.success) uploaded++;
    else failed.push({ name: f.name, error: res.error || 'unknown' });
  }
  return { uploaded, failed };
}
