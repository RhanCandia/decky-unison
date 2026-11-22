import {
  ModalRoot,
  DialogHeader,
  DialogSubHeader,
  DialogBody,
  DialogFooter,
  DialogButton,
  DialogButtonPrimary,
  DialogButtonSecondary,
  DialogControlsSection,
  DialogControlsSectionHeader,
  TextField,
  DropdownItem,
  ToggleField,
  Focusable,
  showModal,
} from "@decky/ui";
import { useState, useEffect } from "react";
import { NonSteamGame, GameProfile, RemoteConfig, SaveCandidate } from "../types";
import { getSaveCandidates, saveGameProfile, deleteGameProfile } from "../api";
import { FileBrowserModal } from "./FileBrowserModal";
import { FaFolderOpen, FaTrash, FaCheck, FaCog } from "react-icons/fa";

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
  const selectedRemote = remotes.find((r) => r.id === (existingProfile?.remote_id || remotes[0]?.id));
  const remoteUser = selectedRemote?.user || "";
  const sanitizedGameName = game.name.replace(/[/\\?%*:|"<>]/g, "_");
  const suggestedAbsPath = remoteUser
    ? `/home/${remoteUser}/saves/${sanitizedGameName}`
    : `/home/username/saves/${sanitizedGameName}`;

  const [localPath, setLocalPath] = useState<string>(existingProfile?.local_path || "");
  const [remoteId, setRemoteId] = useState<string>(
    existingProfile?.remote_id || (remotes.length > 0 ? remotes[0].id || "" : "")
  );
  const [remotePath, setRemotePath] = useState<string>(
    existingProfile?.remote_path
      ? (existingProfile.remote_path.startsWith("~/")
          ? existingProfile.remote_path.replace(/^~\//, remoteUser ? `/home/${remoteUser}/` : "/home/user/")
          : existingProfile.remote_path)
      : suggestedAbsPath
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
  const [ignorearchives, setIgnorearchives] = useState<boolean>(
    existingProfile?.ignorearchives ?? false
  );
  const [extraArgs, setExtraArgs] = useState<string>(existingProfile?.extra_args || "");

  useEffect(() => {
    getSaveCandidates(game.app_id, game.name)
      .then((res) => {
        setCandidates(res);
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
      ignorearchives,
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
      <DialogHeader>Configure Unison Sync</DialogHeader>
      <DialogSubHeader>
        <span style={{ color: "#fff", fontWeight: "bold" }}>{game.name}</span>
        <span style={{ color: "#8b929a", marginLeft: "8px" }}>(AppID: {game.app_id})</span>
      </DialogSubHeader>

      <DialogBody>
        <div className="decky-unison-root" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {/* Section 1: Local Save Directory on Steam Deck */}
          <DialogControlsSection>
            <DialogControlsSectionHeader>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                <span>Local Save Directory</span>
                <DialogButton
                  className="decky-unison-btn-compact"
                  onClick={handleOpenBrowser}
                  style={{ height: "26px", fontSize: "11px", padding: "0 8px" }}
                >
                  <FaFolderOpen /> Browse...
                </DialogButton>
              </div>
            </DialogControlsSectionHeader>

            <TextField
              label="Save Path on Steam Deck"
              description="Folder containing save files"
              value={localPath}
              onChange={(e) => setLocalPath(e.target.value)}
            />

            {/* Save candidates as compact pill buttons */}
            {candidates.length > 0 && (
              <div style={{ marginTop: "4px" }}>
                <div style={{ fontSize: "11px", color: "#8b929a", marginBottom: "4px" }}>
                  Detected Save Locations:
                </div>
                <Focusable flow-children="horizontal" style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {candidates.slice(0, 3).map((c, idx) => (
                    <DialogButton
                      key={idx}
                      className="decky-unison-chip"
                      style={{
                        background: localPath === c.path ? "rgba(103, 193, 245, 0.3)" : "rgba(255, 255, 255, 0.08)",
                        border: c.is_recommended ? "1px solid #67c1f5" : undefined,
                        color: c.is_recommended ? "#67c1f5" : "#fff",
                      }}
                      onClick={() => setLocalPath(c.path)}
                    >
                      {c.is_recommended ? "⭐ " : ""}{c.label}
                    </DialogButton>
                  ))}
                </Focusable>
              </div>
            )}
          </DialogControlsSection>

          {/* Section 2: Remote Target Server */}
          <DialogControlsSection>
            <DialogControlsSectionHeader>Remote Destination</DialogControlsSectionHeader>
            {remotes.length > 0 ? (
              <DropdownItem
                label="Target Server"
                rgOptions={remotes.map((r) => ({
                  label: `${r.name} (${r.type.toUpperCase()})`,
                  data: r.id!,
                }))}
                selectedOption={remoteId}
                onChange={(opt) => {
                  setRemoteId(opt.data);
                  const found = remotes.find((r) => r.id === opt.data);
                  if (found?.user && remotePath.includes("/home/")) {
                    setRemotePath(`/home/${found.user}/saves/${sanitizedGameName}`);
                  }
                }}
              />
            ) : (
              <div style={{ fontSize: "12px", color: "#e74c3c", padding: "4px 0" }}>
                ⚠️ No remotes configured yet. Add a remote in Settings first.
              </div>
            )}

            <TextField
              label="Remote Directory (Absolute Path)"
              description="e.g. /home/user/saves/GameName (no '~/' allowed)"
              value={remotePath}
              onChange={(e) => setRemotePath(e.target.value)}
            />
          </DialogControlsSection>

          {/* Section 3: Sync Policy & Collapsible Advanced Options */}
          <DialogControlsSection>
            <DialogControlsSectionHeader>Sync Policy</DialogControlsSectionHeader>
            <DropdownItem
              label="Conflict Resolution (-prefer)"
              description="Policy when files change on both Deck and Server"
              rgOptions={[
                { label: "Newer File Wins (prefer newer)", data: "newer" },
                { label: "Steam Deck Overwrites Remote (prefer deck)", data: "root1" },
                { label: "Remote Overwrites Deck (prefer remote)", data: "root2" },
              ]}
              selectedOption={prefer}
              onChange={(opt) => setPrefer(opt.data as any)}
            />

            <div style={{ marginTop: "6px" }}>
              <DialogButton
                className="decky-unison-btn-compact"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                <FaCog /> {showAdvanced ? "Hide Advanced Options" : "Advanced Options (Backups, Times...)"}
              </DialogButton>

              {showAdvanced && (
                <div
                  style={{
                    marginTop: "8px",
                    background: "rgba(0, 0, 0, 0.25)",
                    padding: "10px",
                    borderRadius: "6px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <ToggleField
                    label="Versioned Backups (-backup)"
                    description="Keep previous copies before overwriting"
                    checked={backup}
                    onChange={(val) => setBackup(val)}
                  />

                  {backup && (
                    <TextField
                      label="Max Backups (-maxbackups)"
                      value={String(maxbackups)}
                      onChange={(e) => setMaxbackups(Number(e.target.value))}
                    />
                  )}

                  <ToggleField
                    label="Batch Mode (-batch)"
                    description="Non-interactive execution"
                    checked={batch}
                    onChange={(val) => setBatch(val)}
                  />

                  <ToggleField
                    label="Automatic Acceptance (-auto)"
                    description="Automatically accept non-conflicts"
                    checked={auto}
                    onChange={(val) => setAuto(val)}
                  />

                  <ToggleField
                    label="Confirm Big Deletions (-confirmbigdel)"
                    description="Safeguard against mass file deletion"
                    checked={confirmbigdel}
                    onChange={(val) => setConfirmbigdel(val)}
                  />

                  <ToggleField
                    label="Preserve Timestamps (-times)"
                    description="Synchronize file timestamps"
                    checked={times}
                    onChange={(val) => setTimes(val)}
                  />

                  <ToggleField
                    label="Ignore Archive Mismatches (-ignorearchives)"
                    description="Bypass archive checks (use to fix archive errors or force fresh initial sync)"
                    checked={ignorearchives}
                    onChange={(val) => setIgnorearchives(val)}
                  />

                  <TextField
                    label="Extra Custom CLI Flags"
                    value={extraArgs}
                    onChange={(e) => setExtraArgs(e.target.value)}
                  />
                </div>
              )}
            </div>
          </DialogControlsSection>
        </div>
      </DialogBody>

      <DialogFooter>
        <DialogButtonPrimary
          onClick={handleSave}
          className="decky-unison-btn-compact"
          style={{ height: "36px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
        >
          <FaCheck /> Save Configuration
        </DialogButtonPrimary>
        {existingProfile?.id && (
          <DialogButton
            onClick={handleDelete}
            className="decky-unison-btn-compact"
            style={{ color: "#e74c3c", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
          >
            <FaTrash /> Delete Profile
          </DialogButton>
        )}
        <DialogButtonSecondary onClick={closeModal} className="decky-unison-btn-compact" style={{ height: "36px" }}>
          Cancel
        </DialogButtonSecondary>
      </DialogFooter>
    </ModalRoot>
  );
}
