# ❄️ Glace — Custom Windows Desktop Environment & Taskbar

> A high-performance, modular floating-capsule taskbar and desktop environment for Windows, built with **Tauri v2**, **Rust**, **Win32 APIs**, and **React 19**.

---

## ✨ Features

- **🏝️ Modular Floating Capsules**: Independent, sleek glassmorphic capsules (Start, Active Apps, Media Player, Hardware Monitor, Tray / Control Center, Clock & Calendar).
- **🎨 Dynamic Theming Engine**: 6 built-in curated theme presets (*Obsidian Dark*, *Seelen Cyberpunk*, *Catppuccin Mocha*, *Nord Frost*, *Liquid Glass*, *Sunset Amber*) with live accent color and glass blur customization.
- **🚀 Rofi-Style Start Launcher**: Fast keyboard search (`ArrowUp`/`ArrowDown`/`Enter`), real-time inline math calculator, and quick shell command runner (`> cmd`).
- **🎵 Soundwave Media Visualizer**: Animated audio equalizer with track info and multimedia playback controls.
- **⚡ Live Hardware Monitoring**: Real-time CPU load and RAM gauges via Win32 kernel metrics.
- **🪟 Windows TWM Window Snapping**: Right-click any app icon for instant window management (Half Left/Right, 4 Quadrants, Maximize, Center Float).
- **🖼️ High-Fidelity Shell Icons**: Native Windows `SHGetFileInfoW` icon extraction matching Windows Explorer, with child process resolution for UWP/modern apps.
- **🛡️ Native Taskbar Suppression**: Persistent, safe background suppression of `Shell_TrayWnd` with automatic work area reservation and emergency fail-safe restoration on exit.

---

## 🛠️ Tech Stack

- **Framework**: [Tauri v2](https://v2.tauri.app/) (Rust + WebView2)
- **Frontend**: React 19, TypeScript, Vanilla CSS Design System
- **Backend / System**: Rust, Win32 APIs (`windows-rs` 0.61)
- **Styling**: Pure CSS Variables, Glassmorphism, Spring animations

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install) (`rustup` + `cargo`)
- [Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)

### Development

```powershell
# 1. Clone repository
git clone https://github.com/Uchiha-Itachi001/Glace.git
cd Glace

# 2. Install frontend dependencies
npm install

# 3. Launch Tauri Dev Server
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
npm run tauri dev
```

### Build for Production

```powershell
npm run tauri build
```

---

## 📄 License

MIT License © 2026
