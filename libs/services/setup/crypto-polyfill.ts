// Polyfill `globalThis.crypto.getRandomValues` for the Hermes engine.
//
// Hermes (React Native's JS engine) does not expose a Web Crypto `crypto`
// global. `@noble/ciphers`' `randomBytes()` — the secure random source behind
// backup encryption, used for the AES key and every GCM IV — throws
// `crypto.getRandomValues must be defined` without it, which surfaces as
// "Encryption toggle failed" on the Backup screen.
//
// expo-crypto is already a native dependency, and its `getRandomValues`
// matches the Web Crypto contract (fills the typed array in place and returns
// it), so we wire it onto the global. Import this module for its side effect
// before any crypto code runs (see app/_layout.tsx).

import { getRandomValues } from 'expo-crypto';

type CryptoHost = { crypto?: { getRandomValues?: unknown } };

const host = globalThis as unknown as CryptoHost;

if (!host.crypto) {
  host.crypto = {};
}
if (typeof host.crypto.getRandomValues !== 'function') {
  host.crypto.getRandomValues = getRandomValues;
}
