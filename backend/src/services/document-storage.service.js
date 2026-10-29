
import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

const storageDir = path.resolve(
  currentDir,
  "../../storage/uploads",
);

await mkdir(storageDir, {
  recursive: true,
  mode: 0o700,
});

function resolveStoragePath(storageKey) {
  if (
    typeof storageKey !== "string" ||
    !/^[0-9a-f-]{36}\.pdf$/i.test(storageKey)
  ) {
    throw new Error("Invalid storage key");
  }

  return path.join(storageDir, storageKey);
}

export async function storePdf(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("A non-empty PDF buffer is required");
  }

  const storageKey = `${randomUUID()}.pdf`;
  const filePath = resolveStoragePath(storageKey);

  await writeFile(filePath, buffer, {
    flag: "wx",
    mode: 0o600,
  });

  return {
    storageKey,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

export async function readStoredPdf(storageKey) {
  const filePath = resolveStoragePath(storageKey);
  return readFile(filePath);
}

export async function deleteStoredPdf(storageKey) {
  const filePath = resolveStoragePath(storageKey);
  await unlink(filePath);
}
