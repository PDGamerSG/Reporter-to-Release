import { randomUUID } from "node:crypto";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
import type { Ledger, Screenshot } from "../domain/types";
import { DomainError } from "../domain/workflow";

export const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;
const MAX_PER_REPORT = 3;
const extensions = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;
type ImageType = keyof typeof extensions;

export function screenshotsConfigured() {
  return Boolean(
    process.env.SCREENSHOT_BUCKET && process.env.SCREENSHOT_ROLE_ARN,
  );
}

/** Trusts the file's bytes, not the declared type. SVG is never accepted. */
export function imageType(bytes: Uint8Array): ImageType | undefined {
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end));
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return undefined;
}

export function reserveScreenshot(
  ledger: Ledger,
  reportId: string,
  type: ImageType,
  size: number,
): Screenshot {
  const report = ledger.reports[reportId];
  const shots = report.screenshots ?? [];
  if (shots.length >= MAX_PER_REPORT)
    throw new DomainError("This report already has 3 screenshots.", 409);
  const hourAgo = Date.now() - 3600000;
  const recent = (ledger.screenshotUploads ?? []).filter(
    (at) => Date.parse(at) > hourAgo,
  );
  const limit = Number(process.env.SCREENSHOT_HOURLY_LIMIT) || 60;
  if (recent.length >= limit)
    throw new DomainError(
      "Too many screenshots this hour. Your report is saved.",
      429,
    );
  const at = new Date().toISOString();
  const shot = {
    key: `reports/${reportId}/${randomUUID()}.${extensions[type]}`,
    type,
    size,
    at,
  };
  ledger.screenshotUploads = [...recent, at];
  report.screenshots = [...shots, shot];
  return shot;
}

export function releaseScreenshot(
  ledger: Ledger,
  reportId: string,
  key: string,
) {
  const report = ledger.reports[reportId];
  report.screenshots = report.screenshots?.filter((shot) => shot.key !== key);
}

function client() {
  const region = process.env.SCREENSHOT_REGION ?? "ap-southeast-2";
  return new S3Client({
    region,
    credentials: awsCredentialsProvider({
      roleArn: process.env.SCREENSHOT_ROLE_ARN!,
      clientConfig: { region },
    }),
  });
}

export async function putScreenshot(shot: Screenshot, body: Uint8Array) {
  await client().send(
    new PutObjectCommand({
      Bucket: process.env.SCREENSHOT_BUCKET,
      Key: shot.key,
      Body: body,
      ContentType: shot.type,
    }),
  );
}

export async function getScreenshot(shot: Screenshot) {
  const result = await client().send(
    new GetObjectCommand({
      Bucket: process.env.SCREENSHOT_BUCKET,
      Key: shot.key,
    }),
  );
  return result.Body!.transformToByteArray();
}
