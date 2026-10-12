#!/usr/bin/env bash
# Source this file to use the Android toolchain without changing shell configuration.
TEND_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -z "${JAVA_HOME:-}" || ! -x "${JAVA_HOME}/bin/java" ]]; then
  for tend_java in "$HOME"/.cache/tend-build/jdk-*/Contents/Home /Applications/Unity/Hub/Editor/*/PlaybackEngines/AndroidPlayer/OpenJDK /Library/Java/JavaVirtualMachines/*/Contents/Home; do
    if [[ -x "$tend_java/bin/java" ]]; then export JAVA_HOME="$tend_java"; break; fi
  done
fi
if [[ -z "${JAVA_HOME:-}" || ! -x "$JAVA_HOME/bin/java" ]]; then
  echo 'Install a JDK 17 or 21, then set JAVA_HOME to its directory.' >&2
  return 1 2>/dev/null || exit 1
fi
export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
if [[ ! -d "$ANDROID_HOME" ]]; then
  echo 'Set ANDROID_HOME to your installed Android SDK directory.' >&2
  return 1 2>/dev/null || exit 1
fi
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/build-tools/36.0.0:$PATH"
