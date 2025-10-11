import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Upload, X, File, ExternalLink, Download, User } from 'lucide-react';

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

  async function handleDownload() {
    if (!currentUrl) return;

    try {
      const path = currentUrl.split('/documents/')[1];
      if (path) {
        const { data, error } = await supabase.storage
          .from('documents')
          .download(path);

        if (error) throw error;

        const url = URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = path.split('/').pop() || 'download';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error: any) {
      setError(error.message);
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
        documentType === 'profile_photo' ? (
          <div className="space-y-2">
            <div className="relative group">
              <img
                src={currentUrl}
                alt="Profile"
                className="w-32 h-32 rounded-full object-cover border-4 border-slate-200"
              />
              <button
                type="button"
                onClick={handleDelete}
                className="absolute top-0 right-0 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="relative">
              <input
                type="file"
                accept={accept}
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
                id={`upload-${documentType}-${userId}-replace`}
              />
              <label
                htmlFor={`upload-${documentType}-${userId}-replace`}
                className={`flex items-center justify-center gap-2 px-4 py-2 border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors ${
                  uploading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <Upload className="w-4 h-4 text-slate-600" />
                <span className="text-sm text-slate-600">
                  {uploading ? 'Uploading...' : 'Change Photo'}
                </span>
              </label>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-300 rounded-xl">
            <File className="w-5 h-5 text-slate-600" />
            <button
              type="button"
              onClick={handleDownload}
              className="flex-1 text-sm text-blue-600 hover:underline truncate flex items-center gap-1 text-left"
            >
              Download Document
              <Download className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="p-1 hover:bg-red-100 rounded text-red-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )
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
            } ${
              documentType === 'profile_photo' ? 'w-32 h-32 rounded-full flex-col' : ''
            }`}
          >
            {documentType === 'profile_photo' ? (
              <>
                <User className="w-12 h-12 text-slate-400" />
                <span className="text-xs text-slate-600 text-center">
                  {uploading ? 'Uploading...' : 'Upload Photo'}
                </span>
              </>
            ) : (
              <>
                <Upload className="w-5 h-5 text-slate-600" />
                <span className="text-sm text-slate-600">
                  {uploading ? 'Uploading...' : 'Click to upload'}
                </span>
              </>
            )}
          </label>
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
