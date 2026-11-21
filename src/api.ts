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

export const getGameProfiles = callable<[], GameProfile[]>("get_game_profiles");
export const saveGameProfile = callable<[profile: GameProfile], GameProfile>("save_game_profile");
export const deleteGameProfile = callable<[profileId: string], boolean>("delete_game_profile");

export const triggerSync = callable<[profileId: string], SyncResult>("trigger_sync");
export const getHistory = callable<[], HistoryEntry[]>("get_history");
