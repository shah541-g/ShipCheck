import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config.js';

let client = null;
function s3() {
  if (!client) {
    client = new S3Client({
      region: 'us-east-1', endpoint: `https://${config.storage.s3Hostname}`, forcePathStyle: true,
      credentials: { accessKeyId: config.storage.s3AccessKey, secretAccessKey: config.storage.s3SecretKey },
      requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }
  return client;
}

export async function putScreenshot(jobId, n, buffer) {
  const key = `shots/${jobId}/${n}.jpg`;
  await s3().send(new PutObjectCommand({ Bucket: config.storage.s3Bucket, Key: key, Body: buffer, ContentType: 'image/jpeg', ACL: 'public-read' }));
  return `https://${config.storage.s3Hostname}/${config.storage.s3Bucket}/${key}`;
}
