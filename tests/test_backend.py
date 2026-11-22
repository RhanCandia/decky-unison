import unittest
import os
import shutil
import tempfile
import asyncio
from backend.game_detector import GameDetector, parse_vdf_binary
from backend.file_browser import FileBrowser
from backend.config_store import ConfigStore
from backend.remote_manager import RemoteManager
from backend.unison_runner import UnisonRunner
from backend.binary_manager import BinaryManager

class TestDeckyUnisonBackend(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.settings_dir = os.path.join(self.test_dir, "settings")
        self.plugin_dir = os.path.join(self.test_dir, "plugin")
        os.makedirs(self.settings_dir, exist_ok=True)
        os.makedirs(self.plugin_dir, exist_ok=True)

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_vdf_binary_parser(self):
        # Create a small valid binary VDF structure
        # Key "shortcuts" (dict) -> "0" (dict) -> "AppName" (str: "TestGame"), "appid" (int32: 123456)
        import struct
        data = bytearray()
        data.append(0) # dict shortcuts
        data.extend(b"shortcuts\x00")
        data.append(0) # dict "0"
        data.extend(b"0\x00")
        data.append(1) # str "AppName"
        data.extend(b"AppName\x00TestGame\x00")
        data.append(2) # int32 "appid"
        data.extend(b"appid\x00")
        data.extend(struct.pack("<I", 123456))
        data.append(8) # end of "0"
        data.append(8) # end of shortcuts

        res = parse_vdf_binary(bytes(data))
        self.assertIn("shortcuts", res)
        self.assertIn("0", res["shortcuts"])
        self.assertEqual(res["shortcuts"]["0"]["AppName"], "TestGame")
        self.assertEqual(res["shortcuts"]["0"]["appid"], 123456)

    def test_file_browser(self):
        fb = FileBrowser(self.test_dir)
        sub = os.path.join(self.test_dir, "my_save_folder")
        os.makedirs(sub, exist_ok=True)
        with open(os.path.join(sub, "save.dat"), "w") as f:
            f.write("save_data")

        res = fb.list_directory(sub)
        self.assertFalse(res.get("error"))
        self.assertEqual(res["current_path"], os.path.abspath(sub))
        self.assertEqual(len(res["entries"]), 1)
        self.assertEqual(res["entries"][0]["name"], "save.dat")
        self.assertFalse(res["entries"][0]["is_dir"])

    def test_config_store(self):
        store = ConfigStore(self.settings_dir)
        remotes = store.get_remotes()
        self.assertTrue(len(remotes) >= 1)

        # Save new remote
        new_remote = {
            "name": "NAS Server",
            "type": "ssh",
            "host": "192.168.1.100",
            "port": 2222,
            "user": "deck"
        }
        saved_remote = store.save_remote(new_remote)
        self.assertIsNotNone(saved_remote.get("id"))

        # Save profile
        profile = {
            "game_name": "Elden Ring",
            "app_id": 999999,
            "local_path": "/tmp/local_save",
            "remote_id": saved_remote["id"],
            "remote_path": "~/saves/elden_ring",
            "prefer": "newer",
            "backup": True
        }
        saved_prof = store.save_profile(profile)
        self.assertIsNotNone(saved_prof.get("id"))

        # Verify retrieval
        retrieved = store.get_profile_by_id(saved_prof["id"])
        self.assertEqual(retrieved["game_name"], "Elden Ring")
        self.assertEqual(retrieved["prefer"], "newer")
        self.assertTrue(len(retrieved["targets"]) >= 1)
        self.assertEqual(retrieved["active_target_id"], retrieved["targets"][0]["id"])

        # Multi-target configuration
        second_remote = store.save_remote({
            "name": "Desktop PC",
            "type": "ssh",
            "host": "192.168.1.101",
            "port": 22,
            "user": "gamer"
        })

        retrieved["targets"].append({
            "id": "target-desktop",
            "remote_id": second_remote["id"],
            "name": "Desktop PC",
            "remote_path": "C:/Saves/elden_ring",
            "prefer": "root1"
        })
        updated_prof = store.save_profile(retrieved)
        self.assertEqual(len(updated_prof["targets"]), 2)

        # Switch active target
        switch_ok = store.set_active_target(updated_prof["id"], "target-desktop")
        self.assertTrue(switch_ok)
        rechecked = store.get_profile_by_id(updated_prof["id"])
        self.assertEqual(rechecked["active_target_id"], "target-desktop")
        self.assertEqual(rechecked["remote_id"], second_remote["id"])
        self.assertEqual(rechecked["remote_path"], "C:/Saves/elden_ring")

        # Update status for target
        store.update_profile_status(
            updated_prof["id"],
            status="in_sync",
            details="All files identical",
            direction="in_sync",
            direction_label="In sync",
            target_id="target-desktop"
        )
        status_check = store.get_profile_by_id(updated_prof["id"])
        self.assertEqual(status_check["last_status"], "in_sync")
        target_desktop = next(t for t in status_check["targets"] if t["id"] == "target-desktop")
        self.assertEqual(target_desktop["last_status"], "in_sync")

    def test_unison_runner_argument_building(self):
        runner = UnisonRunner(self.plugin_dir, self.settings_dir)
        remote_ssh = {
            "type": "ssh",
            "host": "server.local",
            "port": 22,
            "user": "deck",
            "remote_unison_path": "/usr/local/bin/unison"
        }
        options = {
            "prefer": "newer",
            "backup": True,
            "maxbackups": 3,
            "confirmbigdel": False,
            "extra_args": "-ignore 'Name *.tmp'"
        }

        args = runner.build_unison_args(
            local_path="/home/deck/save",
            remote_config=remote_ssh,
            remote_path="saves/game",
            options=options,
            ssh_key_path="/tmp/key"
        )

        args_str = " ".join(args)
        self.assertIn("-prefer newer", args_str)
        self.assertIn("-backup Name *", args_str)
        self.assertIn("-maxbackups 3", args_str)
        self.assertIn("-confirmbigdel=false", args_str)
        self.assertIn("ssh://deck@server.local/saves/game", args_str)
        self.assertIn("-servercmd /usr/local/bin/unison", args_str)
        self.assertIn("-ignore Name *.tmp", args_str)

        # Test ignorearchives option
        ignore_args = runner.build_unison_args(
            local_path="/home/deck/save",
            remote_config=remote_ssh,
            remote_path="/var/saves/game",
            options={"ignorearchives": True}
        )
        self.assertIn("-ignorearchives", " ".join(ignore_args))

        # Test absolute path formatting
        abs_args = runner.build_unison_args(
            local_path="/home/deck/save",
            remote_config=remote_ssh,
            remote_path="/var/saves/game",
            options=options
        )
        self.assertIn("ssh://deck@server.local//var/saves/game", " ".join(abs_args))

        # Test ~/ expansion with user
        tilde_args = runner.build_unison_args(
            local_path="/home/deck/save",
            remote_config=remote_ssh,
            remote_path="~/saves/game",
            options=options
        )
        self.assertIn("ssh://deck@server.local//home/deck/saves/game", " ".join(tilde_args))

    def test_ssh_config_parsing_and_resolution(self):
        ssh_config_path = os.path.join(self.test_dir, ".ssh", "config")
        os.makedirs(os.path.dirname(ssh_config_path), exist_ok=True)
        with open(ssh_config_path, "w") as f:
            f.write("""
Host myserver
    HostName 192.168.1.88
    User gamesync
    Port 2222
    IdentityFile ~/.ssh/id_custom
""")
        rm = RemoteManager(self.settings_dir, user_home=self.test_dir)
        hosts = rm.get_ssh_config_hosts()
        self.assertEqual(len(hosts), 1)
        self.assertEqual(hosts[0]["alias"], "myserver")
        self.assertEqual(hosts[0]["hostname"], "192.168.1.88")
        self.assertEqual(hosts[0]["user"], "gamesync")
        self.assertEqual(hosts[0]["port"], 2222)
        self.assertEqual(hosts[0]["identityfile"], os.path.join(self.test_dir, ".ssh", "id_custom"))

        # Test resolution
        resolved = rm.resolve_ssh_host("myserver")
        self.assertEqual(resolved["target_host"], "192.168.1.88")
        self.assertEqual(resolved["port"], 2222)
        self.assertEqual(resolved["user"], "gamesync")
        self.assertEqual(resolved["key_path"], os.path.join(self.test_dir, ".ssh", "id_custom"))

    def test_local_unison_sync_execution(self):
        # Create two test replica directories
        replica_a = os.path.join(self.test_dir, "replica_a")
        replica_b = os.path.join(self.test_dir, "replica_b")
        os.makedirs(replica_a, exist_ok=True)
        os.makedirs(replica_b, exist_ok=True)

        with open(os.path.join(replica_a, "game.sav"), "w") as f:
            f.write("version 1")

        runner = UnisonRunner(os.path.abspath("."), self.settings_dir)
        # Use bundled binary if available, or system binary
        if not os.path.exists(runner.bin_path):
            bundled = os.path.abspath("bin/unison")
            if os.path.exists(bundled):
                runner.bin_path = bundled

        remote_local = {
            "type": "local"
        }

        async def run_test():
            res = await runner.run_sync(
                local_path=replica_a,
                remote_config=remote_local,
                remote_path=replica_b,
                options={"prefer": "newer", "backup": True}
            )
            return res

        res = asyncio.run(run_test())
        self.assertTrue(res["success"], f"Unison sync failed: {res}")
        self.assertTrue(os.path.exists(os.path.join(replica_b, "game.sav")))
        with open(os.path.join(replica_b, "game.sav"), "r") as f:
            self.assertEqual(f.read(), "version 1")

    def test_pair_ssh_validation(self):
        rm = RemoteManager(self.settings_dir, user_home=self.test_dir)
        # Empty fields
        res1 = rm.pair_ssh_remote("", "user", "pass")
        self.assertFalse(res1["success"])
        self.assertIn("Host is required", res1["message"])

        res2 = rm.pair_ssh_remote("192.168.1.1", "", "pass")
        self.assertFalse(res2["success"])
        self.assertIn("Username is required", res2["message"])

        res3 = rm.pair_ssh_remote("192.168.1.1", "user", "")
        self.assertFalse(res3["success"])
        self.assertIn("Password is required", res3["message"])

        # Unreachable host (dummy non-routable port on 127.0.0.1)
        res4 = rm.pair_ssh_remote("127.0.0.1", "user", "pass", port=59999)
        self.assertFalse(res4["success"])
        self.assertIn("Could not reach", res4["message"])

    def test_binary_manager_detection(self):
        bm = BinaryManager(self.settings_dir, self.plugin_dir, user_home=self.test_dir)
        # Create a mock unison binary in settings_dir/bin
        bin_dir = os.path.join(self.settings_dir, "bin")
        os.makedirs(bin_dir, exist_ok=True)
        mock_unison = os.path.join(bin_dir, "unison")
        with open(mock_unison, "w") as f:
            f.write("#!/bin/sh\necho 'unison version 2.54.0 (ocaml 4.14.3)'\n")
        os.chmod(mock_unison, 0o755)

        located = bm.locate_binary()
        self.assertEqual(located, os.path.abspath(mock_unison))

        async def run_check():
            return await bm.check_binary_status(force_update_check=False)

        status = asyncio.run(run_check())
        self.assertTrue(status["installed"])
        self.assertEqual(status["version"], "2.54.0")
        self.assertIn("2.54.0", status["version_details"])

    def test_binary_manager_missing(self):
        empty_dir = tempfile.mkdtemp()
        try:
            bm = BinaryManager(empty_dir, empty_dir, user_home=empty_dir)
            # Override locate_binary search candidates by ensuring none exist in empty_dir
            # and patch locate_binary to return None
            orig_locate = bm.locate_binary
            bm.locate_binary = lambda: None

            async def run_check():
                return await bm.check_binary_status(force_update_check=False)

            status = asyncio.run(run_check())
            self.assertFalse(status["installed"])
            self.assertEqual(status["path"], "")
            self.assertEqual(status["version"], "")
            self.assertIn("not found", status["error"])
        finally:
            shutil.rmtree(empty_dir, ignore_errors=True)

    def test_unison_runner_missing_binary(self):
        empty_dir = tempfile.mkdtemp()
        try:
            runner = UnisonRunner(empty_dir, empty_dir, user_home=empty_dir)
            runner._locate_unison_binary = lambda: ""
            runner.bin_path = ""

            async def run_test():
                return await runner.run_sync(
                    local_path=os.path.join(empty_dir, "loc"),
                    remote_config={"type": "local"},
                    remote_path=os.path.join(empty_dir, "rem")
                )

            res = asyncio.run(run_test())
            self.assertFalse(res["success"])
            self.assertEqual(res["status"], "error")
            self.assertIn("not installed", res["details"])
        finally:
            shutil.rmtree(empty_dir, ignore_errors=True)

if __name__ == "__main__":
    unittest.main()
