# Android 1.3.0 launch crash — 2026-10-31

## Repro (Play 1.3.0, versionCode 99, local AAB build-1793352964081.aab → universal APK, API 36 arm64 AVD)
FATAL on launch, before JS:
`Unable to get provider androidx.startup.InitializationProvider ... Failed to create an instance of androidx.work.impl.WorkDatabase`

## Root cause
play-services-ads pulls androidx.work 2.7.0 → Room 2.2.5. Room 2.2.5's consumer rule is
`-keep class * extends androidx.room.RoomDatabase` (no members). SDK 58 / RN 0.88 moved to AGP 9.2,
whose R8 full mode no longer implies the no-arg constructor, so `WorkDatabase_Impl` shipped without
`<init>` (verified with dexdump) and Room's reflective newInstance() failed at app start.

## Fix
app.json → expo-build-properties.android.extraProguardRules:
`-keep class * extends androidx.room.RoomDatabase { <init>(); }`

## Verified
prebuild + `:app:assembleRelease` (minified, arm64) → installed on AVD → app reaches onboarding,
no FATAL in logcat. Screenshot: after-fix.png
