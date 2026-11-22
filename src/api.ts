import { callable } from "@decky/api";
import {
  NonSteamGame,
  SaveCandidate,
  DirectoryListing,
  QuickJump,
  RemoteConfig,
  GameProfile,
  TestResult,
  SyncResult,
  SSHKeyInfo,
  SSHConfigHost,
  HistoryEntry,
} from "./types";

export const getNonSteamGames = callable<[], NonSteamGame[]>("get_non_steam_games");
export const getSaveCandidates = callable<[appId: number, gameName: string], SaveCandidate[]>("get_save_candidates");
export const browseDirectory = callable<[path?: string], DirectoryListing>("browse_directory");
export const getQuickJumps = callable<[appId?: number], QuickJump[]>("get_quick_jumps");

export const getRemotes = callable<[], RemoteConfig[]>("get_remotes");
export const saveRemote = callable<[remote: RemoteConfig], RemoteConfig>("save_remote");
export const deleteRemote = callable<[remoteId: string], boolean>("delete_remote");
export const testRemote = callable<[remoteId: string], TestResult>("test_remote");
export const getSSHKey = callable<[], SSHKeyInfo>("get_ssh_key");
export const getSSHConfigHosts = callable<[], SSHConfigHost[]>("get_ssh_config_hosts");
export const pairSSH = callable<[host: string, user: string, password: string, port?: number], TestResult>("pair_ssh");

export const getGameProfiles = callable<[], GameProfile[]>("get_game_profiles");
export const saveGameProfile = callable<[profile: GameProfile], GameProfile>("save_game_profile");
export const deleteGameProfile = callable<[profileId: string], boolean>("delete_game_profile");
export const setActiveTarget = callable<[profileId: string, targetId: string], boolean>("set_active_target");

export const triggerSync = callable<[profileId: string, targetId?: string], SyncResult>("trigger_sync");
export const getHistory = callable<[], HistoryEntry[]>("get_history");
export const getLatestSyncLog = callable<[profileId?: string], HistoryEntry | null>("get_latest_sync_log");
