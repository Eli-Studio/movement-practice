#!/bin/bash
# One-time setup: mirror public movement-practice into the private repo,
# clone it locally, and wire up the public repo as `upstream`.
# Run this in your own Terminal (double-click also works) so your GitHub auth applies.
set -euo pipefail

PUBLIC_URL="https://github.com/Eli-Studio/movement-practice.git"
PRIVATE_URL="https://github.com/Eli-Studio/movement-practice-private.git"
DEST="$HOME/Documents/GitHub/movement-practice-private"
BARE="$(mktemp -d)/mp-bare.git"

echo "==> 1/4  Bare-cloning public movement-practice (full history, all branches)…"
git clone --bare "$PUBLIC_URL" "$BARE"

echo "==> 2/4  Mirror-pushing into the private repo…"
git -C "$BARE" push --mirror "$PRIVATE_URL"

echo "==> 3/4  Cloning the private repo to $DEST…"
if [ -e "$DEST" ]; then
  echo "    $DEST already exists — skipping clone. Remove it first if you want a fresh clone."
else
  git clone "$PRIVATE_URL" "$DEST"
fi

echo "==> 4/4  Wiring public repo as 'upstream' remote…"
git -C "$DEST" remote add upstream "$PUBLIC_URL" 2>/dev/null || git -C "$DEST" remote set-url upstream "$PUBLIC_URL"

echo ""
echo "==> Done. Remotes in the private clone:"
git -C "$DEST" remote -v
echo ""
echo "==> Latest commit:"
git -C "$DEST" log --oneline -1

# Clean up the temporary bare clone
rm -rf "$(dirname "$BARE")"
echo ""
echo "All set. Work in: $DEST"
echo "Pull shared features later with:  git fetch upstream && git merge upstream/main"
