#!/usr/bin/env sh
set -eu

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is not installed."
  echo "Follow the installation instructions in docs/PUBLIC_SHARING.md, then run this script again."
  exit 1
fi

printf '\nStarting a temporary public address for VaultDrop...\n\n'
echo "Keep this terminal open. Closing it will disable the public link."
echo "When Cloudflare prints an address ending in trycloudflare.com:"
echo "  1. Copy the complete https:// address."
echo "  2. Open it in your browser."
echo "  3. Create the share from that page."
echo
echo "Send the recipient the final /share/... link created by VaultDrop,"
echo "not the short trycloudflare.com address on its own."
echo

exec cloudflared tunnel --url http://localhost:5173
