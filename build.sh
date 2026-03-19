#!/bin/bash
# PackMaster build script — creates .txz package and .plg installer
# Usage: ./build.sh [VERSION]
# VERSION defaults to YYYY.MM.DD (today)
set -euo pipefail

PLUGIN_NAME="packmaster"
VERSION="${1:-$(date +%Y.%m.%d)}"
BUILD_DIR="./build"
PLUGIN_SRC="./plugin/src"
FRONTEND_DIR="./frontend"

echo "========================================="
echo "  PackMaster v${VERSION} — Build"
echo "========================================="
echo ""

# Step 1: Build React frontend
echo "[1/6] Building frontend..."
cd "$FRONTEND_DIR"
npm run build
cd ..
echo "       Frontend built successfully."
echo ""

# Step 2: Copy fresh frontend dist into plugin source
echo "[2/6] Copying frontend assets to plugin..."
rm -rf "${PLUGIN_SRC}/usr/local/emhttp/plugins/${PLUGIN_NAME}/app"
mkdir -p "${PLUGIN_SRC}/usr/local/emhttp/plugins/${PLUGIN_NAME}/app"
cp -R "${FRONTEND_DIR}/dist/"* "${PLUGIN_SRC}/usr/local/emhttp/plugins/${PLUGIN_NAME}/app/"
echo "       Assets copied."
echo ""

# Step 3: Assemble build directory
echo "[3/6] Assembling package..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
cp -R "$PLUGIN_SRC"/* "$BUILD_DIR/"

# Set permissions
find "$BUILD_DIR" -type d -exec chmod 755 {} \;
find "$BUILD_DIR" -type f -exec chmod 644 {} \;
# rc scripts must be executable
find "$BUILD_DIR" -path "*/rc.d/*" -type f -exec chmod 755 {} \;

# Convert line endings (CRLF safety)
find "$BUILD_DIR" -type f \( -name "*.page" -o -name "*.php" -o -name "*.cfg" \) \
    -exec sed -i 's/\r$//' {} \;

echo "       Package assembled."
echo ""

# Step 4: Create .txz (Slackware package)
echo "[4/6] Creating .txz package..."
cd "$BUILD_DIR"
TXZ_FILE="../${PLUGIN_NAME}-${VERSION}.txz"
tar -cJf "$TXZ_FILE" .
cd ..
echo "       Package created."
echo ""

# Step 5: Generate SHA256
echo "[5/6] Generating checksums..."
TXZ_SHA256=$(sha256sum "${PLUGIN_NAME}-${VERSION}.txz" | cut -d' ' -f1)
echo "       SHA256: ${TXZ_SHA256}"
echo ""

# Step 6: Generate .plg file from template
echo "[6/6] Generating .plg installer..."
GITHUB_BASE="https://github.com/w0lf69/packmaster/releases/download/v${VERSION}"

sed -e "s|%%VERSION%%|${VERSION}|g" \
    -e "s|%%TXZ_SHA256%%|${TXZ_SHA256}|g" \
    -e "s|%%TXZ_URL%%|${GITHUB_BASE}/${PLUGIN_NAME}-${VERSION}.txz|g" \
    plugin/packmaster.plg.template > "${PLUGIN_NAME}.plg"

echo "       PLG generated."
echo ""

# Clean up
rm -rf "$BUILD_DIR"

# Report
TXZ_SIZE=$(du -h "${PLUGIN_NAME}-${VERSION}.txz" | cut -f1)
echo "========================================="
echo "  Build Complete!"
echo "========================================="
echo ""
echo "  Package: ${PLUGIN_NAME}-${VERSION}.txz (${TXZ_SIZE})"
echo "  SHA256:  ${TXZ_SHA256}"
echo "  PLG:     ${PLUGIN_NAME}.plg"
echo ""
echo "  Next steps:"
echo "    1. Upload .txz to GitHub Release v${VERSION}"
echo "    2. Commit + push .plg to main branch"
echo "    3. Install on Unraid via:"
echo "       https://raw.githubusercontent.com/w0lf69/packmaster/main/packmaster.plg"
echo ""
