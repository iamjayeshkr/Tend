#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/android-env.sh"
cd "$TEND_REPO_ROOT"
./android/gradlew -p android --no-daemon :app:assembleDebug :app:assembleDebugAndroidTest :app:lintDebug
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb install -r android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb shell pm grant app.tend.debug android.permission.POST_NOTIFICATIONS
adb shell appops set app.tend.debug SCHEDULE_EXACT_ALARM allow
tend_test_output="$(mktemp)"
trap 'rm -f "$tend_test_output"' EXIT
adb shell am instrument -w app.tend.debug.test/app.tend.NativeSmokeTest | tee "$tend_test_output"
# Android's instrumentation shell may exit 0 even when a custom runner reports failure.
tend_result="$(cat "$tend_test_output")"
if [[ "$tend_result" != *"PASS:"* ]]; then exit 1; fi
if [[ "$tend_result" != *"exact timer and notification verified"* ]]; then
  echo 'Full timer check did not run: enable notification and exact-alarm access for the debug test app.' >&2
  exit 1
fi
