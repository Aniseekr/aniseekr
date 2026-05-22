import { describe, it, expect, beforeEach } from 'bun:test';

import {
  BackupEncryption,
  BackupKeyStore,
  ENCRYPTED_ENVELOPE_VERSION,
  decodeBase64,
  encodeBase64,
  generateBackupKey,
  isEncryptedPayload,
  type SecureStorageLike,
} from '../../../libs/services/backup/encryption';
import { createEmptyBackup } from '../../../libs/services/backup/schema';

function makeFakeSecureStore(): SecureStorageLike & { _store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    _store: store,
    async getItemAsync(k) {
      return store.get(k) ?? null;
    },
    async setItemAsync(k, v) {
      store.set(k, v);
    },
    async deleteItemAsync(k) {
      store.delete(k);
    },
  };
}

describe('backup/encryption · primitives', () => {
  it('CRYPTO-001 generateBackupKey returns 32 bytes of randomness', () => {
    const a = generateBackupKey();
    const b = generateBackupKey();
    expect(a).toHaveLength(32);
    expect(b).toHaveLength(32);
    expect(encodeBase64(a)).not.toBe(encodeBase64(b));
  });

  it('CRYPTO-002 encodeBase64 / decodeBase64 round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 99, 0xff, 0x80]);
    const enc = encodeBase64(bytes);
    const dec = decodeBase64(enc);
    expect(dec).toEqual(bytes);
  });

  it('CRYPTO-003 isEncryptedPayload recognizes the wrapper and rejects plain envelopes', () => {
    const plain = JSON.stringify(createEmptyBackup());
    expect(isEncryptedPayload(plain)).toBe(false);

    const wrapper = JSON.stringify({
      encrypted: true,
      v: ENCRYPTED_ENVELOPE_VERSION,
      iv: 'aaaa',
      ciphertext: 'bbbb',
    });
    expect(isEncryptedPayload(wrapper)).toBe(true);

    expect(isEncryptedPayload('not json')).toBe(false);
    expect(isEncryptedPayload(JSON.stringify({ encrypted: false }))).toBe(false);
  });
});

describe('backup/encryption · BackupEncryption round-trip', () => {
  let enc: BackupEncryption;
  let key: Uint8Array;

  beforeEach(() => {
    key = generateBackupKey();
    enc = new BackupEncryption();
  });

  it('CRYPTO-100 encrypt → decrypt reproduces the original envelope', () => {
    const env = {
      ...createEmptyBackup(),
      createdAt: 1_700_000_000_000,
    };
    const cipherJson = enc.encrypt(env, key);
    expect(isEncryptedPayload(cipherJson)).toBe(true);

    const back = enc.decrypt(cipherJson, key);
    expect(back).toEqual(env);
  });

  it('CRYPTO-101 ciphertext for the same plaintext differs across invocations (random IV)', () => {
    const env = createEmptyBackup();
    const a = enc.encrypt(env, key);
    const b = enc.encrypt(env, key);
    expect(a).not.toBe(b);
    // Both still decrypt cleanly.
    expect(enc.decrypt(a, key).version).toBe(1);
    expect(enc.decrypt(b, key).version).toBe(1);
  });

  it('CRYPTO-102 decrypt with a wrong key throws (GCM tag mismatch)', () => {
    const env = createEmptyBackup();
    const cipher = enc.encrypt(env, key);
    const wrongKey = generateBackupKey();
    expect(() => enc.decrypt(cipher, wrongKey)).toThrow();
  });

  it('CRYPTO-103 decrypt rejects tampered ciphertext', () => {
    const env = createEmptyBackup();
    const cipher = enc.encrypt(env, key);
    const parsed = JSON.parse(cipher) as { ciphertext: string };
    // Flip the first character of the base64 payload.
    parsed.ciphertext =
      (parsed.ciphertext[0] === 'A' ? 'B' : 'A') + parsed.ciphertext.slice(1);
    const tampered = JSON.stringify(parsed);
    expect(() => enc.decrypt(tampered, key)).toThrow();
  });

  it('CRYPTO-104 decrypt rejects payloads that are not an encrypted wrapper', () => {
    expect(() => enc.decrypt('{"version":1,"db":{}}', key)).toThrow(/not.*encrypted/i);
    expect(() => enc.decrypt('not json', key)).toThrow();
  });

  it('CRYPTO-105 backup encryption wrapper carries v + iv + ciphertext + encrypted flag', () => {
    const env = createEmptyBackup();
    const cipher = enc.encrypt(env, key);
    const parsed = JSON.parse(cipher);
    expect(parsed.encrypted).toBe(true);
    expect(parsed.v).toBe(ENCRYPTED_ENVELOPE_VERSION);
    expect(typeof parsed.iv).toBe('string');
    expect(typeof parsed.ciphertext).toBe('string');
    // 12-byte IV → base64 length 16 (with padding).
    expect(parsed.iv.length).toBeGreaterThanOrEqual(16);
  });
});

describe('backup/encryption · BackupKeyStore (SecureStore-backed)', () => {
  it('CRYPTO-200 first call to ensureKey generates + stores; second returns the same bytes', async () => {
    const secure = makeFakeSecureStore();
    const store = new BackupKeyStore({ storage: secure });

    const k1 = await store.ensureKey();
    const k2 = await store.ensureKey();
    expect(encodeBase64(k1)).toBe(encodeBase64(k2));
    expect(secure._store.size).toBe(1);
  });

  it('CRYPTO-201 clear removes the stored key', async () => {
    const secure = makeFakeSecureStore();
    const store = new BackupKeyStore({ storage: secure });
    await store.ensureKey();
    await store.clear();
    expect(secure._store.size).toBe(0);
  });

  it('CRYPTO-202 getKey returns null when nothing is stored', async () => {
    const secure = makeFakeSecureStore();
    const store = new BackupKeyStore({ storage: secure });
    expect(await store.getKey()).toBeNull();
  });
});
