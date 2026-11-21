import os
import socket
import subprocess
from typing import Dict, Any, List, Optional

class RemoteManager:
    def __init__(self, settings_dir: str):
        self.settings_dir = settings_dir
        self.ssh_dir = os.path.join(self.settings_dir, "ssh")
        self.private_key_path = os.path.join(self.ssh_dir, "id_ed25519")
        self.public_key_path = os.path.join(self.ssh_dir, "id_ed25519.pub")
        os.makedirs(self.ssh_dir, exist_ok=True)

    def ensure_ssh_key(self) -> Dict[str, str]:
        """
        Ensures an ed25519 SSH keypair exists for Decky Unison.
        Generates one if not already present.
        """
        if not os.path.exists(self.private_key_path) or not os.path.exists(self.public_key_path):
            try:
                cmd = [
                    "ssh-keygen",
                    "-t", "ed25519",
                    "-N", "",
                    "-C", "decky-unison@steamdeck",
                    "-f", self.private_key_path
                ]
                subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                os.chmod(self.private_key_path, 0o600)
            except Exception as e:
                print(f"[DeckyUnison] Failed to generate SSH key: {e}")

        pub_key = ""
        if os.path.exists(self.public_key_path):
            try:
                with open(self.public_key_path, "r") as f:
                    pub_key = f.read().strip()
            except Exception as e:
                print(f"[DeckyUnison] Failed to read public SSH key: {e}")

        return {
            "private_key_path": self.private_key_path,
            "public_key_path": self.public_key_path,
            "public_key": pub_key
        }

    def probe_tcp(self, host: str, port: int, timeout: float = 2.0) -> bool:
        """
        Fast TCP connectivity probe to check if remote endpoint is awake and listening.
        """
        try:
            with socket.create_connection((host, int(port)), timeout=timeout):
                return True
        except (socket.timeout, ConnectionRefusedError, OSError):
            return False

    def test_remote_connection(self, remote: Dict[str, Any]) -> Dict[str, Any]:
        """
        Tests connectivity to a remote configuration (Socket, SSH, or Local).
        """
        remote_type = remote.get("type", "ssh")

        if remote_type == "local":
            path = remote.get("local_path", "")
            exists = os.path.isdir(path)
            return {
                "success": exists,
                "message": f"Path {'exists' if exists else 'not found'}: {path}"
            }

        host = remote.get("host", "").strip()
        port = int(remote.get("port", 22 if remote_type == "ssh" else 26867))

        if not host:
            return {"success": False, "message": "Host is required"}

        # Step 1: TCP Port probe
        if not self.probe_tcp(host, port):
            return {
                "success": False,
                "message": f"Could not reach {host}:{port} (Connection timed out or refused)"
            }

        if remote_type == "socket":
            return {
                "success": True,
                "message": f"Successfully connected to Unison socket on {host}:{port}"
            }

        # Step 2: SSH Handshake probe
        if remote_type == "ssh":
            user = remote.get("user", "").strip()
            key_info = self.ensure_ssh_key()
            ssh_key = remote.get("key_path") or key_info["private_key_path"]

            ssh_cmd = [
                "ssh",
                "-i", ssh_key,
                "-p", str(port),
                "-o", "BatchMode=yes",
                "-o", "StrictHostKeyChecking=accept-new",
                "-o", "ConnectTimeout=5",
                f"{user}@{host}" if user else host,
                "echo decky_unison_ok"
            ]

            try:
                proc = subprocess.run(
                    ssh_cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    timeout=6
                )
                if proc.returncode == 0 and "decky_unison_ok" in proc.stdout:
                    return {
                        "success": True,
                        "message": f"SSH connection to {user}@{host}:{port} succeeded!"
                    }
                else:
                    err = proc.stderr.strip() or "SSH authentication failed (check authorized_keys)"
                    return {
                        "success": False,
                        "message": f"SSH reachable, but auth failed: {err}"
                    }
            except subprocess.TimeoutExpired:
                return {
                    "success": False,
                    "message": "SSH probe timed out waiting for authentication response."
                }
            except Exception as e:
                return {
                    "success": False,
                    "message": f"SSH probe error: {str(e)}"
                }

        return {"success": False, "message": f"Unknown remote type {remote_type}"}
