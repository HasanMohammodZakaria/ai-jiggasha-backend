export interface UploadDocumentParams {
  userId: string;
  documentId: string;
  extension: "pdf" | "docx";
}

export interface DownloadLink {
  url: string;
  expiresAt: Date;
}

// The rest of the app only knows this interface. Moving to R2 or S3 later means
// writing one new implementation and changing one import in documents.service.ts.
export interface DocumentStorage {
  // Returns the storage key to save in documents.storage_key.
  upload(buffer: Buffer, params: UploadDocumentParams): Promise<string>;
  // Never throws: a failed delete is logged and must not break the request.
  remove(storageKey: string): Promise<void>;
  getDownloadUrl(
    storageKey: string,
    expiresInSeconds: number,
  ): Promise<DownloadLink>;
}
