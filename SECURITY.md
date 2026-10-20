# Security policy

## Project status

VaultDrop is a portfolio and educational project. Its design uses standard browser cryptography and includes automated security-focused tests, but the code has not undergone a professional audit. Do not rely on it as the only control for highly sensitive, regulated, or safety-critical data.

## Reporting a vulnerability

Please avoid opening a public issue for a vulnerability that would expose users, keys, or stored data. Use GitHub's private vulnerability reporting feature for the repository when it is available. Include:

- the affected version or commit;
- a clear description of the impact;
- steps to reproduce the issue with non-sensitive test data;
- any suggested mitigation;
- whether the issue is already public.

Do not include real share links, decryption keys, management tokens, passwords, uploaded files, IP addresses, or personal information in a report.

## What the design protects

VaultDrop is designed so that a database and storage snapshot alone does not reveal file contents, filenames, MIME types, passwords, or decryption keys. AES-256-GCM provides confidentiality and integrity for the encrypted container. A fresh key and IV are generated for every upload.

The management token is a random 256-bit value. Only its SHA-256 digest is stored. This is different from hashing a human password: a uniformly random token has enough entropy to make offline guessing impractical.

The backend also applies randomized storage names, strict storage identifier validation, streaming upload limits, expiration cleanup, download-limit transactions, management-token checks, restricted CORS, no-store responses, anti-framing headers, and rate limiting.

## What the design does not protect

VaultDrop cannot protect a file when:

- malware or a malicious extension controls the sender's or recipient's browser;
- the frontend server is compromised and delivers modified JavaScript;
- an unintended person obtains the complete share URL;
- a recipient deliberately redistributes the decrypted file;
- a weak password is guessed offline from a password-protected link;
- local disk snapshots or backups retain ciphertext after application deletion;
- denial of service exhausts disk, memory, bandwidth, or process capacity;
- traffic analysis reveals timing, IP addresses, approximate sizes, or transfer counts.

“Zero-knowledge” in this repository is a narrow engineering description: the storage/API service does not receive the decryption secret during the intended flow. It is not a formal zero-knowledge proof protocol.

## Important operational limitations

- Browser encryption holds the file and intermediate buffers in memory. The default 100 MB limit is intentionally conservative.
- A one-time share is consumed when ciphertext transfer is authorized, not after the browser proves successful decryption.
- One-time ciphertext is buffered in backend memory before deletion and response.
- Rate limiting is in-memory and per process. It resets on restart and is not shared between multiple backend replicas.
- SQLite is intended for a small single-instance deployment.
- PBKDF2 is used because Web Crypto supports it natively. A reviewed Argon2id implementation is preferable for stronger password hardening.
- Quick Tunnel hostnames are temporary. They are suitable for demonstrations, not durable service availability.

## Deployment guidance

For anything beyond a local demonstration:

- expose only the frontend reverse proxy and keep the backend on a private network;
- require HTTPS and enable HSTS on a stable hostname;
- use a maintained reverse proxy and keep dependencies patched;
- use distributed rate limiting and per-user or per-origin quotas;
- monitor capacity without logging full share URLs or secret-bearing fragments;
- harden containers and run them without unnecessary privileges;
- use encrypted, lifecycle-managed storage and a production database;
- build frontend assets reproducibly from reviewed lock files;
- obtain an independent security review.

Never log the browser URL fragment. It contains the decryption material.
