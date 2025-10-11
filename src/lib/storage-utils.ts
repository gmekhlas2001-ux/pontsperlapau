import { supabase } from './supabase';

export async function getSignedUrl(url: string | null): Promise<string | null> {
  if (!url) return null;

  try {
    let path: string | null = null;

    if (url.includes('/object/sign/documents/')) {
      return url;
    }

    if (url.includes('/storage/v1/object/public/documents/')) {
      path = url.split('/storage/v1/object/public/documents/')[1];
    } else if (url.includes('/documents/')) {
      path = url.split('/documents/')[1];
    }

    if (!path) return null;

    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(path, 315360000);

    if (error) {
      console.error('Error creating signed URL:', error);
      return null;
    }

    return data.signedUrl;
  } catch (error) {
    console.error('Error in getSignedUrl:', error);
    return null;
  }
}

export function extractPathFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);

    const signedMatch = urlObj.pathname.match(/\/object\/sign\/documents\/(.+)/);
    if (signedMatch) {
      return signedMatch[1].split('?')[0];
    }

    const publicMatch = urlObj.pathname.match(/\/object\/public\/documents\/(.+)/);
    if (publicMatch) {
      return publicMatch[1];
    }

    if (url.includes('/documents/')) {
      const parts = url.split('/documents/');
      return parts[1]?.split('?')[0] || null;
    }

    return null;
  } catch (error) {
    console.error('Error extracting path from URL:', error);
    return null;
  }
}
