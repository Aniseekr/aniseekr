// AES-256-GCM encryption for backup envelopes.
//
// Why GCM:
//   - Authenticated: the cipher carries a tag that detects any tampering of
//     the ciphertext, IV, or AAD. A wrong key or a single bit-flip → throws,
//     instead of returning garbage.
//   - 96-bit IV is standard and small; we generate fresh randomness per
//     encryption so the same plaintext never produces the same ciphertext.
//
// Key management:
//   - 32 bytes (AES-256). Generated once per device and stored in iOS
//     Keychain / Android Keystore via expo-secure-store. Never leaves the
//     device by accident — but it ALSO means a backup made on device A
//     cannot be restored on device B unless the user explicitly migrates
//     the key (we'll surface that path in the UI as a future improvement).
//   - The wrapper format is intentionally JSON so it can be inspected,
//     versioned, and uploaded over the cloud-storage adapter as-is.

import { gcm } from '@noble/ciphers/aes.js';
import { randomBytes } from '@noble/ciphers/utils.js';

import {
  parseBackupEnvelope,
  serializeBackupEnvelope,
  type BackupEnvelopeV1,
} from './schema';

export const ENCRYPTED_ENVELOPE_VERSION = 1 as const;
const KEY_LENGTH_BYTES = 32; // AES-256
const IV_LENGTH_BYTES = 12; // GCM standard
const AAD = new TextEncoder().encode('aniseekr-backup-v1');
const SECURE_KEY_NAME = 'aniseekr.cloud.backup.key.v1';

export interface SecureStorageLike {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export interface EncryptedEnvelopeJson {
  encrypted: true;
  v: typeof ENCRYPTED_ENVELOPE_VERSION;
  iv: string;
  ciphertext: string;
}

export function generateBackupKey(): Uint8Array {
  return randomBytes(KEY_LENGTH_BYTES);
}

export function encodeBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let bin = '';
  for (const byte of bytes) bin += String.fromCharCode(byte);
  // btoa is available in Hermes (RN engine) and Node 16+.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as any).btoa(bin);
}

export function decodeBase64(input: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(input, 'base64'));
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bin = (globalThis as any).atob(input);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function isEncryptedPayload(input: string): boolean {
  try {
    const parsed = JSON.parse(input) as unknown;
    if (!parsed || typeof parsed !== 'object') return false;
    const obj = parsed as Record<string, unknown>;
    return (
      obj.encrypted === true &&
      typeof obj.iv === 'string' &&
      typeof obj.ciphertext === 'string'
    );
  } catch {
    return false;
  }
}

export class BackupEncryption {
  encrypt(env: BackupEnvelopeV1, key: Uint8Array): string {
    if (key.length !== KEY_LENGTH_BYTES) {
      throw new Error(`Backup key must be ${KEY_LENGTH_BYTES} bytes (got ${key.length})`);
    }
    const iv = randomBytes(IV_LENGTH_BYTES);
    const plaintext = new TextEncoder().encode(serializeBackupEnvelope(env));
    const cipher = gcm(key, iv, AAD);
    const ct = cipher.encrypt(plaintext);
    const wrapper: EncryptedEnvelopeJson = {
      encrypted: true,
      v: ENCRYPTED_ENVELOPE_VERSION,
      iv: encodeBase64(iv),
      ciphertext: encodeBase64(ct),
    };
    return JSON.stringify(wrapper);
  }

  decrypt(input: string, key: Uint8Array): BackupEnvelopeV1 {
    if (!isEncryptedPayload(input)) {
      throw new Error('Payload is not an encrypted backup envelope');
    }
    if (key.length !== KEY_LENGTH_BYTES) {
      throw new Error(`Backup key must be ${KEY_LENGTH_BYTES} bytes (got ${key.length})`);
    }
    const parsed = JSON.parse(input) as EncryptedEnvelopeJson;
    if (parsed.v !== ENCRYPTED_ENVELOPE_VERSION) {
      throw new Error(`Unsupported encrypted envelope version: ${parsed.v}`);
    }
    const iv = decodeBase64(parsed.iv);
    const ct = decodeBase64(parsed.ciphertext);
    const cipher = gcm(key, iv, AAD);
    const pt = cipher.decrypt(ct); // throws on tag mismatch
    const json = new TextDecoder().decode(pt);
    return parseBackupEnvelope(json);
  }
}

export interface BackupKeyStoreOptions {
  storage: SecureStorageLike;
  storageKey?: string;
  /** Override the random source (used by tests). */
  generate?: () => Uint8Array;
}

export class BackupKeyStore {
  private readonly storage: SecureStorageLike;
  private readonly key: string;
  private readonly generate: () => Uint8Array;

  constructor(opts: BackupKeyStoreOptions) {
    this.storage = opts.storage;
    this.key = opts.storageKey ?? SECURE_KEY_NAME;
    this.generate = opts.generate ?? generateBackupKey;
  }

  async getKey(): Promise<Uint8Array | null> {
    const raw = await this.storage.getItemAsync(this.key);
    if (!raw) return null;
    try {
      return decodeBase64(raw);
    } catch {
      return null;
    }
  }

  async ensureKey(): Promise<Uint8Array> {
    const existing = await this.getKey();
    if (existing && existing.length === KEY_LENGTH_BYTES) return existing;
    const fresh = this.generate();
    await this.storage.setItemAsync(this.key, encodeBase64(fresh));
    return fresh;
  }

  async setKey(bytes: Uint8Array): Promise<void> {
    if (bytes.length !== KEY_LENGTH_BYTES) {
      throw new Error(`Backup key must be ${KEY_LENGTH_BYTES} bytes (got ${bytes.length})`);
    }
    await this.storage.setItemAsync(this.key, encodeBase64(bytes));
  }

  async clear(): Promise<void> {
    await this.storage.deleteItemAsync(this.key);
  }
}

export function createBackupKeyStore(): BackupKeyStore {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SecureStore = require('expo-secure-store') as SecureStorageLike;
  return new BackupKeyStore({ storage: SecureStore });
}
