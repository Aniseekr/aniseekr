# Release build stuck on the splash — TestFlight 1.3.0 (43) (2026-10-30)

## Symptom

1.3.0 (43) was the first SDK 58 / RN 0.88 build, built on EAS. It never left the native splash.

## Root cause

Reproduced with a local Release build on the iPhone 18 Pro simulator. The device log showed an error before the runtime was ready:

```
[runtime not ready]: TypeError: Cannot read property 'get' of undefined
```

To get a stack, I swapped an unminified bundle into the installed app, with the entry `__r()` calls wrapped to log `e.stack`. The stack pointed to `requireNativeComponent` in expo-modules-core, which calls `NativeComponentRegistry.get(...)` on the module it gets for `react-native`. That module was not the real react-native:

- `withNativewind` uses react-native-css 3.0.7, whose resolver points every `react-native` import, including imports from node_modules, at `react-native-css/components`.
- That facade only lists some exports. It has no `NativeComponentRegistry`, `EventEmitter`, `usePressability`, and others.
- expo-modules-core 58 reads `NativeComponentRegistry` at module load, so the bundle threw before the first frame and the splash never hid. Android runs the same JS, so it was affected too.

## Fix

`metro.config.js`: for `react-native` imports that come from inside `node_modules`, use the original resolver. App code keeps the facade, which is the only place `className` is used.

## What was run

- iOS Release build (`expo run:ios --configuration Release`) on the simulator: launch → TypeError in the log, stuck on the splash.
- Rebundled with the fix (`expo export:embed --dev false`) and swapped it into the same Release app: launch → onboarding renders (`after-fix-onboarding.jpg`), with no JS errors except RevenueCat offerings, which the simulator can't load.
- The store builds after this commit are full local builds (`build:ios:local`, `build:android:local`).
