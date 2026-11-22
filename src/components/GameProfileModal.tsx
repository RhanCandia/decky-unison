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
import {
  FaFolderOpen,
  FaTrash,
  FaCheck,
  FaCog,
  FaPlus,
  FaServer,
  FaShieldAlt,
  FaClock,
} from "react-icons/fa";

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

  const [activeTab, setActiveTab] = useState<"folder" | "target" | "rules">("folder");
  const [localPath, setLocalPath] = useState<string>(existingProfile?.local_path || "");
  const [targets, setTargets] = useState<GameRemoteTarget[]>(initialTargets);
  const [editingTargetIdx, setEditingTargetIdx] = useState<number>(0);
  const [activeTargetId, setActiveTargetId] = useState<string>(
    existingProfile?.active_target_id || initialTargets[0]?.id || ""
  );
  const [candidates, setCandidates] = useState<SaveCandidate[]>([]);

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
          {/* 3-Tab Segmented Switcher */}
          <Focusable
            flow-children="horizontal"
            style={{
              display: "flex",
              gap: "6px",
              background: "rgba(0, 0, 0, 0.4)",
              padding: "4px",
              borderRadius: "6px",
              marginBottom: "8px",
            }}
          >
            <DialogButton
              className="decky-unison-tab"
              onClick={() => setActiveTab("folder")}
              style={{
                flex: 1,
                height: "32px",
                minWidth: "auto",
                padding: "0 8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                fontSize: "11px",
                fontWeight: activeTab === "folder" ? "bold" : "normal",
                background: activeTab === "folder" ? "#1a9fff" : "rgba(255, 255, 255, 0.08)",
                color: activeTab === "folder" ? "#ffffff" : "#c9d1d9",
              }}
            >
              <FaFolderOpen /> Save Folder
            </DialogButton>
            <DialogButton
              className="decky-unison-tab"
              onClick={() => setActiveTab("target")}
              style={{
                flex: 1,
                height: "32px",
                minWidth: "auto",
                padding: "0 8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                fontSize: "11px",
                fontWeight: activeTab === "target" ? "bold" : "normal",
                background: activeTab === "target" ? "#1a9fff" : "rgba(255, 255, 255, 0.08)",
                color: activeTab === "target" ? "#ffffff" : "#c9d1d9",
              }}
            >
              <FaServer /> Destination ({targets.length})
            </DialogButton>
            <DialogButton
              className="decky-unison-tab"
              onClick={() => setActiveTab("rules")}
              style={{
                flex: 1,
                height: "32px",
                minWidth: "auto",
                padding: "0 8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                fontSize: "11px",
                fontWeight: activeTab === "rules" ? "bold" : "normal",
                background: activeTab === "rules" ? "#1a9fff" : "rgba(255, 255, 255, 0.08)",
                color: activeTab === "rules" ? "#ffffff" : "#c9d1d9",
              }}
            >
              <FaCog /> Sync Rules
            </DialogButton>
          </Focusable>

          {/* TAB 1: LOCAL SAVE FOLDER */}
          {activeTab === "folder" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {/* Detected Save Locations List */}
              {candidates.length > 0 && (
                <DialogControlsSection>
                  <DialogControlsSectionHeader>
                    <span>Detected Save Folders ({candidates.length})</span>
                  </DialogControlsSectionHeader>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {candidates.map((c, idx) => {
                      const isSelected = localPath === c.path;
                      return (
                        <DialogButton
                          key={idx}
                          className="decky-unison-card"
                          onClick={() => setLocalPath(c.path)}
                          style={{
                            width: "100%",
                            padding: "8px 12px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            background: isSelected ? "rgba(26, 159, 255, 0.22)" : "rgba(255, 255, 255, 0.05)",
                            border: isSelected ? "1px solid #1a9fff" : "1px solid rgba(255, 255, 255, 0.1)",
                            borderRadius: "6px",
                            textAlign: "left",
                          }}
                        >
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px", overflow: "hidden", flex: 1, marginRight: "10px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ color: isSelected ? "#1a9fff" : "#8b929a", fontSize: "10px" }}>
                                {isSelected ? "●" : "○"}
                              </span>
                              <span style={{ fontWeight: "bold", fontSize: "12px", color: isSelected ? "#ffffff" : "#c9d1d9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {c.folder_name || c.label}
                              </span>
                              {c.is_recommended && (
                                <span style={{ fontSize: "9px", color: "#67c1f5", background: "rgba(103, 193, 245, 0.2)", padding: "1px 5px", borderRadius: "3px" }}>
                                  ⭐ Recommended
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: "10px", color: "#8b929a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {c.path}
                            </div>
                          </div>
                          {isSelected ? (
                            <span style={{ color: "#2ecc71", fontSize: "11px", fontWeight: "bold", flexShrink: 0, display: "flex", alignItems: "center", gap: "4px" }}>
                              <FaCheck /> Active
                            </span>
                          ) : (
                            <span style={{ color: "#8b929a", fontSize: "11px", flexShrink: 0 }}>
                              Select
                            </span>
                          )}
                        </DialogButton>
                      );
                    })}
                  </div>
                </DialogControlsSection>
              )}

              {/* Steam Deck Save Path & Browse Button */}
              <DialogControlsSection>
                <DialogControlsSectionHeader>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                    <span>Save Folder on Steam Deck</span>
                    <DialogButton
                      className="decky-unison-btn-compact"
                      onClick={handleOpenBrowser}
                      style={{
                        height: "26px",
                        minWidth: "auto",
                        width: "auto",
                        padding: "0 10px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "11px",
                      }}
                    >
                      <FaFolderOpen /> Browse...
                    </DialogButton>
                  </div>
                </DialogControlsSectionHeader>

                <TextField
                  label="Folder Path"
                  description="Directory containing the save files for this game"
                  value={localPath}
                  onChange={(e) => setLocalPath(e.target.value)}
                />
              </DialogControlsSection>
            </div>
          )}

          {/* TAB 2: REMOTE SYNC DESTINATIONS */}
          {activeTab === "target" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {/* Multi-Target Segment / Add Bar */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "12px", color: "#8b929a" }}>
                  Configured Destinations ({targets.length})
                </span>
                <DialogButton
                  className="decky-unison-btn-compact"
                  onClick={handleAddTarget}
                  style={{ height: "26px", fontSize: "11px", padding: "0 8px", color: "#67c1f5" }}
                >
                  <FaPlus /> Add Destination
                </DialogButton>
              </div>

              {targets.length > 1 && (
                <Focusable
                  flow-children="horizontal"
                  style={{
                    display: "flex",
                    gap: "6px",
                    overflowX: "auto",
                    paddingBottom: "4px",
                  }}
                >
                  {targets.map((tgt, idx) => {
                    const r = remotes.find((rem) => rem.id === tgt.remote_id);
                    const label = tgt.name || r?.name || `Destination ${idx + 1}`;
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

              {/* Target Details Card */}
              {currentTarget && (
                <div
                  style={{
                    background: "rgba(0, 0, 0, 0.25)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    padding: "12px",
                    borderRadius: "8px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "12px", color: "#67c1f5", fontWeight: "bold" }}>
                      {currentTarget.name || `Destination #${currentIdx + 1}`}
                    </span>
                    {targets.length > 1 && (
                      <DialogButton
                        className="decky-unison-btn-compact"
                        onClick={() => handleRemoveTarget(currentIdx)}
                        style={{ color: "#e74c3c", height: "24px", fontSize: "10px", padding: "0 8px" }}
                      >
                        <FaTrash /> Remove Destination
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
                      ⚠️ No sync remotes configured yet. Add one in the Settings tab first.
                    </div>
                  )}

                  <TextField
                    label="Destination Nickname"
                    description="e.g. Main PC, Living Room NAS, Travel Laptop"
                    value={currentTarget.name || ""}
                    onChange={(e) => updateCurrentTarget({ name: e.target.value })}
                  />

                  <TextField
                    label="Remote Save Directory (Absolute Path)"
                    description="e.g. /home/user/saves/GameName or C:/Saves/GameName"
                    value={currentTarget.remote_path}
                    onChange={(e) => updateCurrentTarget({ remote_path: e.target.value })}
                  />

                  <DropdownItem
                    label="Conflict Resolution"
                    description="Action when files differ on both Steam Deck and Server"
                    rgOptions={[
                      { label: "Automatic (Newer file wins)", data: "newer" },
                      { label: "Steam Deck Priority (Deck overwrites remote)", data: "root1" },
                      { label: "Remote Priority (Remote overwrites Deck)", data: "root2" },
                    ]}
                    selectedOption={currentTarget.prefer || "newer"}
                    onChange={(opt) => updateCurrentTarget({ prefer: opt.data as any })}
                  />
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SAFETY & SYNC RULES */}
          {activeTab === "rules" && currentTarget && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {/* Group 1: Backup Protection */}
              <DialogControlsSection>
                <div style={{ fontSize: "12px", fontWeight: "bold", color: "#67c1f5", marginBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <FaShieldAlt /> Save Protection & Backups
                </div>

                <ToggleField
                  label="Versioned Backup Snapshots"
                  description="Preserves timestamped copies before overwriting save files"
                  checked={currentTarget.backup ?? true}
                  onChange={(val) => updateCurrentTarget({ backup: val })}
                />

                {(currentTarget.backup ?? true) && (
                  <TextField
                    label="Maximum Saved Backups"
                    description="Number of past save snapshots to retain"
                    value={String(currentTarget.maxbackups || 5)}
                    onChange={(e) => updateCurrentTarget({ maxbackups: Number(e.target.value) || 5 })}
                  />
                )}

                <ToggleField
                  label="Safeguard Big Deletions"
                  description="Aborts synchronization if a large deletion occurs"
                  checked={currentTarget.confirmbigdel ?? false}
                  onChange={(val) => updateCurrentTarget({ confirmbigdel: val })}
                />
              </DialogControlsSection>

              {/* Group 2: Automation & Timestamps */}
              <DialogControlsSection>
                <div style={{ fontSize: "12px", fontWeight: "bold", color: "#67c1f5", marginBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <FaClock /> Automation & Timestamps
                </div>

                <ToggleField
                  label="Auto-Accept Non-Conflicts"
                  description="Automatically synchronize all non-conflicting save updates"
                  checked={currentTarget.auto ?? true}
                  onChange={(val) => updateCurrentTarget({ auto: val })}
                />

                <ToggleField
                  label="Preserve File Timestamps"
                  description="Synchronizes file modification times across replicas"
                  checked={currentTarget.times ?? true}
                  onChange={(val) => updateCurrentTarget({ times: val })}
                />

                <ToggleField
                  label="Non-Interactive Batch Mode"
                  description="Runs silently in background without interactive prompts"
                  checked={currentTarget.batch ?? true}
                  onChange={(val) => updateCurrentTarget({ batch: val })}
                />
              </DialogControlsSection>

              {/* Group 3: Troubleshooting */}
              <DialogControlsSection>
                <div style={{ fontSize: "12px", fontWeight: "bold", color: "#8b929a", marginBottom: "4px" }}>
                  Troubleshooting & Advanced
                </div>

                <ToggleField
                  label="Bypass Archive Mismatch (-ignorearchives)"
                  description="Enable if Unison reports an archive mismatch or to reset sync state"
                  checked={currentTarget.ignorearchives ?? false}
                  onChange={(val) => updateCurrentTarget({ ignorearchives: val })}
                />

                <TextField
                  label="Custom Unison CLI Arguments"
                  description="Optional flags passed directly to Unison"
                  value={currentTarget.extra_args || ""}
                  onChange={(e) => updateCurrentTarget({ extra_args: e.target.value })}
                />
              </DialogControlsSection>
            </div>
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
