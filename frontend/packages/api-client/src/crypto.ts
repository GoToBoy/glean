/**
 * Cryptographic utilities for client-side password hashing.
 *
 * Uses the Web Crypto API for secure SHA-256 hashing before
 * transmitting passwords to the backend.
 *
 * Falls back to crypto-js library when Web Crypto API is unavailable
 * (e.g., HTTP on non-localhost domains where crypto.subtle is undefined).
 */

import sha256 from 'crypto-js/sha256'
import encHex from 'crypto-js/enc-hex'

/**
 * Check if Web Crypto API is available.
 *
 * crypto.subtle is only available in secure contexts:
 * - HTTPS connections
 * - localhost (http://localhost, http://127.0.0.1)
 *
 * On plain HTTP with non-localhost domains, crypto.subtle is undefined.
 */
function isWebCryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && crypto.subtle !== undefined
}

/**
 * Hash a password using SHA-256 with Web Crypto API.
 *
 * @param password - The plaintext password to hash
 * @returns A promise that resolves to the hex-encoded SHA-256 hash
 */
async function hashWithWebCrypto(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Hash a password using SHA-256 with crypto-js library.
 *
 * Used as fallback when Web Crypto API is unavailable.
 *
 * @param password - The plaintext password to hash
 * @returns The hex-encoded SHA-256 hash
 */
function hashWithCryptoJs(password: string): string {
  return sha256(password).toString(encHex)
}

/**
 * Hash a password using SHA-256.
 *
 * This prevents plaintext passwords from being transmitted over the network.
 * The backend will receive the hash and apply bcrypt for storage.
 *
 * Uses Web Crypto API when available (secure contexts), falls back to
 * crypto-js library for non-secure contexts (HTTP on non-localhost).
 *
 * @param password - The plaintext password to hash
 * @returns A promise that resolves to the hex-encoded SHA-256 hash
 */
export async function hashPassword(password: string): Promise<string> {
  if (isWebCryptoAvailable()) {
    return hashWithWebCrypto(password)
  }
  // Fallback to crypto-js for non-secure contexts
  return hashWithCryptoJs(password)
}
