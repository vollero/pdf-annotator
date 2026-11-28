#!/usr/bin/env bash
set -euo pipefail
export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
image='system-images;android-37.0;google_apis;x86_64'
sdkmanager 'emulator' "$image"
echo no | avdmanager create avd -n margin-tablet -k "$image" -d pixel_c --force
sudo chmod 666 /dev/kvm
emulator @margin-tablet -no-snapshot -no-window -memory 2048 -cores 2 -noaudio -no-boot-anim -gpu swiftshader_indirect > "$RUNNER_TEMP/margin-emulator.log" 2>&1 &
trap 'status=$?; if ((status)); then tail -60 "$RUNNER_TEMP/margin-emulator.log"; fi; adb emu kill >/dev/null 2>&1 || true' EXIT
timeout 300 adb wait-for-device
timeout 300 bash -c 'until adb shell getprop sys.boot_completed | tr -d "\r" | grep -qx 1; do sleep 2; done'
adb shell wm size 1600x1200
adb shell wm density 160
adb shell input keyevent 82
adb shell dumpsys webviewupdate
adb install android/app/build/outputs/apk/debug/app-debug.apk
node android/test-emulator.mjs
