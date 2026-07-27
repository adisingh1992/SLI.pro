import { BlobServiceClient, ContainerClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import { randomUUID } from "crypto";

/**
 * Azure Blob Storage for user documents and media.
 *
 * The Replit MVP stored PDFs and screenshots as base64 text inline in Postgres.
 * That does not carry forward: binary data belongs in Blob, with the database
 * holding only a key.
 *
 * Auth uses DefaultAzureCredential — the Container App's managed identity in
 * Azure, your `az login` session locally. No account keys in config.
 *
 * If AZURE_STORAGE_ACCOUNT is not set, isConfigured() returns false and callers
 * fall back to the legacy inline-base64 path, so local dev and the existing
 * rows keep working during the transition.
 */

export const CONTAINERS = {
  documents: "documents",
  checkInMedia: "check-in-media",
  voice: "voice",
  artifacts: "artifacts",
} as const;

export type ContainerName = (typeof CONTAINERS)[keyof typeof CONTAINERS];

let serviceClient: BlobServiceClient | null = null;

export function isConfigured(): boolean {
  return Boolean(process.env.AZURE_STORAGE_ACCOUNT);
}

function getServiceClient(): BlobServiceClient {
  if (!isConfigured()) {
    throw new Error(
      "AZURE_STORAGE_ACCOUNT is not set — Blob storage is not configured",
    );
  }
  if (!serviceClient) {
    const account = process.env.AZURE_STORAGE_ACCOUNT as string;
    serviceClient = new BlobServiceClient(
      `https://${account}.blob.core.windows.net`,
      new DefaultAzureCredential({
        managedIdentityClientId: process.env.AZURE_MANAGED_IDENTITY_CLIENT_ID,
      }),
    );
  }
  return serviceClient;
}

// Containers are created by the environment setup; we only attempt creation
// once per process as a safety net for fresh environments, and never block a
// request on it if the identity lacks container-management rights.
const ensured = new Set<string>();

async function getContainer(name: ContainerName): Promise<ContainerClient> {
  const container = getServiceClient().getContainerClient(name);

  if (!ensured.has(name)) {
    ensured.add(name);
    try {
      await container.createIfNotExists();
    } catch (err: any) {
      console.warn(
        `[blob] could not ensure container '${name}' exists (${err?.code ?? err?.message}); ` +
          `assuming it was created during environment setup`,
      );
    }
  }

  return container;
}

/** Uploads a buffer and returns the blob key to persist in the database. */
export async function uploadBuffer(
  container: ContainerName,
  buffer: Buffer,
  opts: { fileName: string; contentType?: string; prefix?: string },
): Promise<string> {
  const client = await getContainer(container);
  const safeName = opts.fileName.replace(/[^\w.\-]/g, "_");
  const key = `${opts.prefix ? `${opts.prefix}/` : ""}${randomUUID()}-${safeName}`;

  await client.getBlockBlobClient(key).uploadData(buffer, {
    blobHTTPHeaders: opts.contentType
      ? { blobContentType: opts.contentType }
      : undefined,
  });

  return key;
}

/** Uploads base64 content (what the current client sends) and returns the key. */
export async function uploadBase64(
  container: ContainerName,
  base64: string,
  opts: { fileName: string; contentType?: string; prefix?: string },
): Promise<string> {
  return uploadBuffer(container, Buffer.from(base64, "base64"), opts);
}

export async function downloadBuffer(
  container: ContainerName,
  key: string,
): Promise<Buffer> {
  const client = await getContainer(container);
  return client.getBlockBlobClient(key).downloadToBuffer();
}

/** Downloads and returns base64 — matches the shape existing callers expect. */
export async function downloadBase64(
  container: ContainerName,
  key: string,
): Promise<string> {
  return (await downloadBuffer(container, key)).toString("base64");
}

export async function deleteBlob(
  container: ContainerName,
  key: string,
): Promise<void> {
  const client = await getContainer(container);
  await client.getBlockBlobClient(key).deleteIfExists();
}
