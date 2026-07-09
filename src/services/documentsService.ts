import { supabase } from '@/lib/supabase';
import { callEdgeFunction } from '@/lib/edge';

export interface UserDocument {
  id: string;
  user_id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  description: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

/** List documents attached to a user. Metadata only — never the file content. */
export async function listUserDocuments(userId: string) {
  try {
    const { data, error } = await supabase
      .from('user_documents')
      .select('id, user_id, file_name, mime_type, size_bytes, description, uploaded_by, uploaded_at')
      .eq('user_id', userId)
      .order('uploaded_at', { ascending: false });
    if (error) throw error;
    return { success: true, data: (data ?? []) as UserDocument[] };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to list documents' };
  }
}

/** Read a File into base64 (no data: prefix). Throws on read errors. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('File read error'));
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

const MAX_BYTES = 10 * 1024 * 1024;

export async function uploadUserDocument(params: {
  userId: string;
  file: File;
  description?: string;
}) {
  if (params.file.size > MAX_BYTES) {
    return { success: false, error: 'File exceeds 10 MB' };
  }
  let b64: string;
  try { b64 = await fileToBase64(params.file); }
  catch (err: any) {
    return { success: false, error: err.message ?? 'Could not read file' };
  }

  const res = await callEdgeFunction('user-documents', {
    operation: 'upload',
    targetUserId: params.userId,
    fileName: params.file.name,
    mimeType: params.file.type || undefined,
    description: params.description,
    fileB64: b64,
  });
  if (!res.ok) return { success: false, error: res.error || 'Upload failed' };
  return { success: true, data: (res.data as any)?.document as UserDocument };
}

/** Get a short-lived signed URL to download the document. Superadmin only. */
export async function getDocumentDownloadUrl(documentId: string) {
  const res = await callEdgeFunction('user-documents', {
    operation: 'download',
    documentId,
  });
  if (!res.ok) return { success: false, error: res.error || 'Could not fetch document' };
  return {
    success: true,
    url: (res.data as any)?.url as string,
    fileName: (res.data as any)?.fileName as string,
  };
}

export async function deleteUserDocument(documentId: string) {
  const res = await callEdgeFunction('user-documents', {
    operation: 'delete',
    documentId,
  });
  if (!res.ok) return { success: false, error: res.error || 'Delete failed' };
  return { success: true };
}
