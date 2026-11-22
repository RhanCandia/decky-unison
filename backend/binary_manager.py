import os
import re
import shutil
import tarfile
import tempfile
import asyncio
import json
import time
import urllib.request
from typing import Dict, Any, Optional, Tuple

DEFAULT_STABLE_VERSION = "2.54.0"
DEFAULT_DOWNLOAD_URL = "https://github.com/bcpierce00/unison/releases/download/v2.54.0/unison-2.54.0-ubuntu-22.04-x86_64-static.tar.gz"
GITHUB_LATEST_RELEASE_API = "https://api.github.com/repos/bcpierce00/unison/releases/latest"

class BinaryManager:
    def __init__(self, settings_dir: str, plugin_dir: str, user_home: Optional[str] = None):
        self.settings_dir = settings_dir
        self.plugin_dir = plugin_dir
        self.user_home = os.path.abspath(user_home or os.path.expanduser("~"))
        self.bin_dir = os.path.join(self.settings_dir, "bin")
        os.makedirs(self.bin_dir, exist_ok=True)

        self._cached_status: Optional[Dict[str, Any]] = None
        self._cached_latest_version: Optional[str] = None
        self._cached_download_url: Optional[str] = None
        self._last_update_check_time: float = 0

    def locate_binary(self) -> Optional[str]:
        """
        Locates the Unison binary in candidate paths:
        1. settings_dir/bin/unison (user downloaded binary)
        2. user_home/.local/bin/unison
        3. system PATH / which unison
        4. /usr/bin/unison, /usr/local/bin/unison
        5. plugin_dir/bin/unison (fallback/dev mode)
        """
        candidates = [
            os.path.join(self.bin_dir, "unison"),
            os.path.join(self.user_home, ".local", "bin", "unison"),
            shutil.which("unison") or "",
            "/usr/bin/unison",
            "/usr/local/bin/unison",
            os.path.join(self.plugin_dir, "bin", "unison")
        ]

        for p in candidates:
            if p and os.path.isfile(p) and os.access(p, os.X_OK):
                return os.path.abspath(p)

        return None

    def _parse_version(self, version_str: str) -> Tuple[int, ...]:
        """
        Parses a semver-like version string into a comparable tuple of ints.
        """
        m = re.findall(r"\d+", version_str)
        return tuple(int(x) for x in m) if m else (0,)

    def _fetch_latest_release_sync(self) -> Tuple[str, str]:
        """
        Queries GitHub API for the latest stable release and static binary asset.
        Falls back to known stable default if network/API is unavailable.
        """
        now = time.time()
        # Return cached version if checked within the last 15 minutes
        if self._cached_latest_version and (now - self._last_update_check_time < 900):
            return self._cached_latest_version, self._cached_download_url or DEFAULT_DOWNLOAD_URL

        latest_version = DEFAULT_STABLE_VERSION
        download_url = DEFAULT_DOWNLOAD_URL

        try:
            req = urllib.request.Request(
                GITHUB_LATEST_RELEASE_API,
                headers={"User-Agent": "Decky-Unison-Plugin"}
            )
            with urllib.request.urlopen(req, timeout=5) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode("utf-8"))
                    tag = data.get("tag_name", "").lstrip("v").strip()
                    if tag:
                        latest_version = tag
                    for asset in data.get("assets", []):
                        name = asset.get("name", "")
                        if "ubuntu" in name and "x86_64-static" in name:
                            download_url = asset.get("browser_download_url", download_url)
                            break
        except Exception as e:
            # Fallback gracefully to default stable constants
            print(f"[DeckyUnison] Notice: Could not query latest release from GitHub ({e}), using default v{DEFAULT_STABLE_VERSION}")

        self._cached_latest_version = latest_version
        self._cached_download_url = download_url
        self._last_update_check_time = now
        return latest_version, download_url

    async def check_binary_status(self, force_update_check: bool = False) -> Dict[str, Any]:
        """
        Checks if Unison is installed and executable, retrieves its version,
        and determines if an update is available.
        """
        bin_path = self.locate_binary()
        if not bin_path:
            latest_version, _ = await asyncio.to_thread(self._fetch_latest_release_sync)
            return {
                "installed": False,
                "path": "",
                "version": "",
                "version_details": "",
                "latest_version": latest_version,
                "update_available": False,
                "error": "Unison binary not found."
            }

        # Check version by running unison -version
        version_str = ""
        version_details = ""
        try:
            proc = await asyncio.create_subprocess_exec(
                bin_path,
                "-version",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout_bytes, _ = await asyncio.wait_for(proc.communicate(), timeout=3.0)
            raw = stdout_bytes.decode("utf-8", errors="replace").strip()
            version_details = raw
            m = re.search(r"unison\s+version\s+([0-9]+(?:\.[0-9]+)+)", raw, re.IGNORECASE)
            if m:
                version_str = m.group(1)
        except Exception as e:
            version_details = f"Failed to execute {bin_path}: {e}"

        latest_ver = self._cached_latest_version or DEFAULT_STABLE_VERSION
        if force_update_check or not self._cached_latest_version:
            latest_ver, _ = await asyncio.to_thread(self._fetch_latest_release_sync)

        installed_tuple = self._parse_version(version_str)
        latest_tuple = self._parse_version(latest_ver)
        update_available = bool(version_str and latest_tuple > installed_tuple)

        status = {
            "installed": True,
            "path": bin_path,
            "version": version_str,
            "version_details": version_details,
            "latest_version": latest_ver,
            "update_available": update_available,
            "error": None
        }
        self._cached_status = status
        return status

    async def download_and_install_binary(self) -> Dict[str, Any]:
        """
        Downloads official static Linux x86_64 Unison tarball, unpacks unison
        and unison-fsmonitor into settings_dir/bin, and validates execution.
        """
        latest_version, download_url = await asyncio.to_thread(self._fetch_latest_release_sync)
        os.makedirs(self.bin_dir, exist_ok=True)

        def _download_and_extract() -> Tuple[bool, str]:
            temp_tar = None
            try:
                temp_tar = tempfile.NamedTemporaryFile(suffix=".tar.gz", delete=False)
                temp_tar.close()

                req = urllib.request.Request(
                    download_url,
                    headers={"User-Agent": "Decky-Unison-Plugin"}
                )
                with urllib.request.urlopen(req, timeout=30) as response, open(temp_tar.name, "wb") as out_file:
                    shutil.copyfileobj(response, out_file)

                # Extract binaries
                with tarfile.open(temp_tar.name, "r:gz") as tar:
                    found_unison = False
                    for member in tar.getmembers():
                        base_name = os.path.basename(member.name)
                        if base_name in ("unison", "unison-fsmonitor") and member.isfile():
                            target_path = os.path.join(self.bin_dir, base_name)
                            f = tar.extractfile(member)
                            if f:
                                with open(target_path, "wb") as dest:
                                    shutil.copyfileobj(f, dest)
                                os.chmod(target_path, 0o755)
                                if base_name == "unison":
                                    found_unison = True

                    if not found_unison:
                        return False, "Archive did not contain the 'unison' executable."

                return True, "Installation successful."
            except Exception as e:
                return False, f"Download failed: {str(e)}"
            finally:
                if temp_tar and os.path.exists(temp_tar.name):
                    try:
                        os.unlink(temp_tar.name)
                    except OSError:
                        pass

        success, msg = await asyncio.to_thread(_download_and_extract)
        if not success:
            return {
                "success": False,
                "message": msg
            }

        # Verify freshly installed binary
        new_status = await self.check_binary_status(force_update_check=True)
        if new_status.get("installed"):
            return {
                "success": True,
                "message": f"Successfully installed Unison v{new_status.get('version') or latest_version}.",
                "version": new_status.get("version"),
                "path": new_status.get("path")
            }
        else:
            return {
                "success": False,
                "message": "Unison binary was extracted but could not be verified.",
                "details": new_status.get("version_details")
            }
