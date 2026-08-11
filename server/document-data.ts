import * as blob from "./blob-storage";

/**
 * Single accessor for a document's bytes, wherever they live.
 *
 * Wing documents keep content in Azure Blob and carry `blobUri`. A small
 * number of pre-migration rows may still hold inline base64 (`fileData`) or
 * the interim `blobKey`; all three are handled so callers never care.
 *
 * Consumers (document-analysis.ts, sli.ts, freshness-report.ts, ...) should call this
 * rather than reading a content field directly.
 */

export type DocumentLike = {
  fileName?: string | null;
  name?: string | null;
  /** Wing: Blob object key. */
  blobUri?: string | null;
  /** Interim column used before the wing cutover. */
  blobKey?: string | null;
  /** Legacy inline base64. */
  fileData?: string | null;
};

/** Returns base64 — the shape existing callers expect. */
export async function getDocumentBase64(document: DocumentLike): Promise<string> {
  const key = document.blobUri || document.blobKey;
  if (key) {
    return blob.downloadBase64(blob.CONTAINERS.documents, key);
  }
  if (document.fileData) {
    return document.fileData; // legacy inline row
  }
  throw new Error(
    `Document '${document.fileName ?? document.name ?? "unknown"}' has no retrievable content`,
  );
}

/** True when the document has content in any supported location. */
export function hasContent(document: DocumentLike): boolean {
  return Boolean(document.blobUri || document.blobKey || document.fileData);
}
