# symbolPop

<div align="center">
  <img src="./app-icon.png" alt="symbolPop logo" width="120" />
</div>

A minimal Tauri v2 + React app to search and input Unicode symbols quickly. The app lives in the tray, opens a Quick Input window with a global hotkey, and lets users manage custom key→symbol mappings.


https://github.com/user-attachments/assets/2de3b747-a63c-4ece-9917-daa314531515


## Features
- Quick Input pop-up (Combobox, underline style) with case-sensitive ranking and note search; outputs via Windows `SendInput`.
- Built-in mapping set (Greek letters + common math symbols) plus user mappings stored in IndexedDB; user keys override built-ins on exact key match.
- Global hotkey (default `Alt+S`), changeable in Settings; tray menu and double-click tray icon open Settings.
- Settings page: capture hotkey with modifier validation, toast feedback; CRUD for user mappings with search + paging.

## Prerequisites
- Node.js 18+ and npm
- Rust toolchain (stable) with Tauri requirements for your OS
- Windows target enabled (text injection uses Win32 `SendInput`); on other platforms insert is unimplemented

## Install
```bash
npm install
```

## Run (web only)
```bash
npm run dev
```

## Run (Tauri app)
```bash
npm run tauri dev
```

## Build
```bash
npm run build          # build web assets
npm run tauri build    # bundle desktop app
```

## Usage
- Tray: right-click for Quick Input / Settings / Quit; double-click tray icon opens Settings.
- Hotkey: default `Alt+S` toggles Quick Input. Change it in Settings; saved hotkey is re-registered when Quick Input gains focus.
- Quick Input: type a key; `Enter` commits the selected value, hides the window, then injects text to the last focused app. `Esc` hides.
- User mappings: add/edit/delete key/value/note in Settings. Search + paging are available. User keys override built-ins when the key (case) matches exactly.

## Data & persistence
- User mappings and settings are stored in IndexedDB in the webview.
- Built-in mappings live in `src/assets/builtin_mappings.json`.

## Notes / Troubleshooting
- If the hotkey seems stale after restart, open Quick Input or Settings once to refresh registration.
- On non-Windows platforms, text injection is not available.
- If you see a “HotKey already registered” message, ensure only one instance is running; the app unregisters all before registering a new shortcut.

