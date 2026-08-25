// Deliberately NOT marked `server-only`: scripts/ingest.ts imports this too, and
// that package throws outside a react-server condition. Nothing here is safe to
// call from a client component, but nothing here can leak either — Next only
// inlines NEXT_PUBLIC_* into the browser bundle, so the credentials read below
// are simply undefined there and the client construction throws.
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

/// Object storage for puzzle audio. S3-compatible so it runs against Cloudflare
/// R2 in every environment, but nothing here is R2-specific.
///
/// Why R2 and not Vercel Blob: stage audio is served by PROXYING a byte range
/// through a route handler, because the range has to be authorized against
/// RunRound.stageReached before any bytes move. That makes every play two hops —
/// store to function, function to client. R2 charges nothing for the first hop.

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

type StorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

function readConfig(): StorageConfig {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  const missing = [
    ["S3_ENDPOINT", endpoint],
    ["S3_BUCKET", bucket],
    ["S3_ACCESS_KEY_ID", accessKeyId],
    ["S3_SECRET_ACCESS_KEY", secretAccessKey],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`object storage is not configured: missing ${missing.join(", ")}`);
  }

  return {
    endpoint: endpoint!,
    region: process.env.S3_REGION ?? "auto",
    bucket: bucket!,
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
  };
}

/// Lazily constructed and memoised in a plain module-level `let`.
///
/// Lazy because Next.js evaluates top-level module code during `next build`, so
/// constructing this at import time would fail the build on any deploy where the
/// storage vars aren't set yet — including the very first one.
///
/// NOT a Proxy wrapper. A Proxy intercepts the property probing that libraries
/// do to feature-detect a client, and the failures are silent hangs.
let cached: { client: S3Client; config: StorageConfig } | null = null;

function storage(): { client: S3Client; config: StorageConfig } {
  if (cached) return cached;

  const config = readConfig();
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    // Since v3.729 the SDK attaches a CRC32 checksum to every request and
    // validates one on every response unless told otherwise. R2 rejects the
    // unsolicited request checksums outright. "WHEN_REQUIRED" keeps the explicit
    // ChecksumSHA256 that putObject sends while dropping the automatic ones.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  cached = { client, config };
  return cached;
}

/// True when every required var is present. For health checks and scripts that
/// want to degrade rather than throw.
export function isStorageConfigured(): boolean {
  try {
    readConfig();
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/// Fetch `[0, endExclusive)` of an object.
///
/// This is the whole reveal mechanism: stage N of a puzzle is the first
/// `PuzzleAsset.stageByteOffsets[N - 1]` bytes of its single clip. Only the
/// requested bytes leave the bucket, so serving stage 1 moves ~6 KB and not the
/// whole ~480 KB file.
///
/// Buffered rather than streamed on purpose — the ceiling is one 30s clip at
/// 128kbps mono, so there is nothing to gain from a stream and a known length
/// lets the caller set an exact Content-Length.
export async function readPrefix(key: string, endExclusive: number): Promise<Uint8Array> {
  if (!Number.isInteger(endExclusive) || endExclusive <= 0) {
    throw new Error(`readPrefix needs a positive integer length, got ${endExclusive}`);
  }

  const { client, config } = storage();

  const result = await client.send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
      // HTTP ranges are inclusive at both ends.
      Range: `bytes=0-${endExclusive - 1}`,
    }),
  );

  if (!result.Body) throw new Error(`no body returned for ${key}`);

  const bytes = await result.Body.transformToByteArray();

  // A short read means the stored object disagrees with the offsets in the
  // database — usually a clip re-cut without re-running ingest. Serving it would
  // hand the player less audio than the stage they paid an attempt for.
  if (bytes.length !== endExclusive) {
    throw new Error(
      `${key}: asked for ${endExclusive} bytes, got ${bytes.length} — ` +
        `stageByteOffsets is stale relative to the stored object`,
    );
  }

  return bytes;
}

/// Fetch the whole object. Used by the reslice path: recomputing
/// stageByteOffsets for a new ladder needs every frame of the stored clip.
export async function readObject(key: string): Promise<Buffer> {
  const { client, config } = storage();

  const result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));

  if (!result.Body) throw new Error(`no body returned for ${key}`);

  return Buffer.from(await result.Body.transformToByteArray());
}

/// Size of a stored object, or null if it isn't there. Used by the ingest
/// pipeline to skip re-uploading content-addressed objects that already exist.
export async function objectSize(key: string): Promise<number | null> {
  const { client, config } = storage();

  try {
    const result = await client.send(
      new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
    );
    return result.ContentLength ?? null;
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (name === "NotFound" || name === "NoSuchKey") return null;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type PutOptions = {
  contentType?: string;
  /// Hex sha256 of the body. Sent as an integrity check so a corrupted upload is
  /// rejected by the service rather than discovered by a player.
  sha256Hex?: string;
};

export async function putObject(
  key: string,
  body: Uint8Array,
  options: PutOptions = {},
): Promise<void> {
  const { client, config } = storage();

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: options.contentType,
      ChecksumSHA256: options.sha256Hex
        ? Buffer.from(options.sha256Hex, "hex").toString("base64")
        : undefined,
    }),
  );
}

export async function deleteObject(key: string): Promise<void> {
  const { client, config } = storage();
  await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
}

export type StoredObject = { key: string; size: number; lastModified?: Date };

/// Every object under `prefix` (all of them when omitted), following the
/// continuation token to the end. A single ListObjectsV2 caps at 1000 keys, so a
/// non-paginating version silently under-reports once a bucket outgrows that —
/// which is exactly the case where an inventory matters.
export async function listObjects(prefix?: string): Promise<StoredObject[]> {
  const { client, config } = storage();
  const out: StoredObject[] = [];
  let token: string | undefined;

  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const o of page.Contents ?? []) {
      if (o.Key) out.push({ key: o.Key, size: o.Size ?? 0, lastModified: o.LastModified });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  return out;
}
