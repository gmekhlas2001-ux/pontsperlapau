import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Upload, X, File, ExternalLink } from 'lucide-react';

interface DocumentUploadProps {
  userId: string;
  documentType: 'cv' | 'nid_photo' | 'passport_photo' | 'profile_photo' | 'education_docs' | 'family_parents_tazkira' | 'other';
  currentUrl?: string | null;
  onUploadComplete: (url: string) => void;
  label: string;
  accept?: string;
}

export function DocumentUpload({
  userId,
  documentType,
  currentUrl,
  onUploadComplete,
  label,
  accept = "image/*,.pdf,.doc,.docx"
}: DocumentUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}/${documentType}_${Date.now()}.${fileExt}`;

      const { error: uploadError, data } = await supabase.storage
        .from('documents')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(fileName);

      onUploadComplete(publicUrl);
    } catch (error: any) {
      setError(error.message);
      console.error('Upload error:', error);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    if (!currentUrl || !confirm('Are you sure you want to delete this document?')) return;

    try {
      const path = currentUrl.split('/documents/')[1];
      if (path) {
        await supabase.storage.from('documents').remove([path]);
        onUploadComplete('');
      }
    } catch (error: any) {
      setError(error.message);
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-2">{label}</label>

      {currentUrl ? (
        <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-300 rounded-xl">
          <File className="w-5 h-5 text-slate-600" />
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-sm text-blue-600 hover:underline truncate flex items-center gap-1"
          >
            View Document
            <ExternalLink className="w-3 h-3" />
          </a>
          <button
            type="button"
            onClick={handleDelete}
            className="p-1 hover:bg-red-100 rounded text-red-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            type="file"
            accept={accept}
            onChange={handleFileUpload}
            disabled={uploading}
            className="hidden"
            id={`upload-${documentType}-${userId}`}
          />
          <label
            htmlFor={`upload-${documentType}-${userId}`}
            className={`flex items-center justify-center gap-2 w-full px-4 py-3 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors ${
              uploading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <Upload className="w-5 h-5 text-slate-600" />
            <span className="text-sm text-slate-600">
              {uploading ? 'Uploading...' : 'Click to upload'}
            </span>
          </label>
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
