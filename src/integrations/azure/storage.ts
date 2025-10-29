import { BlobServiceClient } from "@azure/storage-blob";

// Azure Storage configuration from environment variables
// Use SAS token instead of connection string for browser compatibility
const AZURE_STORAGE_ACCOUNT_NAME = import.meta.env.VITE_AZURE_STORAGE_ACCOUNT_NAME as string;
const AZURE_STORAGE_SAS_TOKEN = import.meta.env.VITE_AZURE_STORAGE_SAS_TOKEN as string;
const AZURE_STORAGE_CONTAINER_NAME = import.meta.env.VITE_AZURE_STORAGE_CONTAINER_NAME || "learn-admin-files";

// Initialize Azure Blob Service Client
let blobServiceClient: BlobServiceClient | null = null;

function getBlobServiceClient(): BlobServiceClient {
  if (!blobServiceClient) {
    if (!AZURE_STORAGE_ACCOUNT_NAME || !AZURE_STORAGE_SAS_TOKEN) {
      const missing = [];
      if (!AZURE_STORAGE_ACCOUNT_NAME) missing.push('VITE_AZURE_STORAGE_ACCOUNT_NAME');
      if (!AZURE_STORAGE_SAS_TOKEN) missing.push('VITE_AZURE_STORAGE_SAS_TOKEN');
      throw new Error(`Azure Storage configuration missing: ${missing.join(', ')}. Please check your .env file.`);
    }
    const accountUrl = `https://${AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net`;
    blobServiceClient = new BlobServiceClient(`${accountUrl}?${AZURE_STORAGE_SAS_TOKEN}`);
  }
  return blobServiceClient;
}

/**
 * Upload a file to Azure Blob Storage
 * @param file - The file to upload
 * @param path - The path where the file should be stored (including filename)
 * @returns The URL of the uploaded file
 */
export async function uploadToAzureBlob(
  file: File,
  path: string
): Promise<string> {
  try {
    console.log('Azure Storage Config:', {
      accountName: AZURE_STORAGE_ACCOUNT_NAME,
      containerName: AZURE_STORAGE_CONTAINER_NAME,
      fileSize: file.size,
      fileName: file.name,
      path: path
    });

    const blobServiceClient = getBlobServiceClient();
    const containerClient = blobServiceClient.getContainerClient(AZURE_STORAGE_CONTAINER_NAME);
    
    // Ensure container exists
    try {
      const exists = await containerClient.exists();
      console.log('Container exists:', exists);
      
      if (!exists) {
        throw new Error(
          'Container does not exist. Please create it manually in Azure Portal or ensure your SAS token has "c" (create) permission. ' +
          'Container name: ' + AZURE_STORAGE_CONTAINER_NAME
        );
      }
    } catch (containerError) {
      console.error('Error checking container:', containerError);
      if (containerError instanceof Error && containerError.message.includes('does not exist')) {
        throw new Error(
          'Container does not exist. Please create it manually in Azure Portal or ensure your SAS token has "c" (create) permission. ' +
          'Container name: ' + AZURE_STORAGE_CONTAINER_NAME
        );
      }
      throw containerError;
    }

    const blockBlobClient = containerClient.getBlockBlobClient(path);
    
    // Convert File to ArrayBuffer for Azure
    const arrayBuffer = await file.arrayBuffer();
    console.log('File converted to ArrayBuffer, size:', arrayBuffer.byteLength);
    
    // Upload the file with explicit headers
    console.log('Starting upload to Azure...');
    const uploadResponse = await blockBlobClient.upload(arrayBuffer, file.size, {
      blobHTTPHeaders: {
        blobContentType: file.type || 'application/octet-stream',
      },
      metadata: {
        fileName: file.name,
        uploadedAt: new Date().toISOString(),
      }
    });
    console.log('Upload successful, ETag:', uploadResponse.etag);

    // Return the URL of the uploaded file
    const url = blockBlobClient.url;
    console.log('File uploaded successfully, URL:', url);
    return url;
  } catch (error) {
    console.error('Error uploading to Azure Blob Storage:', error);
    
    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes('CORS')) {
        throw new Error('CORS error: Please enable CORS in your Azure Storage Account settings. See README for details.');
      }
      if (error.message.includes('404')) {
        throw new Error('Container not found. Please ensure the SAS token has permission to create containers.');
      }
      if (error.message.includes('403')) {
        throw new Error('Permission denied. Please check your SAS token permissions (needs Write and Create).');
      }
      throw error;
    }
    throw new Error(`Failed to upload file: ${error}`);
  }
}

/**
 * Delete a file from Azure Blob Storage
 * @param path - The path of the file to delete
 */
export async function deleteFromAzureBlob(path: string): Promise<void> {
  try {
    const blobServiceClient = getBlobServiceClient();
    const containerClient = blobServiceClient.getContainerClient(AZURE_STORAGE_CONTAINER_NAME);
    const blockBlobClient = containerClient.getBlockBlobClient(path);
    
    await blockBlobClient.delete();
  } catch (error) {
    console.error('Error deleting from Azure Blob Storage:', error);
    throw new Error(`Failed to delete file from Azure Blob Storage: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get a download URL for a blob (returns the blob URL directly)
 * @param path - The path of the file
 * @returns The URL to access the file
 */
export function getBlobUrl(path: string): string {
  const blobServiceClient = getBlobServiceClient();
  const containerClient = blobServiceClient.getContainerClient(AZURE_STORAGE_CONTAINER_NAME);
  const blockBlobClient = containerClient.getBlockBlobClient(path);
  
  return blockBlobClient.url;
}
