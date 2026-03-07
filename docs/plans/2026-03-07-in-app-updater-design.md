# In-App Updater Design

## Overview

Simple in-app update notification for both Electron and Swift macOS apps. Polls GitHub Releases API, shows "Update available" notification, user clicks to download and install. Checks on launch + every 6 hours.

## Shared: GitHub Releases API

Both platforms poll `https://api.github.com/repos/websitebutlers/codefire-app/releases/latest`. Compare the `tag_name` (e.g. `v1.2.0`) against the app's current version using semver comparison. If newer, show a notification with "Update Now" button.

## Electron

Use `electron-updater` (built into electron-builder). Change `"publish": null` to `"publish": { "provider": "github" }` in package.json. It handles version comparison, download, and install-on-quit automatically.

Wire autoUpdater events to show a notification in the renderer when an update is available, with an "Update Now" button that triggers download, install, and restart.

### Files
- `package.json` — publish config change
- `src/main/services/UpdateService.ts` — wraps autoUpdater events, manages check interval
- `src/main/index.ts` — start UpdateService
- `src/renderer/components/UpdateNotification.tsx` — toast/banner component
- `src/shared/types.ts` — IPC channels for update events
- `src/main/ipc/` — update IPC handlers

## Swift

Custom GitHub-based checker (~150 lines). No Sparkle dependency.

Poll the releases API, compare semver, show an `NSAlert` with "Update Now" / "Later". On click: download `CodeFire-macOS.zip` to temp dir, unzip, replace the app bundle at its current location, relaunch via `open`.

### Files
- `Services/UpdateService.swift` — version check, download, replace, relaunch
- `CodeFireApp.swift` — start periodic check on launch
- Settings view — "Check for Updates" button + auto-check toggle

## UX Flow

1. App launches → checks for update (non-blocking)
2. Every 6 hours → checks again
3. If update available → show notification: "CodeFire v1.2.0 is available" + "Update Now" button
4. User clicks "Update Now" → download starts, progress shown
5. Download complete → install and restart

## Out of Scope

- No delta updates — full download each time
- No rollback mechanism
- No mandatory/forced updates
- No update channel switching (beta/stable)
