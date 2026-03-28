import crypto from "crypto";
import { config } from "../config.js";

// Ensure a 32-byte master key is available from environment
// If not 32 bytes, we pad or truncate it to make it exactly 32 bytes for AES-256
function getMasterKey(): Buffer {
    const keyStr = config.masterEncryptionKey;

    // SECURITY: Fail hard if no encryption key is set in production
    if (!keyStr || keyStr.trim().length === 0) {
        console.error("❌ FATAL: MASTER_ENCRYPTION_KEY environment variable is required for secure secrets.");
        console.error("   Generate a secure key with: openssl rand -base64 32");
        console.error("   Then add it to your .env file: MASTER_ENCRYPTION_KEY=<generated-key>");
        process.exit(1);
    }

    // Use SHA-256 to always derive a consistent 32-byte (256-bit) key from any input string
    return crypto.createHash("sha256").update(keyStr).digest();
}

export interface EncryptedPayload {
    iv: string;
    authTag: string;
    encryptedData: string;
}

/**
 * Encrypts a string (like an API key) using AES-256-GCM
 */
export function encryptSecret(plainText: string): EncryptedPayload {
    const key = getMasterKey();
    const iv = crypto.randomBytes(12); // 12 bytes is standard for GCM
    
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    
    let encrypted = cipher.update(plainText, "utf8", "hex");
    encrypted += cipher.final("hex");
    
    const authTag = cipher.getAuthTag().toString("hex");
    
    return {
        iv: iv.toString("hex"),
        authTag: authTag,
        encryptedData: encrypted,
    };
}

/**
 * Decrypts an AES-256-GCM payload back to a plain string
 */
export function decryptSecret(payload: EncryptedPayload): string {
    const key = getMasterKey();
    const iv = Buffer.from(payload.iv, "hex");
    const authTag = Buffer.from(payload.authTag, "hex");
    
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(payload.encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");
    
    return decrypted;
}
