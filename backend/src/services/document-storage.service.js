import { createHash, randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
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

export async function storePdf(buffer) {
  const storageKey = `${randomUUID()}.pdf`;
  const filePath = path.join(storageDir, storageKey);

  await writeFile(filePath, buffer, {
    flag: "wx",
    mode: 0o600,
  });

  return {
    storageKey,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

export async function deleteStoredPdf(storageKey) {
  // Accept only generated UUID-based PDF filenames.
  if (!/^[0-9a-f-]{36}\.pdf$/i.test(storageKey)) {
    throw new Error("Invalid storage key");
  }

  const filePath = path.join(storageDir, storageKey);
  await unlink(filePath);
}
