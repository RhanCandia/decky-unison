import os
import sys
import asyncio
from typing import Dict, Any, List, Optional

# Ensure backend directory is in python sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from backend.game_detector import GameDetector
from backend.file_browser import FileBrowser
from backend.remote_manager import RemoteManager
from backend.unison_runner import UnisonRunner
from backend.config_store import ConfigStore

# Mock or import decky loader module
try:
    import decky
except ImportError:
    class MockDecky:
        DECKY_PLUGIN_DIR = CURRENT_DIR
        DECKY_USER_HOME = os.path.expanduser("~")
        DECKY_PLUGIN_SETTINGS_DIR = os.path.join(DECKY_USER_HOME, ".config", "decky-unison")
        DECKY_PLUGIN_LOG_DIR = os.path.join(DECKY_USER_HOME, ".config", "decky-unison", "logs")
        class logger:
            @staticmethod
            def info(msg: str): print(f"[INFO] {msg}")
            @staticmethod
            def error(msg: str): print(f"[ERROR] {msg}")
            @staticmethod
            def warning(msg: str): print(f"[WARN] {msg}")
        @staticmethod
        async def emit(event: str, *args):
            print(f"[DeckyEmit] {event}: {args}")
    decky = MockDecky()

class Plugin:
    def __init__(self, settings_dir: Optional[str] = None, user_home: Optional[str] = None):
        self._custom_settings_dir = settings_dir
        self._custom_user_home = user_home

    async def _main(self):
        self.loop = asyncio.get_event_loop()
        self.settings_dir = self._custom_settings_dir or decky.DECKY_PLUGIN_SETTINGS_DIR
        self.plugin_dir = decky.DECKY_PLUGIN_DIR
        self.user_home = self._custom_user_home or decky.DECKY_USER_HOME

        os.makedirs(self.settings_dir, exist_ok=True)

        self.config_store = ConfigStore(self.settings_dir)
        self.game_detector = GameDetector(self.user_home)
        self.file_browser = FileBrowser(self.user_home)
        self.remote_manager = RemoteManager(self.settings_dir, self.user_home)
        self.unison_runner = UnisonRunner(self.plugin_dir, self.settings_dir, self.user_home)

        decky.logger.info("Decky Unison backend initialized.")

    async def _unload(self):
        decky.logger.info("Decky Unison unloaded.")

    # 1. Non-Steam Game Detection
    async def get_non_steam_games(self) -> List[Dict[str, Any]]:
        return self.game_detector.get_non_steam_games()

    async def get_save_candidates(self, app_id: int, game_name: str) -> List[Dict[str, Any]]:
        return self.game_detector.discover_save_candidates(app_id, game_name)

    # 2. Filesystem Browsing
    async def browse_directory(self, path: Optional[str] = None) -> Dict[str, Any]:
        return self.file_browser.list_directory(path)

    async def get_quick_jumps(self, app_id: Optional[int] = None) -> List[Dict[str, str]]:
        return self.file_browser.get_quick_jumps(app_id)

    # 3. Remote Management
    async def get_remotes(self) -> List[Dict[str, Any]]:
        return self.config_store.get_remotes()

    async def save_remote(self, remote: Dict[str, Any]) -> Dict[str, Any]:
        return self.config_store.save_remote(remote)

    async def delete_remote(self, remote_id: str) -> bool:
        return self.config_store.delete_remote(remote_id)

    async def test_remote(self, remote_id: str) -> Dict[str, Any]:
        remote = self.config_store.get_remote_by_id(remote_id)
        if not remote:
            return {"success": False, "message": "Remote not found"}
        return self.remote_manager.test_remote_connection(remote)

    async def get_ssh_key(self) -> Dict[str, str]:
        return self.remote_manager.ensure_ssh_key()

    async def get_ssh_config_hosts(self) -> List[Dict[str, Any]]:
        return self.remote_manager.get_ssh_config_hosts()

    # 4. Game Profiles (Per-game Unison Config)
    async def get_game_profiles(self) -> List[Dict[str, Any]]:
        return self.config_store.get_profiles()

    async def save_game_profile(self, profile: Dict[str, Any]) -> Dict[str, Any]:
        return self.config_store.save_profile(profile)

    async def delete_game_profile(self, profile_id: str) -> bool:
        return self.config_store.delete_profile(profile_id)

    # 5. Manual Sync Execution
    async def trigger_sync(self, profile_id: str) -> Dict[str, Any]:
        profile = self.config_store.get_profile_by_id(profile_id)
        if not profile:
            return {"success": False, "message": f"Profile {profile_id} not found"}

        remote_id = profile.get("remote_id")
        remote = self.config_store.get_remote_by_id(remote_id)
        if not remote:
            return {"success": False, "message": f"Remote {remote_id} not found for this game"}

        local_path = profile.get("local_path", "").strip()
        remote_path = profile.get("remote_path", "").strip()

        if not local_path or not remote_path:
            return {"success": False, "message": "Local path and remote path must be specified"}

        # Pre-flight reachability check
        if remote.get("type") in ("ssh", "socket"):
            host = remote.get("host", "").strip()
            user = remote.get("user", "").strip()
            port = int(remote.get("port", 22 if remote.get("type") == "ssh" else 26867))
            key_path = remote.get("key_path", "").strip()

            if remote.get("type") == "ssh":
                resolved = self.remote_manager.resolve_ssh_host(host, user, port, key_path)
                probe_host = resolved["target_host"]
                probe_port = resolved["port"]
            else:
                probe_host = host
                probe_port = port

            if not self.remote_manager.probe_tcp(probe_host, probe_port, timeout=2.0):
                err_msg = f"Cannot reach {probe_host}:{probe_port}. Is the server online and on the same network?"
                self.config_store.update_profile_status(profile_id, "error", err_msg)
                return {"success": False, "message": err_msg}

        ssh_key_info = self.remote_manager.ensure_ssh_key()
        ssh_key = remote.get("key_path") or ssh_key_info["private_key_path"]

        # Run Unison sync
        res = await self.unison_runner.run_sync(
            local_path=local_path,
            remote_config=remote,
            remote_path=remote_path,
            options=profile,
            ssh_key_path=ssh_key
        )

        status = res.get("status", "error")
        details = res.get("details", "")
        self.config_store.update_profile_status(profile_id, status, details)

        # Log to history
        self.config_store.add_history_entry({
            "profile_id": profile_id,
            "game_name": profile.get("game_name", "Game"),
            "status": status,
            "success": res.get("success", False),
            "files_synced": res.get("files_synced", 0),
            "details": details,
            "command": res.get("command", ""),
            "raw_output": res.get("raw_output", "")
        })

        return res

    # 6. History & Logs
    async def get_history(self) -> List[Dict[str, Any]]:
        return self.config_store.get_history()

    async def get_latest_sync_log(self, profile_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        return self.config_store.get_latest_sync_log(profile_id)
