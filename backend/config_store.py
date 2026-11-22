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
    def _normalize_profile(self, p: Dict[str, Any]) -> Dict[str, Any]:
        targets = p.get("targets")
        if not isinstance(targets, list) or len(targets) == 0:
            target_id = str(uuid.uuid4())
            remote_id = p.get("remote_id", "")
            remote_name = ""
            for r in self.get_remotes():
                if r.get("id") == remote_id:
                    remote_name = r.get("name", "")
                    break
            target = {
                "id": target_id,
                "remote_id": remote_id,
                "name": remote_name or "Default Remote",
                "remote_path": p.get("remote_path", ""),
                "prefer": p.get("prefer", "newer"),
                "backup": p.get("backup", True),
                "maxbackups": p.get("maxbackups", 5),
                "auto": p.get("auto", True),
                "batch": p.get("batch", True),
                "confirmbigdel": p.get("confirmbigdel", False),
                "times": p.get("times", True),
                "ignorearchives": p.get("ignorearchives", False),
                "extra_args": p.get("extra_args", ""),
                "last_synced": p.get("last_synced"),
                "last_status": p.get("last_status"),
                "last_details": p.get("last_details"),
                "last_direction": p.get("last_direction"),
                "last_direction_label": p.get("last_direction_label"),
            }
            p["targets"] = [target]
            p["active_target_id"] = target_id
        else:
            for t in targets:
                if not t.get("id"):
                    t["id"] = str(uuid.uuid4())
            if not p.get("active_target_id") or not any(t.get("id") == p.get("active_target_id") for t in targets):
                p["active_target_id"] = targets[0]["id"]
        return p

    def get_profiles(self) -> List[Dict[str, Any]]:
        profiles = self.data.get("profiles", [])
        for p in profiles:
            self._normalize_profile(p)
        return profiles

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

    def set_active_target(self, profile_id: str, target_id: str) -> bool:
        for p in self.get_profiles():
            if p.get("id") == profile_id:
                targets = p.get("targets", [])
                target = next((t for t in targets if t.get("id") == target_id), None)
                if target:
                    p["active_target_id"] = target_id
                    # synchronize legacy fields with active target
                    p["remote_id"] = target.get("remote_id")
                    p["remote_path"] = target.get("remote_path")
                    p["prefer"] = target.get("prefer", "newer")
                    p["backup"] = target.get("backup", True)
                    p["maxbackups"] = target.get("maxbackups", 5)
                    p["auto"] = target.get("auto", True)
                    p["batch"] = target.get("batch", True)
                    p["confirmbigdel"] = target.get("confirmbigdel", False)
                    p["times"] = target.get("times", True)
                    p["ignorearchives"] = target.get("ignorearchives", False)
                    p["extra_args"] = target.get("extra_args", "")
                    p["last_synced"] = target.get("last_synced")
                    p["last_status"] = target.get("last_status")
                    p["last_details"] = target.get("last_details")
                    p["last_direction"] = target.get("last_direction")
                    p["last_direction_label"] = target.get("last_direction_label")
                    self.save()
                    return True
        return False

    def save_profile(self, profile: Dict[str, Any]) -> Dict[str, Any]:
        profiles = self.data.setdefault("profiles", [])
        profile_id = profile.get("id")
        self._normalize_profile(profile)

        # Synchronize legacy root fields with active target
        active_id = profile.get("active_target_id")
        targets = profile.get("targets", [])
        active_target = next((t for t in targets if t.get("id") == active_id), targets[0] if targets else None)
        if active_target:
            profile["remote_id"] = active_target.get("remote_id")
            profile["remote_path"] = active_target.get("remote_path")
            profile["prefer"] = active_target.get("prefer", "newer")
            profile["backup"] = active_target.get("backup", True)
            profile["maxbackups"] = active_target.get("maxbackups", 5)
            profile["auto"] = active_target.get("auto", True)
            profile["batch"] = active_target.get("batch", True)
            profile["confirmbigdel"] = active_target.get("confirmbigdel", False)
            profile["times"] = active_target.get("times", True)
            profile["ignorearchives"] = active_target.get("ignorearchives", False)
            profile["extra_args"] = active_target.get("extra_args", "")
            if "last_synced" not in profile or profile["last_synced"] is None:
                profile["last_synced"] = active_target.get("last_synced")
            if "last_status" not in profile or profile["last_status"] is None:
                profile["last_status"] = active_target.get("last_status")

        if not profile_id:
            profile["id"] = str(uuid.uuid4())
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

    def update_profile_status(
        self,
        profile_id: str,
        status: str,
        details: str,
        direction: str = "",
        direction_label: str = "",
        target_id: Optional[str] = None
    ):
        now = int(time.time())
        for p in self.get_profiles():
            if p.get("id") == profile_id:
                p["last_synced"] = now
                p["last_status"] = status
                p["last_details"] = details
                p["last_direction"] = direction
                p["last_direction_label"] = direction_label
                tid = target_id or p.get("active_target_id")
                for t in p.get("targets", []):
                    if t.get("id") == tid:
                        t["last_synced"] = now
                        t["last_status"] = status
                        t["last_details"] = details
                        t["last_direction"] = direction
                        t["last_direction_label"] = direction_label
                        break
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

    def get_latest_sync_log(self, profile_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        history = self.get_history()
        if not history:
            return None
        if profile_id:
            for item in history:
                if item.get("profile_id") == profile_id:
                    return item
        return history[0]
