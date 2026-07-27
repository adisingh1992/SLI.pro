import type { Document } from "@shared/schema";
import * as blob from "./blob-storage";

/**
 * Single accessor for a document's bytes, wherever they live.
 *
 * Documents uploaded before the Azure migration hold base64 inline in
 * `fileData`. New uploads store bytes in Blob and set `blobKey`. Every consumer
 * (claude.ts, sli.ts, freshness-report.ts, linkedin-optimization.ts, ...) should
 * call this instead of reading `document.fileData` directly, so the storage
 * location stays an implementation detail.
 *
 * Returns base64 to match what the existing callers already expect.
 */
export async function getDocumentBase64(
  document: Pick<Document, "fileData" | "blobKey" | "fileName">,
): Promise<string> {
  if (document.blobKey) {
    return blob.downloadBase64(blob.CONTAINERS.documents, document.blobKey);
  }
  if (document.fileData) {
    return document.fileData; // legacy inline row
  }
  throw new Error(
    `Document '${document.fileName}' has neither blobKey nor inline fileData`,
  );
}

/** True when the document has retrievable content in either location. */
export function hasContent(
  document: Pick<Document, "fileData" | "blobKey">,
): boolean {
  return Boolean(document.blobKey || document.fileData);
}
