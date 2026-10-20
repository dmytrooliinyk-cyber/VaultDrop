# Contributing

Small, focused changes are easiest to review. Before changing code, describe the problem in plain language and explain how a user can observe it.

## Local setup

Follow [docs/INSTALLATION.md](docs/INSTALLATION.md). Use `npm ci` for an unchanged lock file and a Python virtual environment for the backend.

## Before opening a pull request

Run:

```text
backend:  python -m pytest -q
frontend: npm test
frontend: npm run build
```

If the change affects API integration, also run `npm run test:e2e` with the backend on port 8000.

Please include or update tests when changing cryptographic container handling, URL parsing, authorization, expiration, rate limiting, storage paths, download counters, or security headers.

## Coding style

- Prefer clear names and small functions over comments that repeat the code.
- Explain the reason for unusual security behavior, not every line of implementation.
- Keep error messages useful without exposing filesystem paths, tokens, keys, or internal exceptions.
- Keep the frontend dependency set small. New cryptography dependencies require extra review.
- Do not weaken browser URL validation merely to make a local link look public.
- Do not add analytics, third-party scripts, remote fonts, or other resources that receive page or referrer data.

## Documentation

Write instructions as if the reader is using a clean computer. State which directory a command runs from, which terminal must remain open, what successful output looks like, and how to recover from common errors.

Use placeholders such as `YOUR_USERNAME`, `example.com`, and `C:\Projects\VaultDrop`. Never commit personal names, home-directory paths, private domains, real share links, database files, ciphertext objects, keys, passwords, or tokens.

## Security reports

Do not open a public issue for an unpatched vulnerability. Follow [SECURITY.md](SECURITY.md).
