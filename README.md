# Decky Unison 🔄

**Decky Unison** is a [Decky Loader](https://deckbrew.xyz/) plugin for the Steam Deck designed to provide bi-directional file synchronization for save games—with special focus on **Non-Steam Games** (Proton/Wine and emulators).

It leverages **[Unison File Synchronizer](https://github.com/bcpierce00/unison)** to synchronize save directories between your Steam Deck and a centralized server (NAS/VPS/PC), as well as local network devices or mounted shares.

---

## ✨ Features

- **🎯 Non-Steam Game Discovery**: Automatically parses Steam's `shortcuts.vdf` to list installed Non-Steam games and their Proton `compatdata` directories.
- **📁 Integrated Save File Browser**: In-plugin folder browser to select your save directories with quick-jump shortcuts (`AppData/Local`, `Documents/My Games`, `Saved Games`, `Flatpaks`).
- **🛡️ Versioned Save Protection**: Automatically preserves timestamped backup snapshots (`-backup "Name *"`, `-maxbackups 5`) before overwriting files to prevent save corruption.
- **🕹️ On-Demand Manual Sync**: Single-click manual sync per game or globally right from Steam Deck Game Mode's Quick Access Menu (QAM).
- **🌐 Central Server & Peer Device Support**:
  - **SSH Transport**: Connect to any Linux or Windows server / PC via SSH with automated `ed25519` key generation.
  - **Socket Mode**: Connect directly to `socket://host:port` without SSH overhead (ideal for Tailscale/WireGuard or local LAN).
  - **Local / Mount Mode**: Sync against mounted SMB/NFS/rclone shares.
- **⚙️ Unison CLI Toggles**: Customize conflict resolution policies (`prefer = newer | deck | remote`), `-batch`, `-auto`, `-confirmbigdel`, `-times`, and custom flags.
- **📦 Zero-Dependency Bundling**: Bundles official standalone static `unison` v2.54.0 binaries for SteamOS x86_64.

---

## 🏗️ Architecture

```
decky-unison/
├── bin/
│   ├── unison               # Bundled static x86_64 Unison binary (v2.54.0)
│   └── unison-fsmonitor     # Bundled filesystem monitor helper
├── backend/
│   ├── game_detector.py     # Binary VDF parser & Proton compatdata save scanner
│   ├── file_browser.py      # Safe directory traversal & quick jumps
│   ├── unison_runner.py     # Async Unison execution, argument parsing, & streaming
│   ├── remote_manager.py    # Remote server configuration & SSH key generation
│   └── config_store.py      # Profile & remote persistence (~/.config/decky-unison)
├── src/
│   ├── components/
│   │   ├── QuickAccessPanel.tsx    # Primary QAM Decky panel
│   │   ├── GameProfileModal.tsx    # Per-game Unison initialization & CLI options
│   │   ├── FileBrowserModal.tsx    # Interactive save folder browser
│   │   └── RemoteManagerModal.tsx  # Central server & SSH key setup
│   ├── api.ts              # Decky callable RPC definitions
│   ├── types.ts            # TypeScript data contracts
│   └── index.tsx           # Plugin entrypoint
├── tests/                  # Unit and integration test suite
├── main.py                 # Decky Python plugin service
├── package.json
└── plugin.json
```

---

## 🚀 Getting Started

### 1. Setting Up Your Central Server / Remote PC

Ensure **Unison v2.54.0** is installed on your remote server or PC:
- **Windows**: Run `winget install bcpierce00.unison` or download from [Unison Releases](https://github.com/bcpierce00/unison/releases).
- **Linux (Server / NAS)**: Download the official static binary or install via package manager.
- **macOS**: `brew install unison`.

#### Authentication (SSH)
1. Open **Decky Unison** in Game Mode on your Steam Deck.
2. Click **Manage Remotes & SSH Key**.
3. Copy the generated **Steam Deck Public SSH Key**.
4. Add the key to `~/.ssh/authorized_keys` on your central server:
   ```bash
   echo "<deck_public_key>" >> ~/.ssh/authorized_keys
   ```
5. Click **Test Connection** in the plugin to verify reachability.

---

### 2. Initializing Unison for a Game

1. In the Quick Access Menu, scroll to **Non-Steam Games Detected**.
2. Click **Initialize** on the desired game.
3. If detected, click one of the suggested save paths (e.g. `Documents / My Games: GameName`), or click **Browse...** to pick the folder.
4. Set the **Remote Destination Directory** (e.g. `~/saves/GameName`).
5. (Optional) Expand **Show Unison CLI Toggles** to fine-tune conflict rules or backup count.
6. Click **Save Configuration**.
7. Click **Sync Now** to perform your first synchronization!

---

## 🛠️ Development & Building

### Prerequisites
- Node.js v18+ and `pnpm`
- Python 3.10+

### Build Frontend
```bash
pnpm install
pnpm run build
```

### Run Tests
```bash
python3 -m unittest discover -s tests -p "test_*.py" -v
```

### Deploy to Steam Deck
Copy the plugin folder to your Steam Deck's Decky plugins directory:
```bash
rsync -avz --exclude 'node_modules' --exclude '.git' ./ deck@<steam-deck-ip>:~/homebrew/plugins/decky-unison/
```
Then restart Decky Loader:
```bash
sudo systemctl restart plugin_loader
```

---

## 📄 License
This project is licensed under the [BSD-3-Clause License](LICENSE).
