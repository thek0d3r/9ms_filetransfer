import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

export const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
});

const signingS3 = new S3Client({
  endpoint: env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
});

export async function createMultipart(objectKey: string, mimeType: string) {
  const result = await s3.send(new CreateMultipartUploadCommand({
    Bucket: env.S3_BUCKET,
    Key: objectKey,
    ContentType: mimeType,
    ...(env.S3_SERVER_SIDE_ENCRYPTION === "AES256" ? { ServerSideEncryption: "AES256" as const } : {}),
  }));
  if (!result.UploadId) throw new Error("Object storage did not return an upload id");
  return result.UploadId;
}

export async function signPart(objectKey: string, uploadId: string, partNumber: number) {
  return getSignedUrl(
    signingS3,
    new UploadPartCommand({ Bucket: env.S3_BUCKET, Key: objectKey, UploadId: uploadId, PartNumber: partNumber }),
    { expiresIn: 15 * 60 },
  );
}

export async function completeMultipart(objectKey: string, uploadId: string, parts: { partNumber: number; etag: string }[]) {
  await s3.send(new CompleteMultipartUploadCommand({
    Bucket: env.S3_BUCKET,
    Key: objectKey,
    UploadId: uploadId,
    MultipartUpload: { Parts: parts.map((part) => ({ ETag: part.etag, PartNumber: part.partNumber })) },
  }));
}

export async function abortMultipart(objectKey: string, uploadId: string) {
  await s3.send(new AbortMultipartUploadCommand({ Bucket: env.S3_BUCKET, Key: objectKey, UploadId: uploadId }));
}

export async function listParts(objectKey: string, uploadId: string) {
  const parts: { partNumber: number; etag: string; size: number }[] = [];
  let marker: string | undefined;
  do {
    const result = await s3.send(new ListPartsCommand({
      Bucket: env.S3_BUCKET,
      Key: objectKey,
      UploadId: uploadId,
      PartNumberMarker: marker,
    }));
    for (const part of result.Parts ?? []) {
      if (part.PartNumber && part.ETag) parts.push({ partNumber: part.PartNumber, etag: part.ETag, size: part.Size ?? 0 });
    }
    marker = result.IsTruncated ? result.NextPartNumberMarker : undefined;
  } while (marker);
  return parts;
}

export async function objectSize(objectKey: string) {
  const result = await s3.send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: objectKey }));
  return result.ContentLength ?? -1;
}

export async function signedDownload(objectKey: string, filename: string) {
  return getSignedUrl(
    signingS3,
    new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: objectKey, ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` }),
    { expiresIn: 5 * 60 },
  );
}

export function getObject(objectKey: string) {
  return s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: objectKey }));
}

export async function deleteObjects(keys: string[]) {
  if (!keys.length) return;
  for (let index = 0; index < keys.length; index += 1000) {
    await s3.send(new DeleteObjectsCommand({
      Bucket: env.S3_BUCKET,
      Delete: { Objects: keys.slice(index, index + 1000).map((Key) => ({ Key })), Quiet: true },
    }));
  }
}
