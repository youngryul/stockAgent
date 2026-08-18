import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

export type EncryptedBlob = {
  ciphertext: string;
  nonce: string;
  authTag: string;
};

/**
 * Derive a 32-byte AES key from KIS_CREDENTIALS_KEY.
 * 64-char hex is used as-is; any other string is hashed with SHA-256.
 */
function encryptionKey(): Buffer {
  const raw = (process.env.KIS_CREDENTIALS_KEY || "").trim();
  if (!raw) {
    throw new Error("KIS_CREDENTIALS_KEY가 없습니다. 서버 환경 변수에 암호화 키를 넣으세요.");
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  return createHash("sha256").update(raw).digest();
}

/**
 * Encrypt UTF-8 plaintext with AES-256-GCM.
 * @param plaintext - Secret JSON or text
 */
export function encryptSecret(plaintext: string): EncryptedBlob {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: encrypted.toString("base64"),
    nonce: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

/**
 * Decrypt an AES-256-GCM blob created by encryptSecret.
 * @param blob - Ciphertext, nonce, and auth tag
 */
export function decryptSecret(blob: EncryptedBlob): string {
  try {
    const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(blob.nonce, "base64"));
    decipher.setAuthTag(Buffer.from(blob.authTag, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(blob.ciphertext, "base64")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    throw new Error("저장된 앱키를 열 수 없습니다. 암호화 키가 바뀌었으면 앱키를 다시 입력하세요.");
  }
}
