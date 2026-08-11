import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { documents as wingDocuments } from "@shared/wing-schema";
import * as store from "./session-store";
import { studentIdForWingUser } from "./bootstrap";
import * as blob from "../blob-storage";

/**
 * Documents, backed by the Wing schema.
 *
 * Binary content lives in Azure Blob and the row holds a URI — inline base64
 * does not carry forward (spec §3, §12). Extracted text is retained on the row
 * so Wing can reference uploads instead of re-asking (feature list A2).
 *
 * Exposes the legacy method surface so consumers swap import rather than being
 * rewritten. Two field mappings are worth knowing:
 *   legacy `type`            -> doc_type
 *   legacy `analysisContent` -> analysis->>'text'  (jsonb, so richer analysis
 *                               can be stored later without a migration)
 * Legacy rows carried both `name` and `fileName`; wing keeps a single `name`,
 * which holds the original file name.
 */

export type LegacyDocType =
  | "resume" | "linkedin" | "essay" | "assessment" | "certificate" | "other";

/** Legacy-shaped view over a wing document row. */
export type DocumentView = {
  id: number;
  /** Owning coaching entity — use this for authorisation. */
  studentId: number;
  /** Legacy user id when known; 0 when not resolved. Do NOT authorise on this. */
  userId: number;
  name: string;
  fileName: string;
  type: LegacyDocType;
  blobUri: string;
  mimeType: string;
  sizeBytes: number;
  extractedText: string | null;
  analysisContent: string | null;
  uploadedAt: Date;
  /** Always null: content is in Blob, never inline. Kept so legacy
   *  consumers that check `fileData` continue to compile and behave. */
  fileData: null;
};

function normaliseType(raw: string): LegacyDocType {
  const t = (raw || "other").toLowerCase();
  return (["resume", "linkedin", "essay", "assessment", "certificate", "other"] as const)
    .includes(t as LegacyDocType)
    ? (t as LegacyDocType)
    : "other";
}

function toView(row: any, userId: number): DocumentView {
  const analysis = row.analysis as { text?: string } | null;
  return {
    id: row.id,
    studentId: row.studentId,
    userId,
    name: row.name,
    fileName: row.name,
    type: row.docType,
    blobUri: row.blobUri,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    extractedText: row.extractedText ?? null,
    analysisContent: analysis?.text ?? null,
    uploadedAt: row.uploadedAt,
    fileData: null,
  };
}

/**
 * `userId` is a WING user id after the identity cutover — the student is
 * resolved directly rather than through the legacy user record.
 */
async function studentFor(userId: number): Promise<number> {
  return studentIdForWingUser(userId);
}

/**
 * The caller's student id — the correct basis for authorising document access.
 * Comparing student ids forward is robust; reverse-resolving a legacy user id
 * from a student depends on the transitional links table and fails closed.
 */
export const studentIdForUser = studentFor;

/* ── Reads ─────────────────────────────────────────────────────────────── */

export async function getDocuments(userId: number): Promise<DocumentView[]> {
  const studentId = await studentFor(userId);
  const rows = await db
    .select()
    .from(wingDocuments)
    .where(eq(wingDocuments.studentId, studentId))
    .orderBy(desc(wingDocuments.uploadedAt));
  return rows.map((r) => toView(r, userId));
}

export async function getDocument(id: number): Promise<DocumentView | undefined> {
  const [row] = await db
    .select()
    .from(wingDocuments)
    .where(eq(wingDocuments.id, id))
    .limit(1);
  if (!row) return undefined;

  // userId is left unresolved (0); callers authorise on studentId.
  return toView(row, 0);
}

/** Base64 content, fetched from Blob. */
export async function getDocumentBase64(doc: {
  blobUri: string;
  name?: string;
}): Promise<string> {
  return blob.downloadBase64(blob.CONTAINERS.documents, doc.blobUri);
}

/* ── Writes ────────────────────────────────────────────────────────────── */

export async function createDocument(data: {
  userId: number;
  name: string;
  fileName?: string;
  type: string;
  fileData?: string | null; // base64 from the client
  mimeType?: string;
  extractedText?: string | null;
}): Promise<DocumentView> {
  if (!blob.isConfigured()) {
    throw new Error(
      "Blob storage is not configured (AZURE_STORAGE_ACCOUNT). Document " +
        "content cannot be stored inline — see spec §3.",
    );
  }
  if (!data.fileData) {
    throw new Error("Document content is required");
  }

  const studentId = await studentFor(data.userId);
  const fileName = data.fileName || data.name;
  const buffer = Buffer.from(data.fileData, "base64");

  /*
   * ── DECODE, THEN CHECK ───────────────────────────────────────────────────
   * `Buffer.from(x, "base64")` never throws. Given a data-URI prefix, a
   * truncated payload, or anything else that is not base64, it silently
   * returns an EMPTY buffer — so the `!data.fileData` guard above passes, the
   * row is written with `size_bytes = 0`, and a blob URI is stored pointing at
   * nothing.
   *
   * That is how a student ended up with a LinkedIn export of 0 KB. Nothing
   * failed, nothing logged, and the record screen listed the document as
   * present. The consequence is not cosmetic: A2's premise is that Wing reads
   * the LinkedIn export instead of re-asking, so a student with a phantom
   * document gets a noticeably more generic session and no one can tell why.
   *
   * MIN_BYTES rather than `> 0` because a PDF cannot be a handful of bytes —
   * the header alone is longer. A tiny decode means malformed input, not a
   * very small file.
   */
  const MIN_BYTES = 100;
  if (buffer.length < MIN_BYTES) {
    throw new Error(
      `"${fileName}" decoded to ${buffer.length} byte(s), which is not a readable file. ` +
        `The upload was probably truncated, or the payload is not base64 — check that any ` +
        `"data:...;base64," prefix has been stripped before sending.`,
    );
  }

  const blobUri = await blob.uploadBase64(blob.CONTAINERS.documents, data.fileData, {
    fileName,
    contentType: data.mimeType || "application/pdf",
    prefix: `student-${studentId}`,
  });

  const [row] = await db
    .insert(wingDocuments)
    .values({
      studentId,
      name: fileName,
      docType: normaliseType(data.type) as any,
      blobUri,
      mimeType: data.mimeType || "application/pdf",
      sizeBytes: buffer.length,
      extractedText: data.extractedText ?? null,
    })
    .returning();

  return toView(row, data.userId);
}

export async function updateDocument(
  id: number,
  data: { analysisContent?: string | null; extractedText?: string | null },
) {
  const patch: Record<string, unknown> = {};
  if (data.analysisContent !== undefined) {
    patch.analysis = data.analysisContent ? { text: data.analysisContent } : null;
  }
  if (data.extractedText !== undefined) patch.extractedText = data.extractedText;
  if (!Object.keys(patch).length) return getDocument(id);

  const [row] = await db
    .update(wingDocuments)
    .set(patch)
    .where(eq(wingDocuments.id, id))
    .returning();
  if (!row) return undefined;

  return toView(row, 0);
}

export async function deleteDocument(id: number): Promise<void> {
  const [row] = await db
    .select({ blobUri: wingDocuments.blobUri })
    .from(wingDocuments)
    .where(eq(wingDocuments.id, id))
    .limit(1);

  if (row?.blobUri && blob.isConfigured()) {
    try {
      await blob.deleteBlob(blob.CONTAINERS.documents, row.blobUri);
    } catch (err) {
      console.error(`[wing:documents] failed to delete blob ${row.blobUri}:`, err);
    }
  }

  await db.delete(wingDocuments).where(eq(wingDocuments.id, id));
}
