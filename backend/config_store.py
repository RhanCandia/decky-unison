import os
import json
import uuid
import time
from typing import Dict, Any, List, Optional

class ConfigStore:
    def __init__(self, settings_dir: str):
        self.settings_dir = settings_dir
        self.config_path = os.path.join(self.settings_dir, "config.json")
        os.makedirs(self.settings_dir, exist_ok=True)
        self.data: Dict[str, Any] = self._load()

    def _default_config(self) -> Dict[str, Any]:
        return {
            "remotes": [
                {
                    "id": "default-server",
                    "name": "Central Server",
                    "type": "ssh",
                    "host": "",
                    "port": 22,
                    "user": "",
                    "remote_unison_path": "unison",
                    "key_path": ""
                }
            ],
            "profiles": [],
            "history": []
        }

    def _load(self) -> Dict[str, Any]:
        if os.path.exists(self.config_path):
            try:
                with open(self.config_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    defaults = self._default_config()
                    for k, v in defaults.items():
                        if k not in data:
                            data[k] = v
                    return data
            except Exception as e:
                print(f"[DeckyUnison] Failed to load config: {e}")
        return self._default_config()

    def save(self):
        try:
            with open(self.config_path, "w", encoding="utf-8") as f:
                json.dump(self.data, f, indent=2)
        except Exception as e:
            print(f"[DeckyUnison] Failed to save config: {e}")

    # Remotes
    def get_remotes(self) -> List[Dict[str, Any]]:
        return self.data.get("remotes", [])

    def save_remote(self, remote: Dict[str, Any]) -> Dict[str, Any]:
        remotes = self.data.setdefault("remotes", [])
        remote_id = remote.get("id")
        if not remote_id:
            remote["id"] = str(uuid.uuid4())
            remotes.append(remote)
        else:
            for idx, r in enumerate(remotes):
                if r.get("id") == remote_id:
                    remotes[idx] = remote
                    break
            else:
                remotes.append(remote)
        self.save()
        return remote

    def delete_remote(self, remote_id: str) -> bool:
        remotes = self.data.get("remotes", [])
        new_remotes = [r for r in remotes if r.get("id") != remote_id]
        if len(new_remotes) != len(remotes):
            self.data["remotes"] = new_remotes
            self.save()
            return True
        return False

    def get_remote_by_id(self, remote_id: str) -> Optional[Dict[str, Any]]:
        for r in self.get_remotes():
            if r.get("id") == remote_id:
                return r
        return None

    # Profiles (Per-game Unison configurations)
    def get_profiles(self) -> List[Dict[str, Any]]:
        return self.data.get("profiles", [])

    def get_profile_by_id(self, profile_id: str) -> Optional[Dict[str, Any]]:
        for p in self.get_profiles():
            if p.get("id") == profile_id:
                return p
        return None

    def get_profile_by_app_id(self, app_id: int) -> Optional[Dict[str, Any]]:
        for p in self.get_profiles():
            if p.get("app_id") == app_id:
                return p
        return None

    def save_profile(self, profile: Dict[str, Any]) -> Dict[str, Any]:
        profiles = self.data.setdefault("profiles", [])
        profile_id = profile.get("id")
        if not profile_id:
            profile["id"] = str(uuid.uuid4())
            # Default options if not provided
            profile.setdefault("prefer", "newer")
            profile.setdefault("backup", True)
            profile.setdefault("maxbackups", 5)
            profile.setdefault("auto", True)
            profile.setdefault("batch", True)
            profile.setdefault("confirmbigdel", False)
            profile.setdefault("times", True)
            profile.setdefault("extra_args", "")
            profile.setdefault("last_synced", None)
            profile.setdefault("last_status", None)
            profiles.append(profile)
        else:
            for idx, p in enumerate(profiles):
                if p.get("id") == profile_id:
                    # Preserve last_synced and last_status if not explicitly in payload
                    if "last_synced" not in profile:
                        profile["last_synced"] = p.get("last_synced")
                    if "last_status" not in profile:
                        profile["last_status"] = p.get("last_status")
                    profiles[idx] = profile
                    break
            else:
                profiles.append(profile)
        self.save()
        return profile

    def update_profile_status(self, profile_id: str, status: str, details: str):
        for p in self.get_profiles():
            if p.get("id") == profile_id:
                p["last_synced"] = int(time.time())
                p["last_status"] = status
                p["last_details"] = details
                break
        self.save()

    def delete_profile(self, profile_id: str) -> bool:
        profiles = self.data.get("profiles", [])
        new_profiles = [p for p in profiles if p.get("id") != profile_id]
        if len(new_profiles) != len(profiles):
            self.data["profiles"] = new_profiles
            self.save()
            return True
        return False

    # Sync History
    def add_history_entry(self, entry: Dict[str, Any]):
        history = self.data.setdefault("history", [])
        entry["timestamp"] = int(time.time())
        history.insert(0, entry)
        # Keep latest 50 entries
        self.data["history"] = history[:50]
        self.save()

    def get_history(self) -> List[Dict[str, Any]]:
        return self.data.get("history", [])
