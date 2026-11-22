import unittest
import os
import shutil
import tempfile
import asyncio
from main import Plugin

class TestPluginE2E(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.settings_dir = os.path.join(self.test_dir, "settings")
        self.plugin_dir = "/home/super/Development/decky-unison"
        self.user_home = os.path.join(self.test_dir, "home")
        os.makedirs(self.settings_dir, exist_ok=True)
        os.makedirs(self.user_home, exist_ok=True)

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_end_to_end_plugin_lifecycle(self):
        plugin = Plugin(settings_dir=self.settings_dir, user_home=self.user_home)
        async def run():
            await plugin._main()
            # Point plugin paths to our sandbox test directory
            plugin.settings_dir = self.settings_dir
            plugin.user_home = self.user_home
            plugin.file_browser.user_home = self.user_home
            plugin.game_detector.user_home = self.user_home
            plugin.remote_manager.settings_dir = self.settings_dir
            plugin.config_store.settings_dir = self.settings_dir
            plugin.config_store.config_path = os.path.join(self.settings_dir, "config.json")
            plugin.unison_runner.unison_dir = os.path.join(self.settings_dir, "unison")
            os.makedirs(plugin.unison_runner.unison_dir, exist_ok=True)

            # 0. Unison binary status
            u_status = await plugin.get_unison_status()
            self.assertIn("installed", u_status)
            self.assertIn("latest_version", u_status)

            # 1. Directory browsing & Quick jumps
            listing = await plugin.browse_directory(self.user_home)
            self.assertEqual(listing["current_path"], os.path.abspath(self.user_home))
            jumps = await plugin.get_quick_jumps()
            self.assertTrue(len(jumps) > 0)

            # 2. SSH Key generation
            key_info = await plugin.get_ssh_key()
            self.assertTrue(os.path.exists(key_info["private_key_path"]))
            self.assertTrue(os.path.exists(key_info["public_key_path"]))
            self.assertTrue(len(key_info["public_key"]) > 0)

            # 3. Remote configuration
            remotes = await plugin.get_remotes()
            self.assertTrue(len(remotes) >= 1)

            saved_remote = await plugin.save_remote({
                "name": "Local Test Storage",
                "type": "local"
            })
            self.assertIsNotNone(saved_remote.get("id"))

            # 4. Create sample local save and remote save directories
            local_save = os.path.join(self.test_dir, "DeckGameSave")
            remote_save = os.path.join(self.test_dir, "ServerGameSave")
            os.makedirs(local_save, exist_ok=True)
            os.makedirs(remote_save, exist_ok=True)

            with open(os.path.join(local_save, "slot1.sav"), "w") as f:
                f.write("Deck Progress: Level 10")

            # 5. Initialize Game Profile
            profile = await plugin.save_game_profile({
                "app_id": 12345678,
                "game_name": "Test RPG Game",
                "local_path": local_save,
                "remote_id": saved_remote["id"],
                "remote_path": remote_save,
                "prefer": "newer",
                "backup": True,
                "maxbackups": 3
            })
            self.assertIsNotNone(profile.get("id"))

            # 6. Trigger Sync via Plugin API
            sync_res = await plugin.trigger_sync(profile["id"])
            self.assertTrue(sync_res["success"], f"Sync failed: {sync_res}")

            # Verify file was synchronized to remote_save
            remote_file = os.path.join(remote_save, "slot1.sav")
            self.assertTrue(os.path.exists(remote_file))
            with open(remote_file, "r") as f:
                self.assertEqual(f.read(), "Deck Progress: Level 10")

            # 7. Add a second target to the game profile
            remote_save_secondary = os.path.join(self.test_dir, "SecondaryServerGameSave")
            os.makedirs(remote_save_secondary, exist_ok=True)

            prof_with_two_targets = (await plugin.get_game_profiles())[0]
            prof_with_two_targets["targets"].append({
                "id": "target-secondary",
                "remote_id": saved_remote["id"],
                "name": "Secondary Storage",
                "remote_path": remote_save_secondary,
                "prefer": "newer"
            })
            await plugin.save_game_profile(prof_with_two_targets)
            await plugin.set_active_target(profile["id"], "target-secondary")

            # Trigger sync explicitly to the secondary target
            sync_res2 = await plugin.trigger_sync(profile["id"], "target-secondary")
            self.assertTrue(sync_res2["success"], f"Secondary sync failed: {sync_res2}")
            secondary_file = os.path.join(remote_save_secondary, "slot1.sav")
            self.assertTrue(os.path.exists(secondary_file))
            with open(secondary_file, "r") as f:
                self.assertEqual(f.read(), "Deck Progress: Level 10")

            # 8. Check History
            history = await plugin.get_history()
            self.assertTrue(len(history) >= 2)
            self.assertEqual(history[0]["game_name"], "Test RPG Game")
            self.assertEqual(history[0]["target_name"], "Secondary Storage")
            self.assertTrue(history[0]["success"])

            await plugin._unload()

        asyncio.run(run())

if __name__ == "__main__":
    unittest.main()
