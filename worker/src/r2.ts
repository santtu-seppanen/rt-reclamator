import { base64ToBytes } from "./base64.js";

const SISALTOTYYPIT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  svg: "image/svg+xml",
};

export function paattelSisaltotyyppi(tiedostopaate: string): string {
  return SISALTOTYYPIT[tiedostopaate.toLowerCase()] ?? "application/octet-stream";
}

export async function tallennaKuva(
  bucket: R2Bucket,
  tiedostonimi: string,
  base64Data: string,
): Promise<void> {
  const paate = tiedostonimi.split(".").pop() ?? "";
  await bucket.put(tiedostonimi, base64ToBytes(base64Data), {
    httpMetadata: { contentType: paattelSisaltotyyppi(paate) },
  });
}

export function poistaKuva(bucket: R2Bucket, tiedostonimi: string): Promise<void> {
  return bucket.delete(tiedostonimi);
}

export function haeKuva(bucket: R2Bucket, tiedostonimi: string): Promise<R2ObjectBody | null> {
  return bucket.get(tiedostonimi);
}
