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
import { NonSteamGame, GameProfile, RemoteConfig, SaveCandidate, GameRemoteTarget } from "../types";
import { getSaveCandidates, saveGameProfile, deleteGameProfile } from "../api";
import { FileBrowserModal } from "./FileBrowserModal";
import { FaFolderOpen, FaTrash, FaCheck, FaCog, FaPlus, FaServer } from "react-icons/fa";

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
  const sanitizedGameName = game.name.replace(/[/\\?%*:|"<>]/g, "_");

  const buildDefaultTarget = (remote?: RemoteConfig, index: number = 0): GameRemoteTarget => {
    const user = remote?.user || "";
    const defPath = user
      ? `/home/${user}/saves/${sanitizedGameName}`
      : `/home/username/saves/${sanitizedGameName}`;
    return {
      id: "tgt-" + Math.random().toString(36).substring(2, 9),
      remote_id: remote?.id || (remotes[0]?.id || ""),
      name: remote?.name ? `${remote.name}` : `Remote Target ${index + 1}`,
      remote_path: defPath,
      prefer: "newer",
      backup: true,
      maxbackups: 5,
      auto: true,
      batch: true,
      confirmbigdel: false,
      times: true,
      ignorearchives: false,
      extra_args: "",
    };
  };

  const initialTargets: GameRemoteTarget[] = (() => {
    if (existingProfile?.targets && existingProfile.targets.length > 0) {
      return existingProfile.targets.map((t) => ({ ...t }));
    }
    if (existingProfile?.remote_id) {
      const r = remotes.find((rem) => rem.id === existingProfile.remote_id);
      return [
        {
          id: "tgt-" + Math.random().toString(36).substring(2, 9),
          remote_id: existingProfile.remote_id,
          name: r?.name || "Default Remote",
          remote_path: existingProfile.remote_path || "",
          prefer: existingProfile.prefer || "newer",
          backup: existingProfile.backup ?? true,
          maxbackups: existingProfile.maxbackups ?? 5,
          auto: existingProfile.auto ?? true,
          batch: existingProfile.batch ?? true,
          confirmbigdel: existingProfile.confirmbigdel ?? false,
          times: existingProfile.times ?? true,
          ignorearchives: existingProfile.ignorearchives ?? false,
          extra_args: existingProfile.extra_args || "",
          last_synced: existingProfile.last_synced,
          last_status: existingProfile.last_status,
          last_details: existingProfile.last_details,
          last_direction: existingProfile.last_direction,
          last_direction_label: existingProfile.last_direction_label,
        },
      ];
    }
    return [buildDefaultTarget(remotes[0], 0)];
  })();

  const [localPath, setLocalPath] = useState<string>(existingProfile?.local_path || "");
  const [targets, setTargets] = useState<GameRemoteTarget[]>(initialTargets);
  const [editingTargetIdx, setEditingTargetIdx] = useState<number>(0);
  const [activeTargetId, setActiveTargetId] = useState<string>(
    existingProfile?.active_target_id || initialTargets[0]?.id || ""
  );
  const [candidates, setCandidates] = useState<SaveCandidate[]>([]);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // Keep editingTargetIdx valid
  const currentIdx = Math.min(Math.max(0, editingTargetIdx), Math.max(0, targets.length - 1));
  const currentTarget = targets[currentIdx] || targets[0];

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

  const updateCurrentTarget = (fields: Partial<GameRemoteTarget>) => {
    setTargets((prev) => {
      const copy = [...prev];
      if (copy[currentIdx]) {
        copy[currentIdx] = { ...copy[currentIdx], ...fields };
      }
      return copy;
    });
  };

  const handleAddTarget = () => {
    const unusedRemote = remotes.find((r) => !targets.some((t) => t.remote_id === r.id)) || remotes[0];
    const newTarget = buildDefaultTarget(unusedRemote, targets.length);
    setTargets((prev) => [...prev, newTarget]);
    setEditingTargetIdx(targets.length);
  };

  const handleRemoveTarget = (idxToRemove: number) => {
    if (targets.length <= 1) return;
    const targetToRemove = targets[idxToRemove];
    const updated = targets.filter((_, idx) => idx !== idxToRemove);
    setTargets(updated);
    if (currentIdx >= updated.length) {
      setEditingTargetIdx(updated.length - 1);
    }
    if (activeTargetId === targetToRemove.id) {
      setActiveTargetId(updated[0].id);
    }
  };

  const handleSave = async () => {
    const curActive = targets.find((t) => t.id === activeTargetId) || targets[0];
    const profile: GameProfile = {
      id: existingProfile?.id,
      app_id: game.app_id,
      game_name: game.name,
      local_path: localPath,
      active_target_id: curActive?.id || targets[0]?.id,
      targets: targets,
      // Legacy fields synced with active target
      remote_id: curActive?.remote_id || targets[0]?.remote_id,
      remote_path: curActive?.remote_path || targets[0]?.remote_path,
      prefer: curActive?.prefer,
      backup: curActive?.backup,
      maxbackups: curActive?.maxbackups,
      auto: curActive?.auto,
      batch: curActive?.batch,
      confirmbigdel: curActive?.confirmbigdel,
      times: curActive?.times,
      ignorearchives: curActive?.ignorearchives,
      extra_args: curActive?.extra_args,
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

          {/* Section 2: Remote Sync Targets (Multi-Remote) */}
          <DialogControlsSection>
            <DialogControlsSectionHeader>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                <span>Remote Sync Targets ({targets.length})</span>
                <DialogButton
                  className="decky-unison-btn-compact"
                  onClick={handleAddTarget}
                  style={{ height: "26px", fontSize: "11px", padding: "0 8px", color: "#67c1f5" }}
                >
                  <FaPlus /> Add Target
                </DialogButton>
              </div>
            </DialogControlsSectionHeader>

            {/* Target Tab Switcher when there are multiple targets */}
            {targets.length > 1 && (
              <Focusable
                flow-children="horizontal"
                style={{
                  display: "flex",
                  gap: "6px",
                  overflowX: "auto",
                  paddingBottom: "6px",
                  marginBottom: "8px",
                }}
              >
                {targets.map((tgt, idx) => {
                  const r = remotes.find((rem) => rem.id === tgt.remote_id);
                  const label = tgt.name || r?.name || `Target ${idx + 1}`;
                  const isSelected = idx === currentIdx;
                  return (
                    <DialogButton
                      key={tgt.id || idx}
                      className="decky-unison-chip"
                      style={{
                        background: isSelected ? "#1a9fff" : "rgba(255, 255, 255, 0.08)",
                        color: isSelected ? "#fff" : "#c9d1d9",
                        fontWeight: isSelected ? "bold" : "normal",
                        height: "28px",
                        fontSize: "11px",
                        padding: "0 10px",
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                      }}
                      onClick={() => setEditingTargetIdx(idx)}
                    >
                      <FaServer style={{ fontSize: "10px" }} />
                      <span>{label}</span>
                    </DialogButton>
                  );
                })}
              </Focusable>
            )}

            {/* Currently Active / Editing Target Card Details */}
            {currentTarget && (
              <div
                style={{
                  background: "rgba(0, 0, 0, 0.25)",
                  padding: "10px",
                  borderRadius: "6px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "12px", color: "#67c1f5", fontWeight: "bold" }}>
                    Target #{currentIdx + 1}: {currentTarget.name || "Remote"}
                  </span>
                  {targets.length > 1 && (
                    <DialogButton
                      className="decky-unison-btn-compact"
                      onClick={() => handleRemoveTarget(currentIdx)}
                      style={{ color: "#e74c3c", height: "24px", fontSize: "10px", padding: "0 6px" }}
                    >
                      <FaTrash /> Remove
                    </DialogButton>
                  )}
                </div>

                {remotes.length > 0 ? (
                  <DropdownItem
                    label="Target Server"
                    rgOptions={remotes.map((r) => ({
                      label: `${r.name} (${r.type.toUpperCase()})`,
                      data: r.id!,
                    }))}
                    selectedOption={currentTarget.remote_id}
                    onChange={(opt) => {
                      const found = remotes.find((r) => r.id === opt.data);
                      const updates: Partial<GameRemoteTarget> = {
                        remote_id: opt.data,
                      };
                      if (!currentTarget.name || remotes.some((r) => r.name === currentTarget.name)) {
                        updates.name = found?.name || "Remote";
                      }
                      if (found?.user && currentTarget.remote_path.includes("/home/")) {
                        updates.remote_path = `/home/${found.user}/saves/${sanitizedGameName}`;
                      }
                      updateCurrentTarget(updates);
                    }}
                  />
                ) : (
                  <div style={{ fontSize: "12px", color: "#e74c3c", padding: "4px 0" }}>
                    ⚠️ No remotes configured yet. Add a remote in Settings first.
                  </div>
                )}

                <TextField
                  label="Target Nickname"
                  description="e.g. Main PC, Living Room NAS, Travel Laptop"
                  value={currentTarget.name || ""}
                  onChange={(e) => updateCurrentTarget({ name: e.target.value })}
                />

                <TextField
                  label="Remote Directory (Absolute Path)"
                  description="e.g. /home/user/saves/GameName (no '~/' allowed)"
                  value={currentTarget.remote_path}
                  onChange={(e) => updateCurrentTarget({ remote_path: e.target.value })}
                />

                <DropdownItem
                  label="Conflict Resolution (-prefer)"
                  description="Policy when files change on both Deck and Server"
                  rgOptions={[
                    { label: "Newer File Wins (prefer newer)", data: "newer" },
                    { label: "Steam Deck Overwrites Remote (prefer deck)", data: "root1" },
                    { label: "Remote Overwrites Deck (prefer remote)", data: "root2" },
                  ]}
                  selectedOption={currentTarget.prefer || "newer"}
                  onChange={(opt) => updateCurrentTarget({ prefer: opt.data as any })}
                />
              </div>
            )}
          </DialogControlsSection>

          {/* Section 3: Advanced Options Collapsible */}
          {currentTarget && (
            <DialogControlsSection>
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
                    checked={currentTarget.backup ?? true}
                    onChange={(val) => updateCurrentTarget({ backup: val })}
                  />

                  {(currentTarget.backup ?? true) && (
                    <TextField
                      label="Max Backups (-maxbackups)"
                      value={String(currentTarget.maxbackups || 5)}
                      onChange={(e) => updateCurrentTarget({ maxbackups: Number(e.target.value) })}
                    />
                  )}

                  <ToggleField
                    label="Batch Mode (-batch)"
                    description="Non-interactive execution"
                    checked={currentTarget.batch ?? true}
                    onChange={(val) => updateCurrentTarget({ batch: val })}
                  />

                  <ToggleField
                    label="Automatic Acceptance (-auto)"
                    description="Automatically accept non-conflicts"
                    checked={currentTarget.auto ?? true}
                    onChange={(val) => updateCurrentTarget({ auto: val })}
                  />

                  <ToggleField
                    label="Confirm Big Deletions (-confirmbigdel)"
                    description="Safeguard against mass file deletion"
                    checked={currentTarget.confirmbigdel ?? false}
                    onChange={(val) => updateCurrentTarget({ confirmbigdel: val })}
                  />

                  <ToggleField
                    label="Preserve Timestamps (-times)"
                    description="Synchronize file timestamps"
                    checked={currentTarget.times ?? true}
                    onChange={(val) => updateCurrentTarget({ times: val })}
                  />

                  <ToggleField
                    label="Ignore Archive Mismatches (-ignorearchives)"
                    description="Bypass archive checks (use to fix archive errors or force fresh initial sync)"
                    checked={currentTarget.ignorearchives ?? false}
                    onChange={(val) => updateCurrentTarget({ ignorearchives: val })}
                  />

                  <TextField
                    label="Extra Custom CLI Flags"
                    value={currentTarget.extra_args || ""}
                    onChange={(e) => updateCurrentTarget({ extra_args: e.target.value })}
                  />
                </div>
              )}
            </DialogControlsSection>
          )}
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