import {
  PanelSection,
  PanelSectionRow,
  ButtonItem,
  DialogButton,
  Field,
  Focusable,
  showModal,
} from "@decky/ui";
import { toaster } from "@decky/api";
import { useState, useEffect } from "react";
import { NonSteamGame, GameProfile, RemoteConfig, HistoryEntry, UnisonBinaryStatus } from "../types";
import {
  getNonSteamGames,
  getGameProfiles,
  getRemotes,
  triggerSync,
  setActiveTarget,
  getHistory,
  getLatestSyncLog,
  testRemote,
  getUnisonStatus,
  downloadUnisonBinary,
} from "../api";
import { GameProfileModal } from "./GameProfileModal";
import { RemoteConfigModal } from "./RemoteConfigModal";
import { SyncLogModal } from "./SyncLogModal";
import {
  FaSyncAlt,
  FaServer,
  FaGamepad,
  FaCog,
  FaCheckCircle,
  FaExclamationCircle,
  FaPlus,
  FaFileAlt,
  FaArrowUp,
  FaArrowDown,
  FaExchangeAlt,
  FaChevronDown,
  FaChevronUp,
  FaCloudDownloadAlt,
} from "react-icons/fa";

export function QuickAccessPanel() {
  const [activeTab, setActiveTab] = useState<"games" | "settings">("games");
  const [games, setGames] = useState<NonSteamGame[]>([]);
  const [profiles, setProfiles] = useState<GameProfile[]>([]);
  const [remotes, setRemotes] = useState<RemoteConfig[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [binaryStatus, setBinaryStatus] = useState<UnisonBinaryStatus | null>(null);
  const [downloadingBinary, setDownloadingBinary] = useState<boolean>(false);
  const [checkingBinary, setCheckingBinary] = useState<boolean>(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [testingRemoteId, setTestingRemoteId] = useState<string | null>(null);
  const [remoteStatusMap, setRemoteStatusMap] = useState<Record<string, { success: boolean; message: string }>>({});
  const [openDropdownProfileId, setOpenDropdownProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const checkBinary = async (forceUpdateCheck: boolean = false) => {
    try {
      setCheckingBinary(true);
      const res = await getUnisonStatus(forceUpdateCheck);
      setBinaryStatus(res);
      if (forceUpdateCheck) {
        if (res.update_available) {
          toaster.toast({
            title: "Unison Update Available",
            body: `Version v${res.latest_version} is available to install.`,
          });
        } else if (res.installed) {
          toaster.toast({
            title: "Unison Up to Date",
            body: `You are running the latest version (v${res.version || res.latest_version}).`,
          });
        }
      }
    } catch (e: any) {
      console.error("[DeckyUnison] Binary status check error:", e);
    } finally {
      setCheckingBinary(false);
    }
  };

  const handleDownloadBinary = async () => {
    setDownloadingBinary(true);
    toaster.toast({
      title: "Downloading Unison",
      body: "Fetching official stable release archive...",
    });
    try {
      const res = await downloadUnisonBinary();
      if (res.success) {
        toaster.toast({
          title: "Unison Installed",
          body: res.message || `Unison v${res.version} is ready.`,
        });
        await checkBinary(false);
      } else {
        toaster.toast({
          title: "Installation Failed",
          body: res.message || "Could not install Unison binary.",
        });
      }
    } catch (e: any) {
      toaster.toast({
        title: "Download Error",
        body: e?.message || "Failed to download Unison.",
      });
    } finally {
      setDownloadingBinary(false);
    }
  };

  const refreshAll = async () => {
    try {
      const [g, p, r, h] = await Promise.all([
        getNonSteamGames(),
        getGameProfiles(),
        getRemotes(),
        getHistory(),
      ]);
      setGames(g);
      setProfiles(p);
      setRemotes(r);
      setHistory(h);
      await checkBinary(false);
    } catch (e) {
      console.error("[DeckyUnison] Refresh error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAll();
  }, []);

  const handleSyncGame = async (profile: GameProfile, targetId?: string) => {
    if (!profile.id) return;
    if (binaryStatus && !binaryStatus.installed) {
      toaster.toast({
        title: "Unison Missing",
        body: "Please download Unison using the banner above before syncing.",
      });
      return;
    }
    setSyncingId(profile.id);

    const targets = profile.targets || [];
    const curTarget =
      (targetId ? targets.find((t) => t.id === targetId) : undefined) ||
      targets.find((t) => t.id === profile.active_target_id) ||
      targets[0];
    const targetRemote = remotes.find((r) => r.id === curTarget?.remote_id);
    const targetLabel = curTarget?.name || targetRemote?.name || "Remote";

    toaster.toast({
      title: "Unison Syncing",
      body: `Syncing ${profile.game_name} (${targetLabel})...`,
    });

    try {
      const res = await triggerSync(profile.id, curTarget?.id);
      if (res.success) {
        toaster.toast({
          title: "Sync Finished",
          body: `${profile.game_name} (${targetLabel}): ${res.direction_label || res.details}`,
        });
      } else {
        toaster.toast({
          title: "Sync Failed",
          body: `${profile.game_name} (${targetLabel}): ${res.details || "Check sync log for details"}`,
        });
      }
    } catch (e: any) {
      toaster.toast({
        title: "Sync Error",
        body: e.message || "Failed to execute Unison",
      });
    } finally {
      setSyncingId(null);
      refreshAll();
    }
  };

  const handleTargetChange = async (profileId: string, newTargetId: string) => {
    try {
      await setActiveTarget(profileId, newTargetId);
      setProfiles((prev) =>
        prev.map((p) => {
          if (p.id === profileId) {
            return { ...p, active_target_id: newTargetId };
          }
          return p;
        })
      );
    } catch (e) {
      console.error("[DeckyUnison] Failed to switch target:", e);
    }
  };

  const openProfileConfig = (game: NonSteamGame, existingProfile?: GameProfile) => {
    showModal(
      <GameProfileModal
        game={game}
        existingProfile={existingProfile}
        remotes={remotes}
        onSaved={refreshAll}
      />
    );
  };

  const openEditRemoteModal = (remote?: RemoteConfig) => {
    showModal(<RemoteConfigModal remote={remote} onSaved={refreshAll} />);
  };

  const handleTestRemoteInline = async (remote: RemoteConfig) => {
    if (!remote.id) return;
    setTestingRemoteId(remote.id);
    try {
      const res = await testRemote(remote.id);
      setRemoteStatusMap((prev) => ({ ...prev, [remote.id!]: res }));
      toaster.toast({
        title: res.success ? "Remote Connected" : "Connection Failed",
        body: `${remote.name}: ${res.message}`,
      });
    } catch (e: any) {
      setRemoteStatusMap((prev) => ({
        ...prev,
        [remote.id!]: { success: false, message: e?.message || "Test error" },
      }));
      toaster.toast({
        title: "Connection Error",
        body: `${remote.name}: ${e?.message || "Failed to reach remote"}`,
      });
    } finally {
      setTestingRemoteId(null);
    }
  };

  const openLogModal = (log: HistoryEntry) => {
    showModal(<SyncLogModal log={log} />);
  };

  const openLogForProfile = async (profileId: string, gameName: string) => {
    const found = history.find((h) => h.profile_id === profileId);
    if (found) {
      openLogModal(found);
    } else {
      const latest = await getLatestSyncLog(profileId);
      if (latest) {
        openLogModal(latest);
      } else {
        toaster.toast({
          title: "No Log Found",
          body: `No sync history available for ${gameName}`,
        });
      }
    }
  };

  const formatTime = (ts?: number | null) => {
    if (!ts) return "Never";
    const d = new Date(ts * 1000);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const renderDirectionBadge = (item?: {
    last_direction?: string | null;
    last_direction_label?: string | null;
    last_details?: string | null;
    last_status?: string | null;
  }) => {
    const dir = item?.last_direction;
    const label = item?.last_direction_label || item?.last_details;
    const status = item?.last_status;

    if (dir === "upload") {
      return (
        <span style={{ color: "#2ecc71", display: "flex", alignItems: "center", gap: "3px", fontSize: "11px" }}>
          <FaArrowUp /> {label || "Deck ➔ Server"}
        </span>
      );
    } else if (dir === "download") {
      return (
        <span style={{ color: "#3498db", display: "flex", alignItems: "center", gap: "3px", fontSize: "11px" }}>
          <FaArrowDown /> {label || "Server ➔ Deck"}
        </span>
      );
    } else if (dir === "bidirectional") {
      return (
        <span style={{ color: "#f39c12", display: "flex", alignItems: "center", gap: "3px", fontSize: "11px" }}>
          <FaExchangeAlt /> {label || "Both ways"}
        </span>
      );
    } else if (dir === "in_sync" || status === "in_sync") {
      return (
        <span style={{ color: "#8b929a", display: "flex", alignItems: "center", gap: "3px", fontSize: "11px" }}>
          <FaCheckCircle /> In sync
        </span>
      );
    } else if (status === "error" || dir === "error") {
      return (
        <span style={{ color: "#e74c3c", display: "flex", alignItems: "center", gap: "3px", fontSize: "11px" }}>
          <FaExclamationCircle /> Error
        </span>
      );
    }
    return (
      <span style={{ color: "#8b929a", fontSize: "11px" }}>
        Ready
      </span>
    );
  };

  const unconfiguredGames = games.filter(
    (g) => !profiles.some((p) => p.app_id === g.app_id)
  );

  return (
    <div className="decky-unison-root">
      {/* Global CSS for visible Controller & Hover focus highlighting */}
      <style>{`
        .decky-unison-root {
          width: 100%;
        }
        .decky-unison-btn,
        .decky-unison-tab,
        .decky-unison-card {
          transition: all 0.12s ease-in-out !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
        }
        /* Buttons Focus & Hover */
        .decky-unison-btn:focus,
        .decky-unison-btn:focus-visible,
        .decky-unison-btn:hover,
        .decky-unison-btn.gpfocus,
        .decky-unison-btn[data-gpfocus="true"],
        .decky-unison-btn.focused {
          outline: 2px solid #ffffff !important;
          outline-offset: 1px !important;
          box-shadow: 0 0 10px rgba(255, 255, 255, 0.9), inset 0 0 4px rgba(255, 255, 255, 0.3) !important;
          border-color: #ffffff !important;
          filter: brightness(1.25) !important;
          z-index: 2 !important;
        }
        /* Tab Navigation Focus & Hover */
        .decky-unison-tab:focus,
        .decky-unison-tab:focus-visible,
        .decky-unison-tab:hover,
        .decky-unison-tab.gpfocus,
        .decky-unison-tab[data-gpfocus="true"],
        .decky-unison-tab.focused {
          outline: 2px solid #ffffff !important;
          outline-offset: 1px !important;
          box-shadow: 0 0 10px rgba(255, 255, 255, 0.9) !important;
          border-color: #ffffff !important;
          filter: brightness(1.2) !important;
          z-index: 2 !important;
        }
        /* Card & Row Focus & Hover */
        .decky-unison-card:focus,
        .decky-unison-card:focus-visible,
        .decky-unison-card:hover,
        .decky-unison-card.gpfocus,
        .decky-unison-card[data-gpfocus="true"],
        .decky-unison-card.focused {
          outline: 2px solid #ffffff !important;
          outline-offset: 1px !important;
          box-shadow: 0 0 12px rgba(26, 159, 255, 0.9) !important;
          border-color: #67c1f5 !important;
          background: rgba(26, 159, 255, 0.22) !important;
        }
        /* Catch-all for any focused interactive element in decky-unison */
        .decky-unison-root *:focus,
        .decky-unison-root *:focus-visible,
        .decky-unison-root *.gpfocus,
        .decky-unison-root *[data-gpfocus="true"],
        .decky-unison-root *.focused {
          outline: 2px solid #ffffff !important;
          outline-offset: 1px !important;
        }
      `}</style>

      {/* Top Info Banner / Unison Binary Availability Checker */}
      {binaryStatus && !binaryStatus.installed ? (
        <div
          style={{
            background: "rgba(230, 126, 34, 0.14)",
            border: "1px solid rgba(230, 126, 34, 0.45)",
            borderRadius: "6px",
            padding: "8px 10px",
            margin: "4px 0 14px 0",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, overflow: "hidden" }}>
              <FaExclamationCircle style={{ color: "#e67e22", fontSize: "16px", flexShrink: 0 }} />
              <div style={{ overflow: "hidden" }}>
                <div style={{ color: "#ffffff", fontWeight: "bold", fontSize: "12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  Unison Not Installed
                </div>
                <div style={{ color: "#c9d1d9", fontSize: "10px", marginTop: "1px" }}>
                  Required to sync game saves.
                </div>
              </div>
            </div>
            <DialogButton
              className="decky-unison-btn"
              onClick={handleDownloadBinary}
              disabled={downloadingBinary}
              style={{
                height: "28px",
                minWidth: "92px",
                width: "auto",
                padding: "0 10px",
                background: "#1a9fff",
                color: "#ffffff",
                fontSize: "11px",
                fontWeight: "bold",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "5px",
                flexShrink: 0,
              }}
            >
              <FaCloudDownloadAlt className={downloadingBinary ? "spin" : ""} />
              {downloadingBinary ? "Installing..." : "Download"}
            </DialogButton>
          </div>
        </div>
      ) : binaryStatus?.installed ? (
        <div
          style={{
            background: "rgba(255, 255, 255, 0.04)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "6px",
            padding: "6px 10px",
            margin: "4px 0 14px 0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "11px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px", overflow: "hidden" }}>
            <span style={{ color: "#2ecc71", fontSize: "9px" }}>●</span>
            <span style={{ color: "#8b929a" }}>Unison:</span>
            <strong style={{ color: "#ffffff", whiteSpace: "nowrap" }}>
              v{binaryStatus.version || "Ready"}
            </strong>
            {binaryStatus.update_available && (
              <span
                style={{
                  background: "rgba(230, 126, 34, 0.2)",
                  color: "#e67e22",
                  border: "1px solid rgba(230, 126, 34, 0.4)",
                  borderRadius: "4px",
                  padding: "1px 5px",
                  fontSize: "9px",
                  fontWeight: "bold",
                }}
              >
                v{binaryStatus.latest_version} available
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {binaryStatus.update_available && (
              <DialogButton
                className="decky-unison-btn-compact"
                onClick={handleDownloadBinary}
                disabled={downloadingBinary}
                style={{
                  height: "22px",
                  padding: "0 8px",
                  background: "#1a9fff",
                  color: "#ffffff",
                  fontSize: "10px",
                  fontWeight: "bold",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <FaCloudDownloadAlt className={downloadingBinary ? "spin" : ""} />
                {downloadingBinary ? "Updating..." : "Update"}
              </DialogButton>
            )}

            <DialogButton
              className="decky-unison-btn-compact"
              onClick={() => checkBinary(true)}
              disabled={checkingBinary}
              style={{
                height: "22px",
                padding: "0 6px",
                background: "rgba(255, 255, 255, 0.08)",
                color: checkingBinary ? "#1a9fff" : "#8b929a",
                fontSize: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <FaSyncAlt className={checkingBinary ? "spin" : ""} />
            </DialogButton>
          </div>
        </div>
      ) : null}

      {/* Tab Navigation Header - Focusable for controller */}
      <Focusable
        flow-children="horizontal"
        style={{
          display: "flex",
          gap: "6px",
          background: "rgba(0, 0, 0, 0.4)",
          padding: "4px",
          borderRadius: "6px",
          marginBottom: "12px",
        }}
      >
        <DialogButton
          className="decky-unison-tab"
          onClick={() => setActiveTab("games")}
          style={{
            flex: 1,
            height: "34px",
            minWidth: "auto",
            padding: "0 8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            fontSize: "12px",
            fontWeight: activeTab === "games" ? "bold" : "normal",
            background: activeTab === "games" ? "#1a9fff" : "rgba(255, 255, 255, 0.08)",
            color: activeTab === "games" ? "#ffffff" : "#c9d1d9",
          }}
        >
          <FaGamepad /> Games ({profiles.length})
        </DialogButton>
        <DialogButton
          className="decky-unison-tab"
          onClick={() => setActiveTab("settings")}
          style={{
            flex: 1,
            height: "34px",
            minWidth: "auto",
            padding: "0 8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            fontSize: "12px",
            fontWeight: activeTab === "settings" ? "bold" : "normal",
            background: activeTab === "settings" ? "#1a9fff" : "rgba(255, 255, 255, 0.08)",
            color: activeTab === "settings" ? "#ffffff" : "#c9d1d9",
          }}
        >
          <FaCog /> Settings
        </DialogButton>
      </Focusable>

      {/* TAB 1: GAMES */}
      {activeTab === "games" && (
        <>
          <PanelSection title="Synced Games">
            {loading ? (
              <PanelSectionRow>
                <div style={{ padding: "12px", color: "#8b929a", textAlign: "center", fontSize: "11px" }}>
                  Loading game profiles...
                </div>
              </PanelSectionRow>
            ) : profiles.length > 0 ? (
              profiles.map((prof) => {
                const isSyncing = syncingId === prof.id;
                const targets = prof.targets && prof.targets.length > 0 ? prof.targets : [];
                const activeTargetId = prof.active_target_id || targets[0]?.id;
                const activeTarget = targets.find((t) => t.id === activeTargetId) || targets[0];
                const activeRemote = remotes.find((r) => r.id === activeTarget?.remote_id);
                const targetLabel = activeTarget?.name || activeRemote?.name || "Remote";

                const matchingGame = games.find((g) => g.app_id === prof.app_id) || {
                  app_id: prof.app_id,
                  name: prof.game_name,
                  exe: "",
                  start_dir: "",
                  compatdata_path: "",
                  compatdata_exists: true,
                  has_proton_prefix: true,
                };

                return (
                  <PanelSectionRow key={prof.id}>
                    <div
                      style={{
                        background: "rgba(255, 255, 255, 0.04)",
                        borderRadius: "6px",
                        padding: "8px 10px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                        width: "100%",
                        boxSizing: "border-box",
                      }}
                    >
                      {/* Row 1: Title and Direction Badge */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "6px" }}>
                        <div
                          style={{
                            fontWeight: "bold",
                            fontSize: "13px",
                            color: "#fff",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            flex: 1,
                          }}
                          title={prof.game_name}
                        >
                          {prof.game_name}
                        </div>
                        <div>
                          {renderDirectionBadge(activeTarget || prof)}
                        </div>
                      </div>

                      {/* Row 2: Target Selector (In-Panel Contained Dropdown) */}
                      {targets.length > 1 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px", margin: "2px 0" }}>
                          <DialogButton
                            className="decky-unison-btn"
                            onClick={() =>
                              setOpenDropdownProfileId(
                                openDropdownProfileId === prof.id ? null : prof.id!
                              )
                            }
                            style={{
                              height: "28px",
                              width: "100%",
                              padding: "0 10px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              fontSize: "11px",
                              background: "rgba(255, 255, 255, 0.08)",
                              color: "#fff",
                              borderRadius: "4px",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", overflow: "hidden" }}>
                              <span style={{ color: "#8b929a" }}>Target:</span>
                              <strong style={{ color: "#67c1f5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {targetLabel}
                              </strong>
                              {activeRemote?.type && (
                                <span style={{ fontSize: "9px", color: "#8b929a" }}>
                                  ({activeRemote.type.toUpperCase()})
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: "10px", color: "#8b929a", marginLeft: "6px" }}>
                              {openDropdownProfileId === prof.id ? <FaChevronUp /> : <FaChevronDown />}
                            </span>
                          </DialogButton>

                          {/* Contained In-Panel Dropdown Menu (Strictly within QAM sidebar) */}
                          {openDropdownProfileId === prof.id && (
                            <div
                              style={{
                                background: "rgba(18, 22, 28, 0.95)",
                                border: "1px solid rgba(103, 193, 245, 0.4)",
                                borderRadius: "6px",
                                overflow: "hidden",
                                display: "flex",
                                flexDirection: "column",
                                boxShadow: "0 4px 14px rgba(0, 0, 0, 0.6)",
                                marginTop: "2px",
                              }}
                            >
                              <Focusable flow-children="vertical" style={{ display: "flex", flexDirection: "column" }}>
                                {targets.map((t, tIdx) => {
                                  const isSelected = t.id === activeTarget?.id;
                                  const r = remotes.find((rem) => rem.id === t.remote_id);
                                  const label = t.name || r?.name || `Target ${tIdx + 1}`;
                                  return (
                                    <DialogButton
                                      key={t.id}
                                      className="decky-unison-btn"
                                      onClick={() => {
                                        handleTargetChange(prof.id!, t.id);
                                        setOpenDropdownProfileId(null);
                                      }}
                                      style={{
                                        height: "30px",
                                        minHeight: "30px",
                                        padding: "0 10px",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        background: isSelected ? "rgba(26, 159, 255, 0.25)" : "transparent",
                                        border: "none",
                                        borderBottom: tIdx < targets.length - 1 ? "1px solid rgba(255, 255, 255, 0.06)" : "none",
                                        borderRadius: "0",
                                        fontSize: "11px",
                                        color: isSelected ? "#67c1f5" : "#c9d1d9",
                                        fontWeight: isSelected ? "bold" : "normal",
                                        textAlign: "left",
                                      }}
                                    >
                                      <div style={{ display: "flex", alignItems: "center", gap: "6px", overflow: "hidden" }}>
                                        <span style={{ color: isSelected ? "#67c1f5" : "transparent", fontSize: "8px" }}>●</span>
                                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                          {label}
                                        </span>
                                      </div>
                                      {r?.type && (
                                        <span style={{ fontSize: "9px", color: isSelected ? "#67c1f5" : "#8b929a", marginLeft: "6px", flexShrink: 0 }}>
                                          {r.type.toUpperCase()}
                                        </span>
                                      )}
                                    </DialogButton>
                                  );
                                })}
                              </Focusable>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "#8b929a" }}>
                          <span>
                            Target: <strong style={{ color: "#67c1f5" }}>{targetLabel}</strong>
                            {activeRemote?.type ? ` (${activeRemote.type.toUpperCase()})` : ""}
                          </span>
                        </div>
                      )}

                      {/* Row 3: Timestamp */}
                      <div style={{ fontSize: "10px", color: "#8b929a" }}>
                        Last synced: {formatTime(activeTarget?.last_synced ?? prof.last_synced)}
                      </div>

                      {/* Row 4: Action Buttons (Focusable with horizontal navigation) */}
                      <Focusable
                        flow-children="horizontal"
                        style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "2px", width: "100%" }}
                      >
                        {/* Primary Sync button */}
                        <DialogButton
                          className="decky-unison-btn"
                          onClick={() => handleSyncGame(prof, activeTarget?.id)}
                          disabled={isSyncing}
                          style={{
                            flex: 1,
                            height: "32px",
                            minWidth: "auto",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "6px",
                            fontSize: "12px",
                            fontWeight: "bold",
                            background: isSyncing ? "#444" : "#1a9fff",
                            color: "#fff",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <FaSyncAlt className={isSyncing ? "spin" : ""} />
                          <span>
                            {isSyncing
                              ? "Syncing..."
                              : targets.length > 1
                              ? `Sync (${targetLabel})`
                              : "Sync"}
                          </span>
                        </DialogButton>

                        {/* Compact Config Icon Button */}
                        <DialogButton
                          className="decky-unison-btn"
                          onClick={() => openProfileConfig(matchingGame, prof)}
                          style={{
                            width: "36px",
                            height: "32px",
                            minWidth: "36px",
                            padding: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "13px",
                            background: "rgba(255, 255, 255, 0.08)",
                            color: "#c9d1d9",
                          }}
                        >
                          <FaCog />
                        </DialogButton>

                        {/* Compact Log Icon Button */}
                        {(activeTarget?.last_synced || prof.last_synced) && (
                          <DialogButton
                            className="decky-unison-btn"
                            onClick={() => openLogForProfile(prof.id!, prof.game_name)}
                            style={{
                              width: "36px",
                              height: "32px",
                              minWidth: "36px",
                              padding: 0,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "13px",
                              background: "rgba(255, 255, 255, 0.08)",
                              color:
                                (activeTarget?.last_status ?? prof.last_status) === "error"
                                  ? "#e74c3c"
                                  : "#c9d1d9",
                            }}
                          >
                            <FaFileAlt />
                          </DialogButton>
                        )}
                      </Focusable>
                    </div>
                  </PanelSectionRow>
                );
              })
            ) : (
              <PanelSectionRow>
                <div style={{ padding: "12px", color: "#8b929a", textAlign: "center", fontSize: "11px" }}>
                  No games set up for sync yet. Select a detected game below to get started.
                </div>
              </PanelSectionRow>
            )}
          </PanelSection>

          {/* Available Non-Steam Games to Set Up - Using native Field for reliable layout */}
          <PanelSection title="Non-Steam Games Detected">
            {unconfiguredGames.length > 0 ? (
              unconfiguredGames.map((game) => (
                <PanelSectionRow key={game.app_id}>
                  <Field
                    label={
                      <div
                        style={{
                          color: "#ffffff",
                          fontWeight: "bold",
                          fontSize: "12px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={game.name}
                      >
                        {game.name}
                      </div>
                    }
                    description={
                      <div style={{ color: "#8b929a", fontSize: "10px" }}>
                        AppID: {game.app_id}
                      </div>
                    }
                  >
                    <DialogButton
                      className="decky-unison-btn"
                      onClick={() => openProfileConfig(game)}
                      style={{
                        height: "28px",
                        minWidth: "70px",
                        width: "auto",
                        padding: "0 10px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "5px",
                        fontSize: "11px",
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                    >
                      <FaPlus /> Set Up
                    </DialogButton>
                  </Field>
                </PanelSectionRow>
              ))
            ) : (
              <PanelSectionRow>
                <div style={{ padding: "12px", color: "#8b929a", textAlign: "center", fontSize: "11px" }}>
                  {games.length === 0
                    ? "No Non-Steam games detected in Steam shortcuts."
                    : "All detected Non-Steam games are set up for sync!"}
                </div>
              </PanelSectionRow>
            )}
          </PanelSection>
        </>
      )}

      {/* TAB 2: SETTINGS */}
      {activeTab === "settings" && (
        <>
          {/* Section 1: Configured Remotes */}
          <PanelSection title="Sync Remotes">
            {remotes.length > 0 ? (
              remotes.map((remote) => {
                const status = remoteStatusMap[remote.id!];
                return (
                  <PanelSectionRow key={remote.id}>
                    <Field
                      label={
                        <div
                          style={{
                            color: "#ffffff",
                            fontWeight: "bold",
                            fontSize: "12px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={remote.name}
                        >
                          {remote.name}
                        </div>
                      }
                      description={
                        <div style={{ color: "#8b929a", fontSize: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                          <span>
                            {remote.type === "ssh"
                              ? `SSH • ${remote.host}${remote.port && remote.port !== 22 ? `:${remote.port}` : ""}`
                              : remote.type === "socket"
                              ? `Socket • ${remote.host}:${remote.port || 26867}`
                              : `Local • ${remote.local_path || "Share"}`}
                          </span>
                          {status && (
                            <span style={{ color: status.success ? "#2ecc71" : "#e74c3c" }}>
                              {status.success ? "● Online" : "● Offline"}
                            </span>
                          )}
                        </div>
                      }
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <DialogButton
                          className="decky-unison-btn-compact"
                          onClick={() => handleTestRemoteInline(remote)}
                          disabled={testingRemoteId === remote.id}
                          style={{
                            height: "28px",
                            minWidth: "48px",
                            width: "auto",
                            padding: "0 8px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "4px",
                            fontSize: "11px",
                            whiteSpace: "nowrap",
                            flexShrink: 0,
                          }}
                        >
                          <FaServer /> {testingRemoteId === remote.id ? "..." : "Test"}
                        </DialogButton>
                        <DialogButton
                          className="decky-unison-btn-compact"
                          onClick={() => openEditRemoteModal(remote)}
                          style={{
                            height: "28px",
                            minWidth: "48px",
                            width: "auto",
                            padding: "0 8px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "4px",
                            fontSize: "11px",
                            whiteSpace: "nowrap",
                            flexShrink: 0,
                          }}
                        >
                          <FaCog /> Edit
                        </DialogButton>
                      </div>
                    </Field>
                  </PanelSectionRow>
                );
              })
            ) : (
              <PanelSectionRow>
                <div style={{ padding: "8px 12px", color: "#8b929a", textAlign: "center", fontSize: "11px" }}>
                  No sync remotes configured yet. Add one to begin syncing saves!
                </div>
              </PanelSectionRow>
            )}

            <PanelSectionRow>
              <ButtonItem layout="below" onClick={() => openEditRemoteModal()}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: "12px" }}>
                  <FaPlus /> Add New Remote
                </div>
              </ButtonItem>
            </PanelSectionRow>
          </PanelSection>

          {/* Recent History / Logs */}
          <PanelSection title="Recent Activity & Logs">
            {history.length > 0 ? (
              history.slice(0, 5).map((item, idx) => (
                <PanelSectionRow key={idx}>
                  <Focusable
                    focusClassName="focused"
                    onActivate={() => openLogModal(item)}
                    onClick={() => openLogModal(item)}
                    className="decky-unison-card"
                    style={{
                      fontSize: "11px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      width: "100%",
                      cursor: "pointer",
                      padding: "8px 10px",
                      borderRadius: "6px",
                      background: "rgba(255, 255, 255, 0.04)",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                      <span style={{ fontWeight: "bold", color: "#ffffff" }}>{item.game_name}</span>
                      <span style={{ color: "#8b929a", marginLeft: "6px" }}>({formatTime(item.timestamp)})</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                      <span style={{ color: item.success ? "#2ecc71" : "#e74c3c" }}>
                        {item.direction_label || item.status}
                      </span>
                      <span style={{ fontSize: "10px", color: "#67c1f5" }}>[Log]</span>
                    </div>
                  </Focusable>
                </PanelSectionRow>
              ))
            ) : (
              <PanelSectionRow>
                <div style={{ padding: "12px", color: "#8b929a", textAlign: "center", fontSize: "11px" }}>
                  No recent sync history recorded.
                </div>
              </PanelSectionRow>
            )}
          </PanelSection>
        </>
      )}
    </div>
  );
}
