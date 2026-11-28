#!/usr/bin/env bash
set -euo pipefail
export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
sdkmanager --list > "$RUNNER_TEMP/margin-sdk-list"
image=$(awk -F'|' '/system-images;android-(37|36);google_apis;x86_64/ {gsub(/ /,"",$1);print $1}' "$RUNNER_TEMP/margin-sdk-list" | sort -Vu | tail -1)
test -n "$image"
sdkmanager 'emulator' "$image"
echo no | avdmanager create avd -n margin-tablet -k "$image" -d pixel_c --force
sudo chmod 666 /dev/kvm
emulator @margin-tablet -no-snapshot -no-window -noaudio -no-boot-anim -gpu swiftshader_indirect > "$RUNNER_TEMP/margin-emulator.log" 2>&1 &
trap 'adb emu kill >/dev/null 2>&1 || true' EXIT
timeout 300 adb wait-for-device
timeout 300 bash -c 'until adb shell getprop sys.boot_completed | tr -d "\r" | grep -qx 1; do sleep 2; done'
adb shell wm size 1600x1200
adb shell wm density 160
adb shell input keyevent 82
adb shell dumpsys webviewupdate
adb install android/app/build/outputs/apk/debug/app-debug.apk
node android/test-emulator.mjs
