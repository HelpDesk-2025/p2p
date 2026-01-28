import { supabase } from './supabase';

interface AttachmentUpload {
  file: File;
  fileName: string;
}

interface StoredAttachment {
  path: string;
  name: string;
  type: string;
  size: number;
}

export async function uploadAttachments(
  files: AttachmentUpload[],
  requestType: string,
  userId: string
): Promise<StoredAttachment[]> {
  const uploadedAttachments: StoredAttachment[] = [];

  for (const { file, fileName } of files) {
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `${requestType}/${userId}/${timestamp}_${sanitizedFileName}`;

    const { data, error } = await supabase.storage
      .from('attachments')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error(`Error uploading ${fileName}:`, error);
      throw new Error(`Failed to upload ${fileName}: ${error.message}`);
    }

    uploadedAttachments.push({
      path: data.path,
      name: fileName,
      type: file.type,
      size: file.size
    });
  }

  return uploadedAttachments;
}

export async function downloadAttachment(filePath: string): Promise<Blob> {
  const { data, error } = await supabase.storage
    .from('attachments')
    .download(filePath);

  if (error) {
    console.error(`Error downloading ${filePath}:`, error);
    throw new Error(`Failed to download file: ${error.message}`);
  }

  return data;
}

export async function deleteAttachments(filePaths: string[]): Promise<void> {
  const { error } = await supabase.storage
    .from('attachments')
    .remove(filePaths);

  if (error) {
    console.error('Error deleting attachments:', error);
    throw new Error(`Failed to delete attachments: ${error.message}`);
  }
}

export function getAttachmentUrl(filePath: string): string {
  const { data } = supabase.storage
    .from('attachments')
    .getPublicUrl(filePath);

  return data.publicUrl;
}

export async function createSignedUrl(filePath: string, expiresIn: number = 3600): Promise<string> {
  const { data, error } = await supabase.storage
    .from('attachments')
    .createSignedUrl(filePath, expiresIn);

  if (error) {
    console.error(`Error creating signed URL for ${filePath}:`, error);
    throw new Error(`Failed to create signed URL: ${error.message}`);
  }

  return data.signedUrl;
}

export async function convertFileToBlob(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(new Blob([reader.result as ArrayBuffer], { type: file.type }));
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export async function uploadLargeFile(
  filePath: string,
  fileData: ArrayBuffer | Blob,
  contentType: string = 'application/pdf'
): Promise<{ path: string }> {
  try {
    // Get the current session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No active session');
    }

    // Convert ArrayBuffer to Blob if needed
    const blob = fileData instanceof Blob ? fileData : new Blob([fileData], { type: contentType });

    // Use edge function for upload to avoid header size issues
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-large-file`;

    const formData = new FormData();
    formData.append('file', blob);
    formData.append('filePath', filePath);
    formData.append('contentType', contentType);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(errorData.error || `Upload failed: ${response.status}`);
    }

    const result = await response.json();
    return { path: result.path };
  } catch (error) {
    console.error('Error uploading large file:', error);
    throw error;
  }
}
