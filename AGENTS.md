# AGENTS.md — Developer & AI Agent Guide for Decky Unison

Welcome to the **Decky Unison** codebase! This guide serves as the single source of truth for AI agents and human developers modifying, maintaining, or extending this plugin.

---

## 1. Executive Summary & Project Purpose

**Decky Unison** is a [Decky Loader](https://deckbrew.xyz/) plugin for the Steam Deck (SteamOS 3.x) providing robust, bi-directional save file synchronization for **Non-Steam Games** (Proton/Wine prefixes, Flatpak apps, native Linux games, and emulators).

Standard Steam Cloud synchronization only covers native Steam purchases. Decky Unison bridges this gap by leveraging the mathematical guarantees of the **[Unison File Synchronizer](https://github.com/bcpierce00/unison)** engine. Unison performs true bi-directional synchronization (identifying changes on both local and remote replicas), resolves conflicts based on user rules, preserves file modification timestamps, and creates automatic versioned backup snapshots.

---

## 2. Architecture & Technology Stack

```
┌────────────────────────────────────────────────────────┐
│             SteamOS Quick Access Menu (QAM)            │
│  React 19 / TypeScript / @decky/ui / Gamepad-Optimized │
│  (src/index.tsx, components/, styles.ts, api.ts)       │
└───────────────────────────┬────────────────────────────┘
                            │ Decky callable RPC (WebSocket)
┌───────────────────────────▼────────────────────────────┐
│              Decky Python Plugin Daemon                │
│       Python 3.10+ Async Subprocess Execution          │
│                       (main.py)                        │
├───────────────┬────────────────┬───────────────────────┤
│ GameDetector  │  FileBrowser   │     RemoteManager     │
│ (VDF parser & │ (Safe scanner  │ (SSH keypair, config  │
│  pfx locator) │ & quick-jumps) │  resolver, & pairing) │
├───────────────┴────────────────┴───────────────────────┤
│       ConfigStore (~/.config/decky-unison/config.json) │
├────────────────────────────────┬───────────────────────┤
│         BinaryManager          │      UnisonRunner     │
│   (Static binary downloader,   │ (CLI argument builder │
│    PATH probe, version check)  │  & stream output/rc)  │
└────────────────┬───────────────┴───────────────┬───────┘
                 │ Local File Operations         │
                 ▼                               ▼
       ~/.config/decky-unison/bin/     Local / SSH / Socket
       unison (Static x86_64 ELF)      Sync Targets
```

### Technology Matrix
- **Frontend**: React 19, TypeScript 5.6, Rollup 4, `@decky/ui` (v4.11.0), `@decky/api` (v1.1.3), `react-icons` (v5.3.0).
- **Backend**: Python 3.10+ (Standard Library only — no heavy external dependencies to guarantee compatibility with SteamOS system Python).
- **Core Engine**: Unison File Synchronizer (v2.54.0+ static x86_64 binary).
- **Data Persistence**: `~/.config/decky-unison/config.json` (Profiles, remotes, and history).
- **Testing**: Python `unittest` suite (`tests/test_backend.py`, `tests/test_plugin_e2e.py`).

---

## 3. Directory Structure & File Inventory

```
decky-unison/
├── AGENTS.md                  # This file: Comprehensive technical specification
├── README.md                  # User-facing overview, setup guide, and features
├── package.json               # Node.js dependencies, scripts, and plugin metadata
├── plugin.json                # Decky plugin loader manifest (API v1, flags: ["debug"])
├── rollup.config.js           # Rollup configuration bundling frontend into dist/index.js
├── tsconfig.json              # TypeScript configuration (target: ESNext, JSX: react-jsx)
├── decky.pyi                  # Type definitions for Decky Loader's injected environment
├── main.py                    # Python plugin entrypoint implementing callable RPC methods
│
├── backend/                   # Python backend services
│   ├── __init__.py            # Package initialization
│   ├── binary_manager.py      # Unison binary detection, GitHub API checks, & 1-click install
│   ├── config_store.py        # Settings JSON persistence, schema migrations, profile logic
│   ├── file_browser.py        # Filesystem navigation, permission handling, quick-jumps
│   ├── game_detector.py       # Binary shortcuts.vdf parser & Proton save directory heuristics
│   ├── remote_manager.py      # SSH key management, ~/.ssh/config resolver, socket/SSH probes
│   └── unison_runner.py       # Subprocess executor, CLI flag builder, exit-code & regex parser
│
├── src/                       # Frontend React / TypeScript source code
│   ├── index.tsx              # Plugin lifecycle entrypoint (definePlugin hook)
│   ├── api.ts                 # Type-safe wrapper around @decky/api `callable` functions
│   ├── types.ts               # Shared TypeScript data models and interfaces
│   ├── styles.ts              # Global CSS injection for high-contrast controller focus & chips
│   └── components/            # UI components
│       ├── QuickAccessPanel.tsx   # Main QAM panel (Games & Settings tabs, Sync triggers)
│       ├── GameProfileModal.tsx   # Per-game configuration modal (Folder, Targets, Rules)
│       ├── FileBrowserModal.tsx   # Interactive folder picker with breadcrumbs & quick jumps
│       ├── RemoteConfigModal.tsx  # Remote target setup (SSH, Socket, Local, SSH Pairing)
│       ├── RemoteManagerModal.tsx # Re-export of RemoteConfigModal
│       ├── SSHKeyModal.tsx        # Steam Deck public SSH key display & copy modal
│       └── SyncLogModal.tsx       # Live/historical terminal sync output & diagnostic tips
│
└── tests/                     # Automated test suites
    ├── test_backend.py        # Unit tests for parser, config store, runner, and remote manager
    └── test_plugin_e2e.py     # End-to-end integration test exercising main.py RPC flow
```

---

## 4. Subsystem Details & Technical Implementation

### 4.1. BinaryManager (`backend/binary_manager.py`)
- **Responsibility**: Ensure a working Unison binary exists on the system without requiring user intervention via `pacman` or modifying the read-only SteamOS root filesystem.
- **Lookup Priority**:
  1. `~/.config/decky-unison/bin/unison` (Persistent user installation across SteamOS updates)
  2. `~/.local/bin/unison`
  3. System `PATH` (`shutil.which("unison")`)
  4. `/usr/bin/unison`, `/usr/local/bin/unison`
  5. Plugin directory `bin/unison`
- **Download Flow**:
  - Queries GitHub Releases API (`https://api.github.com/repos/bcpierce00/unison/releases/latest`) with a 15-minute cache.
  - Downloads the official static glibc binary (`unison-<version>-ubuntu-22.04-x86_64-static.tar.gz`).
  - Extracts the archive into a temp folder, identifies the `unison` executable, moves it to `~/.config/decky-unison/bin/unison`, and applies `chmod 0o755`.
  - Fallback: Defaults to stable v2.54.0 if GitHub API rate-limits or is offline.

### 4.2. GameDetector & VDF Parser (`backend/game_detector.py`)
- **Responsibility**: Discover Non-Steam games added to the user's Steam client and locate their Proton save directories.
- **Binary VDF Parser (`parse_vdf_binary`)**:
  - Directly parses Valve's proprietary binary VDF format (`shortcuts.vdf` located at `~/.local/share/Steam/userdata/<account_id>/config/shortcuts.vdf`).
  - Implements byte markers: `0x00` (Map start), `0x01` (Null-terminated string), `0x02` (32-bit LE uint), `0x07` (64-bit uint), `0x08` (Scope terminator).
- **Proton Prefix Scanner**:
  - Calculates compatdata location: `~/.local/share/Steam/steamapps/compatdata/<appid>/pfx/drive_c/users/steamuser/`.
  - Checks if the Proton prefix exists (`compatdata_exists`, `has_proton_prefix`).
- **Save Candidate Discovery (`discover_save_candidates`)**:
  - Scans typical Windows save roots inside the prefix:
    - `AppData/Local`
    - `AppData/Roaming`
    - `Saved Games`
    - `Documents/My Games`
    - `Documents`
  - Heuristically matches directory names against normalized game names, filtering out noise folders (`temp`, `microsoft`, `windows`, `dxvk`, `reshade`, `crashdumps`, etc.).
  - Sorts candidates with `is_recommended` flags first, followed by modification time.

### 4.3. FileBrowser (`backend/file_browser.py`)
- **Responsibility**: Safe, sandbox-conscious directory traversal inside Game Mode.
- **Features**:
  - Resolves symlinks safely and handles `PermissionError` gracefully.
  - Returns directory entries sorted (directories first, then case-insensitive alphabetical).
  - Dynamically builds **Quick Jumps** depending on context:
    - Game-specific jumps: Game AppData Local/Roaming, Saved Games, Documents, Prefix root.
    - Global jumps: `~`, Flatpak apps (`~/.var/app`), Steam compatdata root, and MicroSD card mounts (`/run/media/mmcblk0p1` or `/run/media/deck/*`).

### 4.4. RemoteManager & SSH Subsystem (`backend/remote_manager.py`)
- **Responsibility**: Manage connection endpoints (SSH, TCP Socket, Local directory) and SSH authentication.
- **SSH Keypair Generation**:
  - Maintains a dedicated ed25519 keypair at `~/.config/decky-unison/ssh/id_ed25519`.
  - Created automatically via `ssh-keygen -t ed25519 -N "" -C "decky-unison@steamdeck"`.
  - Permissions strictly enforced to `0o600`.
- **~/.ssh/config Integration**:
  - Automatically parses the user's `~/.ssh/config` file to extract configured Host aliases, HostName, User, Port, and IdentityFile.
  - Allows users to select existing SSH hosts directly in the UI.
- **Fast Pre-Flight Probes**:
  - Performs non-blocking TCP socket check (`probe_tcp`) with a 2-second timeout before initiating any sync or connection test, avoiding lengthy SSH hanging when hosts are offline.
- **One-Click SSH Pairing (`pair_ssh_remote`)**:
  - Allows password-based one-time key distribution using `ssh-copy-id` via a headless `SSH_ASKPASS` helper script, eliminating the need for users to manually copy public keys.

### 4.5. UnisonRunner (`backend/unison_runner.py`)
- **Responsibility**: Formulate CLI arguments and execute the Unison subprocess asynchronously.
- **CLI Flag Construction**:
  - Standard flags: `-batch` (non-interactive), `-auto` (automatically accept non-conflicting actions), `-confirmbigdel=false` (don't block on bulk deletions), `-times` (preserve timestamps).
  - Archive handling: `-ignorearchives` (re-syncs and forces fresh state comparison if archive corrupts).
  - Preference: `-prefer newer`, `-prefer <local>`, or `-prefer <remote>`.
  - Backups: `-backup "Name *"`, `-maxbackups <n>`, `-backuploc local`.
  - Remote Roots:
    - **Local**: `/path/to/folder`
    - **Socket**: `socket://<host>:<port>//<path>`
    - **SSH**: `ssh://[user@]<host>[:port]//<path>` (Note the double-slash syntax required by Unison for absolute remote paths).
- **Output Parsing & Exit Codes**:
  - Exit 0: Success. Checks stdout for `Nothing to do` vs changes.
  - Exit 1: Partial completion or conflict (`<-?->`).
  - Exit 2/3: Non-fatal or fatal error (e.g. root path does not exist, remote unison binary missing).
  - Regex counters: Detects `---->` (upload) and `<----` (download) to provide directional indicators (`↑ 2 up, ↓ 1 down`).

### 4.6. ConfigStore (`backend/config_store.py`)
- **Responsibility**: Store and retrieve settings in `~/.config/decky-unison/config.json`.
- **Multi-Target Architecture**:
  - A single game profile can have multiple sync targets (e.g., "NAS Server", "Desktop Gaming PC", "Cloud VPS").
  - Automatically migrates legacy single-remote profiles to the multi-target structure.
  - Tracks individual sync state, direction, and timestamp per target as well as per profile.
- **History Tracking**: Keeps the last 50 sync operations with full command string, terminal output, and status.

---

## 5. Data Contracts & JSON Schemas

### `config.json` Specification
```json
{
  "remotes": [
    {
      "id": "remote-uuid",
      "name": "Central NAS",
      "type": "ssh",
      "host": "nas.local",
      "port": 22,
      "user": "deck",
      "remote_unison_path": "unison",
      "key_path": ""
    }
  ],
  "profiles": [
    {
      "id": "profile-uuid",
      "app_id": 123456789,
      "game_name": "Game Title",
      "local_path": "/home/deck/.local/share/Steam/steamapps/compatdata/123456789/pfx/drive_c/users/steamuser/AppData/Local/Game",
      "active_target_id": "target-uuid",
      "targets": [
        {
          "id": "target-uuid",
          "remote_id": "remote-uuid",
          "name": "Central NAS",
          "remote_path": "/home/deck/saves/GameTitle",
          "prefer": "newer",
          "backup": true,
          "maxbackups": 5,
          "auto": true,
          "batch": true,
          "confirmbigdel": false,
          "times": true,
          "ignorearchives": false,
          "extra_args": "",
          "last_synced": 1700000000,
          "last_status": "in_sync",
          "last_details": "Replicas in sync",
          "last_direction": "in_sync",
          "last_direction_label": "Replicas in sync"
        }
      ]
    }
  ],
  "history": [
    {
      "profile_id": "profile-uuid",
      "target_id": "target-uuid",
      "target_name": "Central NAS",
      "game_name": "Game Title",
      "status": "in_sync",
      "success": true,
      "files_synced": 0,
      "uploaded": 0,
      "downloaded": 0,
      "direction": "in_sync",
      "direction_label": "Replicas in sync",
      "details": "Replicas in sync",
      "command": "/home/deck/.config/decky-unison/bin/unison ...",
      "raw_output": "...",
      "timestamp": 1700000000
    }
  ]
}
```

---

## 6. Frontend / Backend RPC Interface (`src/api.ts` ↔ `main.py`)

All calls use Decky Loader's `callable<Args, ReturnType>("method_name")`:

| API Callable | Arguments | Returns | Description |
|---|---|---|---|
| `get_unison_status` | `checkUpdate?: boolean` | `UnisonBinaryStatus` | Checks local binary and checks GitHub for updates. |
| `download_unison_binary` | none | `{ success, message, version, path }` | Downloads and installs static Unison release. |
| `get_non_steam_games` | none | `NonSteamGame[]` | Parses shortcuts.vdf and returns non-steam games. |
| `get_save_candidates` | `appId: number, gameName: string` | `SaveCandidate[]` | Scans prefix for probable save directories. |
| `browse_directory` | `path?: string` | `DirectoryListing` | Lists folder contents safely. |
| `get_quick_jumps` | `appId?: number` | `QuickJump[]` | Returns contextual path shortcuts. |
| `get_remotes` | none | `RemoteConfig[]` | Returns all configured remotes. |
| `save_remote` | `remote: RemoteConfig` | `RemoteConfig` | Creates or updates a remote. |
| `delete_remote` | `remoteId: string` | `boolean` | Deletes a remote configuration. |
| `test_remote` | `remoteId: string` | `TestResult` | Runs TCP & SSH/Socket reachability probe. |
| `get_ssh_key` | none | `SSHKeyInfo` | Returns Deck public/private key info. |
| `get_ssh_config_hosts` | none | `SSHConfigHost[]` | Parses ~/.ssh/config for host aliases. |
| `pair_ssh` | `host, user, password, port` | `TestResult` | Installs Deck SSH key on remote server. |
| `get_game_profiles` | none | `GameProfile[]` | Retrieves all game sync profiles. |
| `save_game_profile` | `profile: GameProfile` | `GameProfile` | Creates or updates a game profile. |
| `delete_game_profile` | `profileId: string` | `boolean` | Deletes a game profile. |
| `set_active_target` | `profileId, targetId` | `boolean` | Changes active target for a game. |
| `trigger_sync` | `profileId, targetId?` | `SyncResult` | Executes Unison sync for target. |
| `get_history` | none | `HistoryEntry[]` | Returns recent sync history. |
| `get_latest_sync_log` | `profileId?: string` | `HistoryEntry \| null` | Returns the latest log for a profile. |

---

## 7. Developer & Build Workflows

### Prerequisites
- Node.js (v18+) and `npm`
- Python 3.10+

### Essential Commands
```bash
# 1. Install frontend dependencies
npm install

# 2. Build the frontend bundle (outputs to dist/index.js)
npm run build

# 3. Watch mode for frontend development
npm run watch

# 4. Run automated backend test suite
python3 -m unittest discover -s tests -p "test_*.py" -v
```

### Mocking Decky in Standalone Tests
When running outside of Decky Loader, `main.py` provides an automatic fallback `MockDecky` class that stubs logging and environment directories, allowing full test coverage without needing a live Steam Deck or Decky environment.

---

## 8. Operating Principles & Critical Invariants

1. **Read-Only Rootfs Safety**: Never install software via `pacman` or write to `/usr/` or system paths. Always install user binaries to `~/.config/decky-unison/bin/` so they persist through SteamOS system updates.
2. **Unison Remote Path Formatting**:
   - For SSH and Socket paths, Unison requires an initial slash or double-slash to signify absolute paths (e.g. `ssh://user@host//home/user/saves`). Single slash paths are treated as relative to the user's remote home directory (`ssh://user@host/saves`).
   - Windows drive paths on remote servers must use double-slash syntax (e.g. `ssh://user@host//C:/Saves`).
3. **Gamepad Navigation First**:
   - Every interactive element in `@decky/ui` must be focusable using standard D-pad / thumbstick controls.
   - Use `.decky-unison-btn`, `.decky-unison-btn-compact`, and `.decky-unison-chip` classes with proper high-contrast `:focus` and `.gpfocus` styling (`src/styles.ts`).
4. **Non-Blocking Execution**:
   - Never run synchronous blocking I/O or sleep calls on the main thread in `main.py`.
   - Long-running network and CLI tasks must be run via `asyncio.create_subprocess_exec` or `asyncio.to_thread`.
5. **Save Corruption Prevention**:
   - By default, always keep `-backup "Name *"`, `-maxbackups 5`, and `-times` enabled to ensure versioned snapshots before file replacement and accurate timestamp-based synchronization.
