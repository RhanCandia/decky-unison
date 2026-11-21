import os
import socket
import subprocess
from typing import Dict, Any, List, Optional

def parse_ssh_config_file(config_path: str, user_home: str) -> Dict[str, Dict[str, Any]]:
    """
    Parses ~/.ssh/config to extract Host definitions, HostName, User, Port, and IdentityFile.
    """
    if not os.path.isfile(config_path):
        return {}

    hosts: Dict[str, Dict[str, Any]] = {}
    current_hosts: List[str] = []

    try:
        with open(config_path, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue

                parts = line.split(None, 1)
                if len(parts) < 2:
                    continue

                key = parts[0].lower()
                val = parts[1].strip()

                if key == "host":
                    # Ignore wildcard-only hosts like "Host *"
                    current_hosts = [h for h in val.split() if "*" not in h and "?" not in h]
                    for h in current_hosts:
                        if h not in hosts:
                            hosts[h] = {"alias": h}
                elif current_hosts:
                    for h in current_hosts:
                        if key == "hostname":
                            hosts[h]["hostname"] = val
                        elif key == "port":
                            try:
                                hosts[h]["port"] = int(val)
                            except ValueError:
                                pass
                        elif key == "user":
                            hosts[h]["user"] = val
                        elif key == "identityfile":
                            # Expand ~ to actual user_home
                            expanded = val.replace("~", user_home).replace("%d", user_home)
                            hosts[h]["identityfile"] = expanded
    except Exception as e:
        print(f"[DeckyUnison] Error reading ssh config: {e}")

    return hosts

class RemoteManager:
    def __init__(self, settings_dir: str, user_home: Optional[str] = None):
        self.settings_dir = settings_dir
        self.user_home = os.path.abspath(user_home or os.path.expanduser("~"))
        self.ssh_dir = os.path.join(self.settings_dir, "ssh")
        self.private_key_path = os.path.join(self.ssh_dir, "id_ed25519")
        self.public_key_path = os.path.join(self.ssh_dir, "id_ed25519.pub")
        self.user_ssh_config = os.path.join(self.user_home, ".ssh", "config")
        os.makedirs(self.ssh_dir, exist_ok=True)

    def get_ssh_config_hosts(self) -> List[Dict[str, Any]]:
        """
        Returns list of configured hosts from ~/.ssh/config.
        """
        parsed = parse_ssh_config_file(self.user_ssh_config, self.user_home)
        return list(parsed.values())

    def resolve_ssh_host(
        self,
        host: str,
        user: Optional[str] = None,
        port: Optional[int] = None,
        key_path: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Resolves host connection details by cross-referencing ~/.ssh/config.
        """
        parsed = parse_ssh_config_file(self.user_ssh_config, self.user_home)
        cfg = parsed.get(host, {})

        effective_host = cfg.get("hostname") or host
        effective_user = user or cfg.get("user") or ""
        effective_port = port if (port and port != 22) else (cfg.get("port") or 22)
        effective_key = key_path or cfg.get("identityfile") or ""

        return {
            "alias": host,
            "target_host": effective_host,
            "user": effective_user,
            "port": effective_port,
            "key_path": effective_key,
            "has_ssh_config": bool(cfg)
        }

    def ensure_ssh_key(self) -> Dict[str, str]:
        """
        Ensures an ed25519 SSH keypair exists for Decky Unison.
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
        Fast TCP connectivity probe to check if remote endpoint is reachable.
        """
        try:
            with socket.create_connection((host, int(port)), timeout=timeout):
                return True
        except (socket.timeout, ConnectionRefusedError, OSError):
            return False

    def test_remote_connection(self, remote: Dict[str, Any]) -> Dict[str, Any]:
        """
        Tests connectivity to a remote configuration (Socket, SSH, or Local).
        Fully respects ~/.ssh/config hosts, ports, users, and identities.
        """
        remote_type = remote.get("type", "ssh")

        if remote_type == "local":
            path = remote.get("local_path", "")
            exists = os.path.isdir(path)
            return {
                "success": exists,
                "message": f"Path {'exists' if exists else 'not found'}: {path}"
            }

        input_host = remote.get("host", "").strip()
        if not input_host:
            return {"success": False, "message": "Host is required"}

        input_user = remote.get("user", "").strip()
        input_port = int(remote.get("port", 22 if remote_type == "ssh" else 26867))
        input_key = remote.get("key_path", "").strip()

        # Resolve against ~/.ssh/config
        resolved = self.resolve_ssh_host(input_host, input_user, input_port, input_key)
        target_ip_or_host = resolved["target_host"]
        target_port = resolved["port"]
        target_user = resolved["user"]
        target_key = resolved["key_path"]

        # Step 1: TCP Port probe on resolved target
        if not self.probe_tcp(target_ip_or_host, target_port):
            return {
                "success": False,
                "message": f"Could not reach {target_ip_or_host}:{target_port} (Connection timed out or refused)"
            }

        if remote_type == "socket":
            return {
                "success": True,
                "message": f"Successfully connected to Unison socket on {target_ip_or_host}:{target_port}"
            }

        # Step 2: SSH Handshake probe
        if remote_type == "ssh":
            ssh_cmd = ["ssh"]

            # Use user's ~/.ssh/config if it exists
            if os.path.isfile(self.user_ssh_config):
                ssh_cmd.extend(["-F", self.user_ssh_config])

            # Identity: use target_key, or default generated key
            if target_key and os.path.exists(target_key):
                ssh_cmd.extend(["-i", target_key])
            elif not resolved["has_ssh_config"]:
                key_info = self.ensure_ssh_key()
                if os.path.exists(key_info["private_key_path"]):
                    ssh_cmd.extend(["-i", key_info["private_key_path"]])

            if target_port != 22:
                ssh_cmd.extend(["-p", str(target_port)])

            ssh_cmd.extend([
                "-o", "BatchMode=yes",
                "-o", "StrictHostKeyChecking=accept-new",
                "-o", "ConnectTimeout=5",
            ])

            target_spec = f"{target_user}@{input_host}" if target_user else input_host
            remote_unison = remote.get("remote_unison_path") or "unison"
            probe_cmd = f"echo decky_unison_ok && ({remote_unison} -version 2>&1 || echo NO_UNISON_FOUND)"
            ssh_cmd.extend([target_spec, probe_cmd])

            try:
                proc = subprocess.run(
                    ssh_cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    timeout=7
                )
                if proc.returncode == 0 and "decky_unison_ok" in proc.stdout:
                    info_note = f" (via ~/.ssh/config alias '{input_host}')" if resolved["has_ssh_config"] else ""
                    out = proc.stdout
                    if "unison version" in out:
                        ver = [l.strip() for l in out.splitlines() if "unison version" in l][0]
                        return {
                            "success": True,
                            "message": f"Connected! Remote has {ver}{info_note}"
                        }
                    elif "NO_UNISON_FOUND" in out or "not found" in out or "is not recognized" in out:
                        return {
                            "success": False,
                            "message": f"SSH connected{info_note}, but '{remote_unison}' was NOT found on remote server. Please ensure Unison is installed on the remote machine or specify its full path in 'Remote Unison Executable'."
                        }
                    else:
                        return {
                            "success": True,
                            "message": f"SSH connection to {target_spec}:{target_port}{info_note} succeeded!"
                        }
                else:
                    err = proc.stderr.strip() or "SSH authentication failed (check ~/.ssh/config or authorized_keys)"
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
