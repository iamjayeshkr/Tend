#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/android-env.sh"
cd "$TEND_REPO_ROOT"
if [[ "${1:-}" != '--skip-web' ]]; then npm run build; fi
if [[ ! -f dist/index.html ]]; then echo 'No web build found at dist/index.html.' >&2; exit 1; fi
node scripts/verify-assets.mjs dist/index.html dist
mkdir -p android/app/src/main/assets/public
# This directory contains only the generated web bundle.
find android/app/src/main/assets/public -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -R dist/. android/app/src/main/assets/public/
node scripts/verify-assets.mjs android/app/src/main/assets/public/index.html android/app/src/main/assets/public
printf 'sdk.dir=%s\n' "$ANDROID_HOME" > android/local.properties
if [[ ! -f android/signing.properties ]]; then
  umask 077
  mkdir -p android/release-signing
  if [[ -f android/release-signing/tend-release.jks ]]; then
    echo 'Signing key exists, but signing.properties is missing. Restore signing.properties to preserve upgrade compatibility.' >&2
    exit 1
  fi
  tend_signing_password="$(openssl rand -hex 32)"
  printf 'storeFile=%s\nstorePassword=%s\nkeyAlias=tend\nkeyPassword=%s\n' "release-signing/tend-release.jks" "$tend_signing_password" "$tend_signing_password" > android/signing.properties
  TEND_KEY_PASSWORD="$tend_signing_password" "$JAVA_HOME/bin/keytool" -genkeypair -keystore android/release-signing/tend-release.jks -alias tend -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Tend Personal Release, OU=Local Application, O=Tend' -storepass:env TEND_KEY_PASSWORD -keypass:env TEND_KEY_PASSWORD >/dev/null 2>&1
  unset tend_signing_password
fi
./android/gradlew -p android --no-daemon :app:assembleRelease :app:lintRelease
mkdir -p releases
tend_release_version="$(node -p 'JSON.parse(require("fs").readFileSync("package.json","utf8")).version')"
tend_release_apk="releases/Tend-${tend_release_version}.apk"
cp android/app/build/outputs/apk/release/app-release.apk "$tend_release_apk"
if [[ -f android/signing.properties ]]; then
  store_file="android/$(grep '^storeFile=' android/signing.properties | cut -d= -f2-)"
  store_pass="$(grep '^storePassword=' android/signing.properties | cut -d= -f2-)"
  key_alias="$(grep '^keyAlias=' android/signing.properties | cut -d= -f2-)"
  key_pass="$(grep '^keyPassword=' android/signing.properties | cut -d= -f2-)"
  "$ANDROID_HOME/build-tools/36.0.0/apksigner" sign \
    --ks "$store_file" \
    --ks-pass "pass:$store_pass" \
    --ks-key-alias "$key_alias" \
    --key-pass "pass:$key_pass" \
    --v1-signing-enabled true \
    --v2-signing-enabled true \
    --v3-signing-enabled true \
    "$tend_release_apk"
fi
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --verbose "$tend_release_apk"
shasum -a 256 "$tend_release_apk" > "$tend_release_apk.sha256"
printf 'Signed APK: %s/%s\n' "$TEND_REPO_ROOT" "$tend_release_apk"
