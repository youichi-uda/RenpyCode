# RenPy Code

Complete Ren'Py development suite for Visual Studio Code — syntax highlighting, code completion, diagnostics, debugger, flow graph, live preview, and more.

## Features

### Free

- **Syntax Highlighting** — Full TextMate grammar + semantic tokens for Ren'Py scripts
- **Code Completion** — Labels, characters, screens, statements, built-in classes, screen keywords
- **Hover Documentation** — Statement syntax, character info, label details (English / Japanese)
- **Go to Definition / References** — Jump to label, character, and screen definitions; find all usages
- **Document & Workspace Symbols** — Outline view and Ctrl+T symbol search
- **Diagnostics** — Undefined labels, undefined characters, invalid jump targets, mixed indentation
- **CodeLens** — Reference counts above label definitions
- **Inlay Hints** — Character display names, jump targets, dialogue word counts
- **Code Actions** — Quick fixes for missing labels and characters
- **Signature Help** — Parameter hints for `Character()` and built-in functions
- **Document Links** — Clickable file paths in strings
- **Color Picker** — Hex color swatches in Character definitions
- **Code Folding** — Indent-based and block-aware folding
- **Call Hierarchy** — Incoming/outgoing call analysis for labels
- **Snippets** — 15+ templates for labels, menus, characters, screens, and more
- **Game Runner** — Launch, lint, and warp from the command palette
- **Dashboard** — Sidebar with project stats, bridge status, and quick actions
- **Japanese Localization** — Full i18n support

### Pro ($5 one-time, [purchase on Gumroad](https://y1uda.gumroad.com/l/renpycode))

- **Story Flow Graph** — Interactive Mermaid-based visualization of jump/call relationships
- **Debugger** — Breakpoints, variable inspection, stack frames via DAP
- **Live Preview** — Screenshot-based scene preview
- **Variable Tracker** — Real-time monitoring of game variables
- **Heatmap** — Playtest path visualization with visit frequency
- **Asset Manager** — Visual browser with unused asset detection
- **Translation Dashboard** — Completion tracking and untranslated string finder
- **Test Runner** — Discover and run Ren'Py testcases
- **Refactoring** — Safe rename of labels/characters/screens, route extraction

## Quick Start

1. Install the extension from the VS Code Marketplace
2. Open a Ren'Py project folder (containing `game/`)
3. Set the SDK path: **Settings → RenPy Code → SDK Path** (e.g., `C:/renpy-8.5.2-sdk`)
4. Start editing `.rpy` files — completion, hover, and diagnostics work automatically
5. Press `Ctrl+Shift+P` → **RenPy Code: Launch Game** to run your project

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `renpyCode.sdkPath` | `""` | Path to Ren'Py SDK directory |
| `renpyCode.diagnostics.enable` | `true` | Enable real-time diagnostics |
| `renpyCode.diagnostics.undefinedLabel` | `true` | Warn on jump/call to undefined labels |
| `renpyCode.diagnostics.undefinedCharacter` | `true` | Warn on dialogue with undefined characters |
| `renpyCode.diagnostics.invalidJump` | `true` | Warn on invalid jump/call targets |
| `renpyCode.diagnostics.indentation` | `true` | Warn on mixed indentation (tabs + spaces) |

## Requirements

- VS Code 1.85+
- Ren'Py SDK 7.x or 8.x

## License

Commercial license — see [LICENSE.md](LICENSE.md) for details.

Free-tier features are available at no cost for personal and commercial projects.
Pro features require a one-time $5 license key.

## Author

**abyo-software** (Youichi Uda) — [abyo.net](https://abyo.net)
