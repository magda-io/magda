import crypto from "crypto";
import bcrypt from "bcrypt";

/**
 * Salting round. Default is 10. means 2^10 rounds
 * When 10, approx. ~10 hashes can be generated per sec (on a 2GHz core) roughly
 * We set to 10 here so API key access will have reasonable performance
 */
export const SALT_ROUNDS = 10;
export const API_KEY_LENGTH = 32;

/**
 * Generates cryptographically strong pseudo-random data as API key
 * https://nodejs.org/api/crypto.html#crypto_crypto_randombytes_size_callback
 *
 * @param {number} [size] length of the random key in bytes. If not provided, default value of 32 bytes (256bit) will be used.
 * @returns {Promise<string>}
 */
export const generateAPIKey = (size?: number) =>
    new Promise<string>((resolve, reject) => {
        crypto.randomBytes(size ? size : API_KEY_LENGTH, (err, buf) => {
            if (err) {
                reject(err);
                return;
            } else {
                resolve(buf.toString("base64"));
            }
        });
    });

export const createApiKeyHash = (apiKey: string) =>
    bcrypt.hash(apiKey, SALT_ROUNDS);
