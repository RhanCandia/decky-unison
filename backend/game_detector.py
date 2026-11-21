import os
import glob
import struct
from typing import List, Dict, Any, Optional

def parse_vdf_binary(data: bytes) -> Dict[str, Any]:
    """
    Parses Steam's binary VDF format (used in shortcuts.vdf).
    Format specification:
    0x00: Map start (null-terminated string key, followed by map entries until 0x08)
    0x01: String (null-terminated string key, null-terminated UTF-8 value)
    0x02: Int32 (null-terminated string key, 4 bytes little-endian uint32)
    0x08: End of map / structure
    """
    i = 0
    length = len(data)

    def parse_dict() -> Dict[str, Any]:
        nonlocal i
        result: Dict[str, Any] = {}
        while i < length:
            type_byte = data[i]
            i += 1
            if type_byte == 8:  # End of object
                return result

            # Read null-terminated string key
            key_end = data.find(b"\x00", i)
            if key_end == -1:
                break
            key = data[i:key_end].decode("utf-8", errors="ignore")
            i = key_end + 1

            if type_byte == 0:  # Child dictionary
                result[key] = parse_dict()
            elif type_byte == 1:  # String value
                val_end = data.find(b"\x00", i)
                if val_end == -1:
                    break
                val = data[i:val_end].decode("utf-8", errors="ignore")
                i = val_end + 1
                result[key] = val
            elif type_byte == 2:  # 32-bit unsigned/signed int
                if i + 4 > length:
                    break
                val = struct.unpack("<I", data[i:i+4])[0]
                i += 4
                result[key] = val
            elif type_byte == 7:  # 64-bit int (present in some newer VDFs)
                if i + 8 > length:
                    break
                val = struct.unpack("<Q", data[i:i+8])[0]
                i += 8
                result[key] = val
            else:
                # Unknown type byte, safely stop parsing this scope
                break
        return result

    return parse_dict()

class GameDetector:
    def __init__(self, steam_user_home: Optional[str] = None):
        self.user_home = steam_user_home or os.path.expanduser("~")
        self.steam_base = os.path.join(self.user_home, ".local", "share", "Steam")
        if not os.path.isdir(self.steam_base):
            alt_path = os.path.join(self.user_home, ".steam", "steam")
            if os.path.isdir(alt_path):
                self.steam_base = alt_path

    def get_shortcuts_vdf_files(self) -> List[str]:
        pattern = os.path.join(self.steam_base, "userdata", "*", "config", "shortcuts.vdf")
        return glob.glob(pattern)

    def get_compatdata_dir(self, app_id: int) -> str:
        return os.path.join(self.steam_base, "steamapps", "compatdata", str(app_id))

    def get_non_steam_games(self) -> List[Dict[str, Any]]:
        games: List[Dict[str, Any]] = []
        seen_ids = set()

        for vdf_path in self.get_shortcuts_vdf_files():
            try:
                with open(vdf_path, "rb") as f:
                    data = f.read()
                parsed = parse_vdf_binary(data)
                shortcuts = parsed.get("shortcuts", {})
                for idx, entry in shortcuts.items():
                    app_id = entry.get("appid")
                    if app_id is None:
                        continue
                    if app_id in seen_ids:
                        continue
                    seen_ids.add(app_id)

                    app_name = entry.get("AppName", f"Non-Steam Game {app_id}")
                    compat_dir = self.get_compatdata_dir(app_id)
                    compat_exists = os.path.isdir(compat_dir)

                    pfx_users = os.path.join(compat_dir, "pfx", "drive_c", "users", "steamuser")
                    has_pfx = os.path.isdir(pfx_users)

                    games.append({
                        "app_id": app_id,
                        "name": app_name,
                        "exe": entry.get("exe", entry.get("Exe", "")),
                        "start_dir": entry.get("StartDir", ""),
                        "compatdata_path": compat_dir,
                        "compatdata_exists": compat_exists,
                        "has_proton_prefix": has_pfx,
                        "pfx_user_dir": pfx_users if has_pfx else None
                    })
            except Exception as e:
                print(f"[DeckyUnison] Error parsing {vdf_path}: {e}")

        # Sort alphabetically by game name
        games.sort(key=lambda g: g["name"].lower())
        return games

    def discover_save_candidates(self, app_id: int, game_name: str) -> List[Dict[str, Any]]:
        """
        Discovers candidate save directories within the Proton prefix for a given game.
        """
        candidates: List[Dict[str, Any]] = []
        compat_dir = self.get_compatdata_dir(app_id)
        pfx_user = os.path.join(compat_dir, "pfx", "drive_c", "users", "steamuser")

        if not os.path.isdir(pfx_user):
            return candidates

        # Check standard Wine / Windows save folders
        search_roots = [
            ("AppData Local", os.path.join(pfx_user, "AppData", "Local")),
            ("AppData Roaming", os.path.join(pfx_user, "AppData", "Roaming")),
            ("Saved Games", os.path.join(pfx_user, "Saved Games")),
            ("Documents / My Games", os.path.join(pfx_user, "Documents", "My Games")),
            ("Documents", os.path.join(pfx_user, "Documents")),
        ]

        normalized_game_name = "".join(c for c in game_name.lower() if c.isalnum())

        ignored_folders = {
            "temp", "microsoft", "windows", "dxvk", "reshade", "crashdumps",
            "ceftemp", "cef", "downloads", "music", "pictures", "videos", "templates", "favorites", "searches", "links", "contacts"
        }

        for label, root_path in search_roots:
            if not os.path.isdir(root_path):
                continue

            try:
                for entry in os.scandir(root_path):
                    if entry.is_dir():
                        folder_lower = entry.name.lower()
                        if folder_lower in ignored_folders:
                            continue
                        entry_norm = "".join(c for c in folder_lower if c.isalnum())
                        # Check if folder name is similar to game name
                        is_match = (
                            normalized_game_name in entry_norm or
                            entry_norm in normalized_game_name or
                            (len(normalized_game_name) > 3 and normalized_game_name[:4] in entry_norm)
                        )
                        stat = entry.stat()
                        candidates.append({
                            "label": f"{label}: {entry.name}",
                            "path": entry.path,
                            "folder_name": entry.name,
                            "category": label,
                            "is_recommended": is_match,
                            "mtime": int(stat.st_mtime)
                        })
            except Exception:
                continue

        # Sort: recommended first, then by most recently modified
        candidates.sort(key=lambda c: (c["is_recommended"], c["mtime"]), reverse=True)
        return candidates
