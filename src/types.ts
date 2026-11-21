export interface NonSteamGame {
  app_id: number;
  name: string;
  exe: string;
  start_dir: string;
  compatdata_path: string;
  compatdata_exists: boolean;
  has_proton_prefix: boolean;
  pfx_user_dir?: string | null;
}

export interface SaveCandidate {
  label: string;
  path: string;
  folder_name: string;
  category: string;
  is_recommended: boolean;
  mtime: number;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  mtime: number;
  is_hidden: boolean;
}

export interface DirectoryListing {
  current_path: string;
  parent_path: string | null;
  entries: DirectoryEntry[];
  error?: string;
}

export interface QuickJump {
  name: string;
  path: string;
}

export interface RemoteConfig {
  id?: string;
  name: string;
  type: "ssh" | "socket" | "local";
  host?: string;
  port?: number;
  user?: string;
  remote_unison_path?: string;
  key_path?: string;
  local_path?: string;
}

export interface GameProfile {
  id?: string;
  app_id: number;
  game_name: string;
  local_path: string;
  remote_id: string;
  remote_path: string;
  prefer?: "newer" | "root1" | "root2";
  backup?: boolean;
  maxbackups?: number;
  auto?: boolean;
  batch?: boolean;
  confirmbigdel?: boolean;
  times?: boolean;
  extra_args?: string;
  last_synced?: number | null;
  last_status?: "in_sync" | "updated" | "conflict" | "error" | null;
  last_details?: string | null;
}

export interface TestResult {
  success: boolean;
  message: string;
}

export interface SyncResult {
  success: boolean;
  status: "in_sync" | "updated" | "conflict" | "error";
  files_synced: number;
  details: string;
  command?: string;
  raw_output: string;
}

export interface SSHKeyInfo {
  private_key_path: string;
  public_key_path: string;
  public_key: string;
}

export interface SSHConfigHost {
  alias: string;
  hostname?: string;
  user?: string;
  port?: number;
  identityfile?: string;
}

export interface HistoryEntry {
  profile_id: string;
  game_name: string;
  status: string;
  success: boolean;
  files_synced: number;
  details: string;
  command?: string;
  raw_output?: string;
  timestamp: number;
}
