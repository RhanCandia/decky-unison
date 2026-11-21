import {
  ModalRoot,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogButton,
  TextField,
  DropdownItem,
  ToggleField,
  showModal,
} from "@decky/ui";
import { useState, useEffect } from "react";
import { NonSteamGame, GameProfile, RemoteConfig, SaveCandidate } from "../types";
import { getSaveCandidates, saveGameProfile, deleteGameProfile } from "../api";
import { FileBrowserModal } from "./FileBrowserModal";
import { FaFolderOpen, FaTrash, FaCheck, FaTimes, FaCog } from "react-icons/fa";

interface GameProfileModalProps {
  game: NonSteamGame;
  existingProfile?: GameProfile;
  remotes: RemoteConfig[];
  closeModal?: () => void;
  onSaved?: () => void;
}

export function GameProfileModal({
  game,
  existingProfile,
  remotes,
  closeModal,
  onSaved,
}: GameProfileModalProps) {
  const [localPath, setLocalPath] = useState<string>(existingProfile?.local_path || "");
  const [remoteId, setRemoteId] = useState<string>(
    existingProfile?.remote_id || (remotes.length > 0 ? remotes[0].id || "" : "")
  );
  const [remotePath, setRemotePath] = useState<string>(
    existingProfile?.remote_path || `~/saves/${game.name.replace(/[/\\?%*:|"<>]/g, "_")}`
  );
  const [candidates, setCandidates] = useState<SaveCandidate[]>([]);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // Unison CLI Options
  const [prefer, setPrefer] = useState<"newer" | "root1" | "root2">(
    existingProfile?.prefer || "newer"
  );
  const [backup, setBackup] = useState<boolean>(existingProfile?.backup ?? true);
  const [maxbackups, setMaxbackups] = useState<number>(existingProfile?.maxbackups || 5);
  const [auto, setAuto] = useState<boolean>(existingProfile?.auto ?? true);
  const [batch, setBatch] = useState<boolean>(existingProfile?.batch ?? true);
  const [confirmbigdel, setConfirmbigdel] = useState<boolean>(
    existingProfile?.confirmbigdel ?? false
  );
  const [times, setTimes] = useState<boolean>(existingProfile?.times ?? true);
  const [extraArgs, setExtraArgs] = useState<string>(existingProfile?.extra_args || "");

  useEffect(() => {
    // Look for save candidates automatically
    getSaveCandidates(game.app_id, game.name)
      .then((res) => {
        setCandidates(res);
        // If localPath is not set, and there's a recommended candidate, pre-populate it!
        if (!localPath && res.length > 0 && res[0].is_recommended) {
          setLocalPath(res[0].path);
        }
      })
      .catch(console.error);
  }, []);

  const handleOpenBrowser = () => {
    showModal(
      <FileBrowserModal
        initialPath={localPath || game.pfx_user_dir || undefined}
        appId={game.app_id}
        onSelect={(selected) => setLocalPath(selected)}
      />
    );
  };

  const handleSave = async () => {
    const profile: GameProfile = {
      id: existingProfile?.id,
      app_id: game.app_id,
      game_name: game.name,
      local_path: localPath,
      remote_id: remoteId,
      remote_path: remotePath,
      prefer,
      backup,
      maxbackups: Number(maxbackups),
      auto,
      batch,
      confirmbigdel,
      times,
      extra_args: extraArgs,
    };
    await saveGameProfile(profile);
    onSaved?.();
    closeModal?.();
  };

  const handleDelete = async () => {
    if (existingProfile?.id) {
      await deleteGameProfile(existingProfile.id);
      onSaved?.();
      closeModal?.();
    }
  };

  return (
    <ModalRoot onCancel={closeModal}>
      <DialogHeader>Configure Unison: {game.name}</DialogHeader>
      <DialogBody>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {/* Game Information */}
          <div style={{ fontSize: "12px", color: "#8b929a" }}>
            Steam AppID: <span style={{ fontFamily: "monospace", color: "#67c1f5" }}>{game.app_id}</span>
          </div>

          {/* Local Save Path */}
          <div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "8px" }}>
              <div style={{ flex: 1 }}>
                <TextField
                  label="Local Save Folder on Steam Deck"
                  value={localPath}
                  onChange={(e) => setLocalPath(e.target.value)}
                />
              </div>
              <DialogButton
                onClick={handleOpenBrowser}
                style={{ marginBottom: "2px", height: "40px", display: "flex", alignItems: "center", gap: "6px" }}
              >
                <FaFolderOpen /> Browse...
              </DialogButton>
            </div>

            {/* Candidates suggestions */}
            {candidates.length > 0 && (
              <div style={{ marginTop: "6px" }}>
                <div style={{ fontSize: "11px", color: "#8b929a", marginBottom: "4px" }}>
                  Detected Save Candidates:
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {candidates.slice(0, 3).map((c, idx) => (
                    <div
                      key={idx}
                      onClick={() => setLocalPath(c.path)}
                      style={{
                        fontSize: "11px",
                        padding: "4px 8px",
                        borderRadius: "3px",
                        background: c.is_recommended ? "rgba(103, 193, 245, 0.15)" : "rgba(255, 255, 255, 0.05)",
                        border: c.is_recommended ? "1px solid #67c1f5" : "none",
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ fontWeight: c.is_recommended ? "bold" : "normal" }}>{c.label}</span>
                      <span style={{ fontSize: "10px", color: "#8b929a" }}>Use this</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Remote Endpoint & Path */}
          {remotes.length > 0 ? (
            <DropdownItem
              label="Remote Sync Target"
              rgOptions={remotes.map((r) => ({
                label: `${r.name} (${r.type.toUpperCase()})`,
                data: r.id!,
              }))}
              selectedOption={remoteId}
              onChange={(opt) => setRemoteId(opt.data)}
            />
          ) : (
            <div style={{ fontSize: "12px", color: "#e74c3c" }}>
              No remotes configured. Please add a remote in Remotes Setup first.
            </div>
          )}

          <TextField
            label="Remote Destination Directory"
            value={remotePath}
            onChange={(e) => setRemotePath(e.target.value)}
          />

          {/* Advanced Unison CLI Options Toggle */}
          <div style={{ marginTop: "4px" }}>
            <DialogButton
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}
            >
              <FaCog /> {showAdvanced ? "Hide Unison CLI Toggles" : "Show Unison CLI Toggles"}
            </DialogButton>
          </div>

          {showAdvanced && (
            <div
              style={{
                background: "rgba(0, 0, 0, 0.25)",
                padding: "10px",
                borderRadius: "4px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <DropdownItem
                label="Conflict Resolution (-prefer)"
                rgOptions={[
                  { label: "Newer File Wins (prefer newer)", data: "newer" },
                  { label: "Deck Overwrites Remote (prefer deck)", data: "root1" },
                  { label: "Remote Overwrites Deck (prefer remote)", data: "root2" },
                ]}
                selectedOption={prefer}
                onChange={(opt) => setPrefer(opt.data as any)}
              />

              <ToggleField
                label="Versioned Backups (-backup)"
                description="Keeps previous versions before overwriting saves"
                checked={backup}
                onChange={(val) => setBackup(val)}
              />

              {backup && (
                <TextField
                  label="Max Backups to Retain (-maxbackups)"
                  value={String(maxbackups)}
                  onChange={(e) => setMaxbackups(Number(e.target.value))}
                />
              )}

              <ToggleField
                label="Batch Mode (-batch)"
                description="Runs non-interactively without prompting"
                checked={batch}
                onChange={(val) => setBatch(val)}
              />

              <ToggleField
                label="Automatic Acceptance (-auto)"
                description="Automatically accepts non-conflicting updates"
                checked={auto}
                onChange={(val) => setAuto(val)}
              />

              <ToggleField
                label="Confirm Big Deletions (-confirmbigdel)"
                description="Prompt if large number of files are deleted"
                checked={confirmbigdel}
                onChange={(val) => setConfirmbigdel(val)}
              />

              <ToggleField
                label="Preserve Timestamps (-times)"
                description="Synchronize file modification times"
                checked={times}
                onChange={(val) => setTimes(val)}
              />

              <TextField
                label="Extra Custom Unison Flags"
                value={extraArgs}
                onChange={(e) => setExtraArgs(e.target.value)}
              />
            </div>
          )}
        </div>
      </DialogBody>
      <DialogFooter>
        <DialogButton onClick={handleSave} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <FaCheck /> Save Configuration
        </DialogButton>
        {existingProfile?.id && (
          <DialogButton onClick={handleDelete} style={{ color: "#e74c3c", display: "flex", alignItems: "center", gap: "6px" }}>
            <FaTrash /> Delete
          </DialogButton>
        )}
        <DialogButton onClick={closeModal} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <FaTimes /> Cancel
        </DialogButton>
      </DialogFooter>
    </ModalRoot>
  );
}
