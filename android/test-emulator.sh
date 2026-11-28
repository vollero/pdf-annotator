#!/usr/bin/env bash
set -euo pipefail
export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
image='system-images;android-37.0;google_apis;x86_64'
# Hosted runners also carry unrelated SDKs. Reserve space for the writable AVD.
if [[ "${GITHUB_ACTIONS:-}" = true && $(df -Pm "$ANDROID_HOME" | awk 'NR==2{print $4}') -lt 18000 ]]; then
  sudo rm -rf /usr/share/dotnet
fi
sdkmanager 'emulator' "$image"
export ANDROID_USER_HOME="$RUNNER_TEMP/margin-android"
export ANDROID_AVD_HOME="$ANDROID_USER_HOME/avd"
mkdir -p "$ANDROID_AVD_HOME"
avd="$ANDROID_AVD_HOME/margin-tablet.avd"
echo no | avdmanager create avd -n margin-tablet -p "$avd" -k "$image" -d pixel_c --force
test -s "$avd/config.ini"
printf 'avd.ini.encoding=UTF-8\npath=%s\n' "$avd" > "$ANDROID_AVD_HOME/margin-tablet.ini"
emulator -list-avds
sudo chmod 666 /dev/kvm
emulator @margin-tablet -no-snapshot -no-window -memory 4096 -partition-size 2048 -cores 2 -noaudio -no-boot-anim -gpu software > "$RUNNER_TEMP/margin-emulator.log" 2>&1 &
emulator_pid=$!
trap 'status=$?; if ((status)); then tail -60 "$RUNNER_TEMP/margin-emulator.log"; fi; adb emu kill >/dev/null 2>&1 || true' EXIT
adb start-server
for i in {1..90}; do
  kill -0 "$emulator_pid" || { echo 'Emulator exited during startup'; exit 1; }
  if [[ "$(adb get-state 2>/dev/null)" = device ]]; then break; fi
  sleep 2
done
timeout 10 adb wait-for-device
timeout 300 bash -c 'until adb shell getprop sys.boot_completed | tr -d "\r" | grep -qx 1; do sleep 2; done'
adb shell wm size 1600x1200
adb shell wm density 160
adb shell input keyevent 82
adb shell dumpsys webviewupdate
adb install android/app/build/outputs/apk/debug/app-debug.apk
node android/test-emulator.mjs
