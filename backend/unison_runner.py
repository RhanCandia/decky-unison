import os
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
        bundled = os.path.join(self.plugin_dir, "bin", "unison")
        if os.path.isfile(bundled) and os.access(bundled, os.X_OK):
            return bundled

        system_unison = "/usr/bin/unison"
        if os.path.isfile(system_unison) and os.access(system_unison, os.X_OK):
            return system_unison

        return bundled

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
        local_abs = os.path.abspath(local_path)

        # Construct Remote Root
        remote_type = remote_config.get("type", "ssh")
        if remote_type == "local":
            remote_root = os.path.abspath(remote_path)
        elif remote_type == "socket":
            host = remote_config.get("host", "").strip()
            port = remote_config.get("port", 26867)
            # Unison socket syntax: socket://host:port//absolute/path
            remote_root = f"socket://{host}:{port}/{remote_path}"
        else:  # ssh
            user = remote_config.get("user", "").strip()
            host = remote_config.get("host", "").strip()
            user_host = f"{user}@{host}" if user else host
            # Unison ssh syntax: ssh://user@host//path or ssh://user@host:port//path
            port = remote_config.get("port", 22)
            remote_root = f"ssh://{user_host}:{port}/{remote_path}" if port != 22 else f"ssh://{user_host}/{remote_path}"

        args = [
            self.bin_path,
            local_abs,
            remote_root,
            "-batch" if opts.get("batch", True) else "-batch=false",
            "-auto" if opts.get("auto", True) else "-auto=false",
            f"-confirmbigdel={str(opts.get('confirmbigdel', False)).lower()}",
            "-times" if opts.get("times", True) else "-times=false",
        ]

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

            files_synced = 0
            has_conflict = False
            is_nothing_to_do = "Nothing to do" in stdout or "replicas have not changed" in stdout

            for line in stdout.splitlines():
                if "<-?->" in line or "conflict:" in line.lower():
                    has_conflict = True
                if ("<----" in line or "---->" in line) and "Updating" in line:
                    files_synced += 1

            if proc.returncode == 0:
                return {
                    "success": True,
                    "status": "in_sync" if is_nothing_to_do else "updated",
                    "files_synced": files_synced,
                    "details": "Replicas are in sync (no changes)" if is_nothing_to_do else f"Synced {files_synced} file(s) successfully.",
                    "raw_output": combined_output.strip()
                }
            elif proc.returncode == 1:
                return {
                    "success": not has_conflict,
                    "status": "conflict" if has_conflict else "partial_error",
                    "files_synced": files_synced,
                    "details": "Conflict detected during synchronization." if has_conflict else "Some files skipped during sync.",
                    "raw_output": combined_output.strip()
                }
            else:
                return {
                    "success": False,
                    "status": "error",
                    "files_synced": 0,
                    "details": f"Unison exited with code {proc.returncode}.",
                    "raw_output": combined_output.strip()
                }

        except Exception as e:
            return {
                "success": False,
                "status": "error",
                "files_synced": 0,
                "details": f"Failed to execute Unison: {str(e)}",
                "raw_output": ""
            }
