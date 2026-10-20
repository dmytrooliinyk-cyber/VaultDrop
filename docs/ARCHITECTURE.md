# Architecture notes

## Components

VaultDrop deliberately has only two runtime services.

The React frontend handles file selection, encryption, key wrapping, link construction, ciphertext download, authentication, decryption, and saving the restored file. It never sends plaintext metadata to the API.

The FastAPI backend accepts an opaque binary upload, applies transfer policy, stores randomized ciphertext objects, and records metadata in SQLite. It does not implement a decryption route and does not know the original filename.

Nginx serves the production frontend and forwards `/api/` requests to FastAPI inside the Docker network. During development, Vite provides the equivalent proxy.

## Encrypted container format

Before encryption, the browser creates:

```text
4-byte metadata length (big endian)
UTF-8 JSON metadata
raw file bytes
```

The JSON metadata has this shape:

```json
{
  "name": "report.pdf",
  "type": "application/pdf",
  "size": 12345,
  "version": 1
}
```

AES-GCM encrypts the complete plaintext container. The uploaded binary object is:

```text
12-byte random IV
ciphertext
16-byte GCM authentication tag
```

The browser rejects modified ciphertext before saving any plaintext.

## Link formats

A normal link fragment contains the random AES key:

```text
#k.<base64url-encoded-32-byte-key>
```

Password mode keeps the random file key but encrypts it with a key derived from the password:

```text
#p.<salt>.<wrapping-iv>.<wrapped-file-key>
```

The wrapping key uses PBKDF2-HMAC-SHA-256 with a random 128-bit salt and 310,000 iterations. PBKDF2 is available in the browser without an additional cryptography dependency. A reviewed Argon2id implementation would be preferable for a hardened production system.

## Persistence

SQLite stores random share IDs, random storage names, timestamps, policy flags, counters, and a SHA-256 digest of the management token. The raw management token has 256 bits of random entropy and is returned only once.

Encrypted objects use independent random 64-hex-character filenames. User-controlled filenames never become filesystem paths.

## Download transaction

For SQLite, `BEGIN IMMEDIATE` serializes the availability check and counter update. This prevents concurrent requests from both claiming the final allowed download. One-time ciphertext is read into memory and deleted before the response is returned.

The download is counted when the server authorizes the ciphertext transfer. The server cannot know whether the recipient later supplied the correct key or completed local decryption.

## Cleanup

The application removes expired database records and ciphertext at startup and on a periodic background task. Revoked objects remain stored until their expiration or explicit deletion so the sender can still inspect status.

## Trust boundaries

- The API and storage layer are not trusted with plaintext or decryption keys.
- The browser runtime is trusted for encryption, decryption, randomness, and link handling.
- The JavaScript delivery path is trusted not to replace the frontend with malicious code.
- The sender is trusted to deliver the complete link and optional password to the intended recipient.
- The recipient is trusted not to redistribute plaintext after decryption.
