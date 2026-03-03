#!/bin/bash
# PackMaster build script — builds frontend, packages .txz, generates .plg
set -euo pipefail

PLUGIN_NAME="packmaster"
VERSION="${1:-$(date +%Y.%m.%d)}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN_DIR="$ROOT_DIR/plugin"
FRONTEND_DIR="$ROOT_DIR/frontend"
BUILD_DIR="$ROOT_DIR/build"
EMHTTP_DIR="$PLUGIN_DIR/src/usr/local/emhttp/plugins/packmaster"

COMPOSE_VERSION="v2.32.4"
COMPOSE_BINARY="$ROOT_DIR/.cache/docker-compose-${COMPOSE_VERSION}"
COMPOSE_DEST="$PLUGIN_DIR/src/usr/local/lib/docker/cli-plugins/docker-compose"

echo "=== PackMaster Build v${VERSION} ==="

# Step 0: Download docker-compose binary (cached)
echo ""
echo "--- Ensuring docker-compose binary ---"
mkdir -p "$ROOT_DIR/.cache"
if [[ ! -f "$COMPOSE_BINARY" ]]; then
    echo "Downloading docker-compose ${COMPOSE_VERSION} for linux/amd64..."
    curl -fsSL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
        -o "$COMPOSE_BINARY"
    chmod +x "$COMPOSE_BINARY"
    echo "Downloaded."
else
    echo "Using cached binary."
fi
mkdir -p "$(dirname "$COMPOSE_DEST")"
cp "$COMPOSE_BINARY" "$COMPOSE_DEST"
chmod +x "$COMPOSE_DEST"

# Step 1: Build frontend
echo ""
echo "--- Building frontend ---"
cd "$FRONTEND_DIR"
npm run build
echo "Frontend built."

# Step 2: Copy frontend build to plugin src
echo ""
echo "--- Copying frontend assets ---"
rm -rf "$EMHTTP_DIR/app"
mkdir -p "$EMHTTP_DIR/app"
cp -R "$FRONTEND_DIR/dist/"* "$EMHTTP_DIR/app/"
echo "Frontend assets copied to plugin/src."

# Step 3: Create .txz package
echo ""
echo "--- Creating .txz package ---"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
cp -R "$PLUGIN_DIR/src/"* "$BUILD_DIR/"

# Set permissions
find "$BUILD_DIR" -type d -exec chmod 755 {} \;
find "$BUILD_DIR" -type f -exec chmod 644 {} \;
# docker-compose binary must be executable
if [[ -f "$BUILD_DIR/usr/local/lib/docker/cli-plugins/docker-compose" ]]; then
    chmod +x "$BUILD_DIR/usr/local/lib/docker/cli-plugins/docker-compose"
fi

# Convert line endings
find "$BUILD_DIR" -type f \( -name "*.php" -o -name "*.page" -o -name "*.cfg" \) \
    -exec sed -i 's/\r$//' {} \;

# Create Slackware package
cd "$BUILD_DIR"
TXZ_FILE="$ROOT_DIR/${PLUGIN_NAME}-${VERSION}.txz"
tar -cJf "$TXZ_FILE" .
cd "$ROOT_DIR"

# Generate SHA256
TXZ_SHA256=$(sha256sum "${PLUGIN_NAME}-${VERSION}.txz" | cut -d' ' -f1)

echo "Package: ${PLUGIN_NAME}-${VERSION}.txz"
echo "SHA256:  ${TXZ_SHA256}"
echo "Size:    $(du -h "${PLUGIN_NAME}-${VERSION}.txz" | cut -f1)"

# Step 4: Generate PLG file
echo ""
echo "--- Generating .plg installer ---"
GITHUB_BASE="https://github.com/w0lf69/packmaster/releases/download/v${VERSION}"

sed -e "s|%%VERSION%%|${VERSION}|g" \
    -e "s|%%TXZ_SHA256%%|${TXZ_SHA256}|g" \
    -e "s|%%TXZ_URL%%|${GITHUB_BASE}/${PLUGIN_NAME}-${VERSION}.txz|g" \
    "$PLUGIN_DIR/packmaster.plg.template" > "$ROOT_DIR/${PLUGIN_NAME}.plg"

echo "PLG: ${PLUGIN_NAME}.plg"

# Clean build dir
rm -rf "$BUILD_DIR"

echo ""
echo "=== Build complete ==="
echo "  ${PLUGIN_NAME}-${VERSION}.txz  (upload to GitHub release)"
echo "  ${PLUGIN_NAME}.plg             (install URL for Unraid)"
