import os
import shutil
import asyncio
import re
import shlex
from typing import Dict, Any, List, Optional

class UnisonRunner:
    def __init__(self, plugin_dir: str, settings_dir: str, user_home: Optional[str] = None):
        self.plugin_dir = plugin_dir
        self.settings_dir = settings_dir
        self.user_home = os.path.abspath(user_home or os.path.expanduser("~"))
        self.user_ssh_config = os.path.join(self.user_home, ".ssh", "config")
        self.unison_dir = os.path.join(self.settings_dir, "unison")
        os.makedirs(self.unison_dir, exist_ok=True)
        self.bin_path = self._locate_unison_binary()

    def _locate_unison_binary(self) -> str:
        candidates = [
            os.path.join(self.settings_dir, "bin", "unison"),
            os.path.join(self.user_home, ".local", "bin", "unison"),
            shutil.which("unison") or "",
            "/usr/bin/unison",
            "/usr/local/bin/unison",
            os.path.join(self.plugin_dir, "bin", "unison"),
        ]

        for p in candidates:
            if p and os.path.isfile(p) and os.access(p, os.X_OK):
                return os.path.abspath(p)

        return ""

    def build_unison_args(
        self,
        local_path: str,
        remote_config: Dict[str, Any],
        remote_path: str,
        options: Optional[Dict[str, Any]] = None,
        ssh_key_path: Optional[str] = None
    ) -> List[str]:
        """
        Builds the complete CLI argument list for Unison execution.
        """
        opts = options or {}
        local_abs = os.path.abspath(os.path.expanduser(local_path))

        # Construct Remote Root
        remote_type = remote_config.get("type", "ssh")
        clean_remote_path = remote_path.strip()

        if remote_type == "local":
            remote_root = os.path.abspath(os.path.expanduser(clean_remote_path))
        elif remote_type == "socket":
            host = remote_config.get("host", "").strip()
            port = remote_config.get("port", 26867)
            if clean_remote_path.startswith("~/"):
                clean_remote_path = clean_remote_path[2:]
            path_part = "/" + clean_remote_path if clean_remote_path.startswith("/") else "//" + clean_remote_path
            remote_root = f"socket://{host}:{port}{path_part}"
        else:  # ssh
            user = remote_config.get("user", "").strip()
            host = remote_config.get("host", "").strip()
            user_host = f"{user}@{host}" if user else host
            port = remote_config.get("port", 22)

            # Expand ~/ if user is known, otherwise strip ~ for relative home path
            if clean_remote_path.startswith("~/"):
                if user:
                    clean_remote_path = f"/home/{user}/{clean_remote_path[2:]}"
                else:
                    clean_remote_path = clean_remote_path[2:]

            # Unison SSH Syntax:
            # Absolute path /foo becomes ssh://host//foo (two slashes)
            # Windows drive C:/foo becomes ssh://host//C:/foo
            # Relative path foo becomes ssh://host/foo (one slash)
            if clean_remote_path.startswith("/"):
                path_part = "/" + clean_remote_path
            elif len(clean_remote_path) >= 2 and clean_remote_path[1] == ":":
                path_part = "//" + clean_remote_path
            else:
                path_part = "/" + clean_remote_path

            if port != 22:
                remote_root = f"ssh://{user_host}:{port}{path_part}"
            else:
                remote_root = f"ssh://{user_host}{path_part}"

        bin_exec = self._locate_unison_binary() or self.bin_path or "unison"
        args = [
            bin_exec,
            local_abs,
            remote_root,
            "-batch" if opts.get("batch", True) else "-batch=false",
            "-auto" if opts.get("auto", True) else "-auto=false",
            f"-confirmbigdel={str(opts.get('confirmbigdel', False)).lower()}",
            "-times" if opts.get("times", True) else "-times=false",
        ]

        # Ignore archive files (bypass archive mismatch or force initial state regeneration)
        if opts.get("ignorearchives", False):
            args.append("-ignorearchives")

        # Conflict resolution preference
        prefer = opts.get("prefer", "newer")
        if prefer == "root1":
            args.extend(["-prefer", local_abs])
        elif prefer == "root2":
            args.extend(["-prefer", remote_root])
        elif prefer == "newer":
            args.extend(["-prefer", "newer"])

        # Versioned backup protection
        if opts.get("backup", True):
            max_backups = int(opts.get("maxbackups", 5))
            args.extend([
                "-backup", "Name *",
                "-maxbackups", str(max_backups),
                "-backuploc", "local"
            ])

        # SSH arguments
        if remote_type == "ssh":
            port = remote_config.get("port", 22)
            key = ssh_key_path or remote_config.get("key_path", "")
            ssh_flags = [
                "-o StrictHostKeyChecking=accept-new",
                "-o BatchMode=yes",
                "-o ConnectTimeout=10"
            ]

            # Use user's ~/.ssh/config if available
            if os.path.isfile(self.user_ssh_config):
                ssh_flags.insert(0, f"-F {self.user_ssh_config}")

            if port != 22:
                ssh_flags.append(f"-p {port}")
            if key and os.path.exists(key):
                ssh_flags.append(f"-i {key}")

            remote_unison = remote_config.get("remote_unison_path")
            if remote_unison:
                args.extend(["-servercmd", remote_unison])

            args.extend(["-sshargs", " ".join(ssh_flags)])

        # Additional user-specified CLI flags
        extra_args = opts.get("extra_args", "").strip()
        if extra_args:
            args.extend(shlex.split(extra_args))

        return args

    async def run_sync(
        self,
        local_path: str,
        remote_config: Dict[str, Any],
        remote_path: str,
        options: Optional[Dict[str, Any]] = None,
        ssh_key_path: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Executes Unison asynchronously and streams/parses the output.
        """
        if not os.path.exists(local_path):
            try:
                os.makedirs(local_path, exist_ok=True)
            except Exception as e:
                return {
                    "success": False,
                    "status": "error",
                    "files_synced": 0,
                    "details": f"Local path does not exist and could not be created: {e}",
                    "raw_output": ""
                }

        bin_exec = self._locate_unison_binary() or self.bin_path
        if not bin_exec or not os.path.isfile(bin_exec) or not os.access(bin_exec, os.X_OK):
            return {
                "success": False,
                "status": "error",
                "files_synced": 0,
                "details": "Unison binary is not installed. Please download it from the top banner.",
                "command": "",
                "raw_output": "Unison executable not found."
            }

        cmd = self.build_unison_args(local_path, remote_config, remote_path, options, ssh_key_path)

        env = dict(os.environ)
        env["UNISON"] = self.unison_dir

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                env=env,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            stdout_bytes, stderr_bytes = await proc.communicate()
            stdout = stdout_bytes.decode("utf-8", errors="replace")
            stderr = stderr_bytes.decode("utf-8", errors="replace")
            combined_output = stdout + "\n" + stderr

            # Unison return codes:
            # 0: Successful synchronization; everything is up to date
            # 1: Some files were skipped due to conflicts or errors during transfer
            # 2: Non-fatal failure (e.g. roots not found)
            # 3: Fatal error

            uploaded_count = 0
            downloaded_count = 0
            has_conflict = False
            is_nothing_to_do = "Nothing to do" in stdout or "replicas have not changed" in stdout

            for line in stdout.splitlines():
                if "<-?->" in line or "conflict:" in line.lower():
                    has_conflict = True
                if "---->" in line:
                    uploaded_count += 1
                elif "<----" in line:
                    downloaded_count += 1

            files_synced = uploaded_count + downloaded_count

            if uploaded_count > 0 and downloaded_count > 0:
                direction = "bidirectional"
                direction_label = f"↑ {uploaded_count} up, ↓ {downloaded_count} down"
            elif uploaded_count > 0:
                direction = "upload"
                direction_label = f"↑ Uploaded {uploaded_count} file(s)"
            elif downloaded_count > 0:
                direction = "download"
                direction_label = f"↓ Downloaded {downloaded_count} file(s)"
            else:
                direction = "in_sync"
                direction_label = "Replicas in sync"

            cmd_str = " ".join(cmd)

            if proc.returncode == 0:
                return {
                    "success": True,
                    "status": "in_sync" if is_nothing_to_do else "updated",
                    "files_synced": files_synced,
                    "uploaded": uploaded_count,
                    "downloaded": downloaded_count,
                    "direction": direction,
                    "direction_label": direction_label,
                    "details": direction_label,
                    "command": cmd_str,
                    "raw_output": combined_output.strip()
                }
            elif proc.returncode == 1:
                return {
                    "success": not has_conflict,
                    "status": "conflict" if has_conflict else "partial_error",
                    "files_synced": files_synced,
                    "uploaded": uploaded_count,
                    "downloaded": downloaded_count,
                    "direction": "conflict" if has_conflict else direction,
                    "direction_label": "Conflict detected" if has_conflict else direction_label,
                    "details": "Conflict detected during synchronization." if has_conflict else "Some files skipped during sync.",
                    "command": cmd_str,
                    "raw_output": combined_output.strip()
                }
            else:
                return {
                    "success": False,
                    "status": "error",
                    "files_synced": 0,
                    "uploaded": 0,
                    "downloaded": 0,
                    "direction": "error",
                    "direction_label": f"Exit code {proc.returncode}",
                    "details": f"Unison exited with code {proc.returncode}.",
                    "command": cmd_str,
                    "raw_output": combined_output.strip()
                }

        except Exception as e:
            return {
                "success": False,
                "status": "error",
                "files_synced": 0,
                "details": f"Failed to execute Unison: {str(e)}",
                "command": " ".join(cmd),
                "raw_output": str(e)
            }
