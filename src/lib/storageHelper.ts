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

export interface ApprovalRecordWithSignature {
  approver_name: string;
  approver_esig: string | null;
  approval_date: string;
  sequence: number;
  for_checking?: boolean;
}

/**
 * Fetch approval records with e-signatures using enhanced retry logic.
 * This handles multi-company scenarios and timing issues with signature retrieval.
 *
 * @param requestId - The ID of the request
 * @param requestType - The type of request (e.g., 'Cash Advance', 'Purchase Requisition')
 * @param expectedCount - The number of approval records expected
 * @returns Array of approval records with e-signatures
 */
export async function fetchApprovalRecordsWithRetry(
  requestId: string,
  requestType: string,
  expectedCount: number
): Promise<ApprovalRecordWithSignature[]> {
  let retries = 0;
  const maxRetries = 15; // Increased for multi-company scenarios
  const baseDelay = 800; // Start with 800ms

  console.log(`🔄 Fetching approval records for ${requestType}. Expected: ${expectedCount} approvals`);

  while (retries < maxRetries) {
    try {
      // Fetch approval ledger records
      const { data: allApprovalRecords, error: ledgerError } = await supabase
        .from('approval_ledger')
        .select(`
          approver_name,
          approver_id,
          approval_date,
          sequence,
          for_checking
        `)
        .eq('request_id', requestId)
        .eq('request_type', requestType)
        .eq('action', 'Approved')
        .order('sequence', { ascending: true });

      if (ledgerError) {
        console.error(`❌ Error fetching approval ledger on retry ${retries + 1}:`, ledgerError);

        // Wait and retry instead of throwing immediately
        if (retries < maxRetries - 1) {
          const delay = baseDelay * Math.pow(1.4, retries);
          console.log(`⏳ Waiting ${delay.toFixed(0)}ms before retry ${retries + 2} after error...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          retries++;
          continue;
        } else {
          // Only throw on last retry
          throw ledgerError;
        }
      }

      // Map approval records with e-signatures
      const approvalRecordsWithSigs = await Promise.all(
        (allApprovalRecords || []).map(async (record) => {
          const { data: approverData } = await supabase
            .from('user_profiles')
            .select('e_sig')
            .eq('id', record.approver_id)
            .maybeSingle();

          return {
            approver_name: record.approver_name,
            approver_esig: approverData?.e_sig || null,
            approval_date: record.approval_date,
            sequence: record.sequence,
            for_checking: record.for_checking || false
          };
        })
      );

      console.log(`📊 Retry ${retries + 1}/${maxRetries}: Found ${approvalRecordsWithSigs.length} approval records (expected ${expectedCount})`);

      // Log details of what we found
      if (approvalRecordsWithSigs.length > 0) {
        console.log('Approval records details:', approvalRecordsWithSigs.map((r) => ({
          name: r.approver_name,
          hasEsig: !!r.approver_esig,
          sequence: r.sequence
        })));
      }

      // Check if we have all required approval records AND all have signatures
      const allHaveSignatures = approvalRecordsWithSigs.every((r) => r.approver_esig);

      if (approvalRecordsWithSigs.length >= expectedCount) {
        if (allHaveSignatures) {
          console.log('✅ All expected approval records found with signatures!');
          return approvalRecordsWithSigs;
        } else {
          console.log(`⚠️ Found ${approvalRecordsWithSigs.length} records but some missing signatures. Retrying...`);
          const missingSignatures = approvalRecordsWithSigs.filter((r) => !r.approver_esig);
          console.log('Records missing signatures:', missingSignatures.map((r) => r.approver_name));
        }
      }

      // If we don't have enough records or missing signatures, wait and retry
      if (retries < maxRetries - 1) {
        const delay = baseDelay * Math.pow(1.4, retries); // Slightly slower exponential backoff
        console.log(`⏳ Waiting ${delay.toFixed(0)}ms before retry ${retries + 2}...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        retries++;
      } else {
        // Last retry failed, log warning but return what we have
        console.warn(`⚠️ Could not fetch all approval records with signatures after ${maxRetries} attempts. Expected: ${expectedCount}, Got: ${approvalRecordsWithSigs.length}`);
        console.warn('Returning available records. This may result in incomplete signatures.');
        return approvalRecordsWithSigs;
      }
    } catch (error) {
      console.error(`❌ Unexpected error on retry ${retries + 1}:`, error);

      if (retries < maxRetries - 1) {
        const delay = baseDelay * Math.pow(1.4, retries);
        console.log(`⏳ Waiting ${delay.toFixed(0)}ms before retry ${retries + 2}...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        retries++;
      } else {
        throw error;
      }
    }
  }

  // This should never be reached, but TypeScript needs it
  throw new Error('Failed to fetch approval records after maximum retries');
}
