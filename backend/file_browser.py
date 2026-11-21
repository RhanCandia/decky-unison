import os
from typing import Dict, Any, List, Optional

class FileBrowser:
    def __init__(self, user_home: Optional[str] = None):
        self.user_home = os.path.abspath(user_home or os.path.expanduser("~"))

    def list_directory(self, target_path: Optional[str] = None) -> Dict[str, Any]:
        """
        Lists directory entries safely, returning folders and files with metadata.
        """
        if not target_path or not os.path.exists(target_path):
            target_path = self.user_home

        target_path = os.path.abspath(target_path)
        if not os.path.isdir(target_path):
            target_path = os.path.dirname(target_path)

        parent_path = os.path.dirname(target_path) if target_path != "/" else None

        entries: List[Dict[str, Any]] = []
        try:
            with os.scandir(target_path) as it:
                for item in it:
                    try:
                        stat = item.stat(follow_symlinks=False)
                        entries.append({
                            "name": item.name,
                            "path": item.path,
                            "is_dir": item.is_dir(follow_symlinks=True),
                            "size": stat.st_size if not item.is_dir() else 0,
                            "mtime": int(stat.st_mtime),
                            "is_hidden": item.name.startswith(".")
                        })
                    except Exception:
                        continue
        except PermissionError:
            return {
                "error": "Permission denied",
                "current_path": target_path,
                "parent_path": parent_path,
                "entries": []
            }
        except Exception as e:
            return {
                "error": str(e),
                "current_path": target_path,
                "parent_path": parent_path,
                "entries": []
            }

        # Sort: directories first, then alphabetically
        entries.sort(key=lambda e: (not e["is_dir"], e["name"].lower()))

        return {
            "current_path": target_path,
            "parent_path": parent_path,
            "entries": entries
        }

    def get_quick_jumps(self, app_id: Optional[int] = None) -> List[Dict[str, str]]:
        """
        Returns quick-jump shortcuts for the file browser, tailored to Steam Deck paths.
        """
        jumps: List[Dict[str, str]] = []

        # If a specific game is selected, add its Proton directories
        if app_id:
            steam_base = os.path.join(self.user_home, ".local", "share", "Steam")
            compat_user = os.path.join(steam_base, "steamapps", "compatdata", str(app_id), "pfx", "drive_c", "users", "steamuser")
            if os.path.isdir(compat_user):
                jumps.append({
                    "name": "Game: AppData Local",
                    "path": os.path.join(compat_user, "AppData", "Local")
                })
                jumps.append({
                    "name": "Game: AppData Roaming",
                    "path": os.path.join(compat_user, "AppData", "Roaming")
                })
                jumps.append({
                    "name": "Game: Saved Games",
                    "path": os.path.join(compat_user, "Saved Games")
                })
                jumps.append({
                    "name": "Game: Documents",
                    "path": os.path.join(compat_user, "Documents")
                })
                jumps.append({
                    "name": "Game: Proton Prefix Root",
                    "path": compat_user
                })

        # General shortcuts
        jumps.append({
            "name": "Home Directory",
            "path": self.user_home
        })

        # Emulation / Flatpak common dirs
        var_app = os.path.join(self.user_home, ".var", "app")
        if os.path.isdir(var_app):
            jumps.append({
                "name": "Flatpak Apps (.var/app)",
                "path": var_app
            })

        # Steam compatdata root
        compat_root = os.path.join(self.user_home, ".local", "share", "Steam", "steamapps", "compatdata")
        if os.path.isdir(compat_root):
            jumps.append({
                "name": "Steam Compatdata Root",
                "path": compat_root
            })

        # SD Card mount points on SteamOS
        sd_paths = ["/run/media/mmcblk0p1", f"/run/media/{os.environ.get('USER', 'deck')}"]
        for p in sd_paths:
            if os.path.exists(p):
                jumps.append({
                    "name": "MicroSD Card",
                    "path": p
                })
                break

        # Filter out jumps that don't exist
        return [j for j in jumps if os.path.exists(j["path"])]
