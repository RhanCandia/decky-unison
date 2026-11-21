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
        {/* Section 1: Local Save Directory on Steam Deck */}
        <DialogControlsSection>
          <DialogControlsSectionHeader>Local Save Directory (Steam Deck)</DialogControlsSectionHeader>
          <TextField
            label="Path on Deck"
            description="Directory containing save files for this game"
            value={localPath}
            onChange={(e) => setLocalPath(e.target.value)}
          />
          <DialogButton
            onClick={handleOpenBrowser}
            style={{
              marginTop: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            <FaFolderOpen /> Browse Steam Deck Folders...
          </DialogButton>

          {/* Save candidates list */}
          {candidates.length > 0 && (
            <div style={{ marginTop: "12px" }}>
              <div style={{ fontSize: "11px", color: "#8b929a", marginBottom: "6px" }}>
                Auto-Detected Save Folders:
              </div>
              <Focusable
                flow-children="vertical"
                style={{ display: "flex", flexDirection: "column", gap: "6px" }}
              >
                {candidates.slice(0, 3).map((c, idx) => (
                  <DialogButton
                    key={idx}
                    onClick={() => setLocalPath(c.path)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 12px",
                      height: "auto",
                      minWidth: "auto",
                      background: c.is_recommended ? "rgba(103, 193, 245, 0.15)" : undefined,
                      border: c.is_recommended ? "1px solid rgba(103, 193, 245, 0.5)" : undefined,
                    }}
                  >
                    <div style={{ textAlign: "left", flex: 1, overflow: "hidden" }}>
                      <div
                        style={{
                          fontWeight: c.is_recommended ? "bold" : "normal",
                          fontSize: "12px",
                          color: c.is_recommended ? "#67c1f5" : "#fff",
                        }}
                      >
                        {c.is_recommended ? "⭐ " : ""}{c.label}
                      </div>
                      <div
                        style={{
                          fontSize: "10px",
                          color: "#8b929a",
                          textOverflow: "ellipsis",
                          overflow: "hidden",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {c.path}
                      </div>
                    </div>
                    <span style={{ fontSize: "10px", color: "#67c1f5", marginLeft: "8px", whiteSpace: "nowrap" }}>
                      Use this
                    </span>
                  </DialogButton>
                ))}
              </Focusable>
            </div>
          )}
        </DialogControlsSection>

        {/* Section 2: Remote Target Server */}
        <DialogControlsSection>
          <DialogControlsSectionHeader>Remote Target Server</DialogControlsSectionHeader>
          {remotes.length > 0 ? (
            <DropdownItem
              label="Sync Target"
              description="Configured remote or central server"
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
            <div style={{ fontSize: "12px", color: "#e74c3c", padding: "6px 0" }}>
              ⚠️ No remotes configured yet. Please add a remote in Settings first.
            </div>
          )}

          <TextField
            label="Remote Destination Directory (Absolute Path)"
            description="Absolute path on the server (e.g. /home/user/saves/GameName or C:/Games/Saves/GameName). Note: Unison requires absolute paths without '~/'."
            value={remotePath}
            onChange={(e) => setRemotePath(e.target.value)}
          />
        </DialogControlsSection>

        {/* Section 3: Conflict Policy & Advanced Options Toggle */}
        <DialogControlsSection>
          <DialogControlsSectionHeader>Synchronization Policy</DialogControlsSectionHeader>
          <DropdownItem
            label="Conflict Resolution (-prefer)"
            description="Policy when files are changed on both Steam Deck and Server"
            rgOptions={[
              { label: "Newer File Wins (prefer newer)", data: "newer" },
              { label: "Steam Deck Overwrites Remote (prefer deck)", data: "root1" },
              { label: "Remote Overwrites Deck (prefer remote)", data: "root2" },
            ]}
            selectedOption={prefer}
            onChange={(opt) => setPrefer(opt.data as any)}
          />

          <DialogButton
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{
              marginTop: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              fontSize: "12px",
            }}
          >
            <FaCog /> {showAdvanced ? "Hide Advanced Unison Options" : "Show Advanced Unison Options"}
          </DialogButton>
        </DialogControlsSection>

        {/* Section 4: Advanced CLI Options */}
        {showAdvanced && (
          <DialogControlsSection>
            <DialogControlsSectionHeader>Advanced Unison CLI Options</DialogControlsSectionHeader>
            <ToggleField
              label="Versioned Backups (-backup)"
              description="Preserve previous file versions before overwriting"
              checked={backup}
              onChange={(val) => setBackup(val)}
            />

            {backup && (
              <TextField
                label="Max Backups to Retain (-maxbackups)"
                description="Number of versions to keep per file"
                value={String(maxbackups)}
                onChange={(e) => setMaxbackups(Number(e.target.value))}
              />
            )}

            <ToggleField
              label="Batch Mode (-batch)"
              description="Non-interactive execution without terminal questions"
              checked={batch}
              onChange={(val) => setBatch(val)}
            />

            <ToggleField
              label="Automatic Acceptance (-auto)"
              description="Automatically accept non-conflicting actions"
              checked={auto}
              onChange={(val) => setAuto(val)}
            />

            <ToggleField
              label="Confirm Big Deletions (-confirmbigdel)"
              description="Safeguard against mass deletion of save files"
              checked={confirmbigdel}
              onChange={(val) => setConfirmbigdel(val)}
            />

            <ToggleField
              label="Preserve Timestamps (-times)"
              description="Synchronize file modification timestamps"
              checked={times}
              onChange={(val) => setTimes(val)}
            />

            <TextField
              label="Extra Custom CLI Flags"
              description="Additional arguments passed directly to unison"
              value={extraArgs}
              onChange={(e) => setExtraArgs(e.target.value)}
            />
          </DialogControlsSection>
        )}
      </DialogBody>

      <DialogFooter>
        <DialogButtonPrimary
          onClick={handleSave}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
        >
          <FaCheck /> Save Configuration
        </DialogButtonPrimary>
        {existingProfile?.id && (
          <DialogButton
            onClick={handleDelete}
            style={{ color: "#e74c3c", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
          >
            <FaTrash /> Delete Profile
          </DialogButton>
        )}
        <DialogButtonSecondary onClick={closeModal}>
          Cancel
        </DialogButtonSecondary>
      </DialogFooter>
    </ModalRoot>
  );
}
