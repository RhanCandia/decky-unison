import {
  PanelSection,
  PanelSectionRow,
  ButtonItem,
  DialogButton,
  Focusable,
  showModal,
} from "@decky/ui";
import { toaster } from "@decky/api";
import { useState, useEffect } from "react";
import { NonSteamGame, GameProfile, RemoteConfig, HistoryEntry } from "../types";
import {
  getNonSteamGames,
  getGameProfiles,
  getRemotes,
  triggerSync,
  getHistory,
  getLatestSyncLog,
} from "../api";
import { GameProfileModal } from "./GameProfileModal";
import { RemoteManagerModal } from "./RemoteManagerModal";
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
} from "react-icons/fa";

export function QuickAccessPanel() {
  const [activeTab, setActiveTab] = useState<"games" | "settings">("games");
  const [games, setGames] = useState<NonSteamGame[]>([]);
  const [profiles, setProfiles] = useState<GameProfile[]>([]);
  const [remotes, setRemotes] = useState<RemoteConfig[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

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
    } catch (e) {
      console.error("[DeckyUnison] Refresh error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAll();
  }, []);

  const handleSyncGame = async (profile: GameProfile) => {
    if (!profile.id) return;
    setSyncingId(profile.id);
    toaster.toast({
      title: "Unison Syncing",
      body: `Syncing ${profile.game_name}...`,
    });

    try {
      const res = await triggerSync(profile.id);
      if (res.success) {
        toaster.toast({
          title: "Sync Finished",
          body: `${profile.game_name}: ${res.direction_label || res.details}`,
        });
      } else {
        toaster.toast({
          title: "Sync Failed",
          body: `${profile.game_name}: ${res.details || "Check sync log for details"}`,
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

  const openRemoteManager = () => {
    showModal(<RemoteManagerModal onSaved={refreshAll} />);
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

  const renderDirectionBadge = (prof: GameProfile) => {
    const dir = prof.last_direction;
    const label = prof.last_direction_label || prof.last_details;

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
    } else if (dir === "in_sync" || prof.last_status === "in_sync") {
      return (
        <span style={{ color: "#8b929a", display: "flex", alignItems: "center", gap: "3px", fontSize: "11px" }}>
          <FaCheckCircle /> In sync
        </span>
      );
    } else if (prof.last_status === "error" || dir === "error") {
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
    <>
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
            background: activeTab === "games" ? "#1a9fff" : "rgba(255, 255, 255, 0.06)",
            color: activeTab === "games" ? "#ffffff" : "#8b929a",
          }}
        >
          <FaGamepad /> Games ({profiles.length})
        </DialogButton>
        <DialogButton
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
            background: activeTab === "settings" ? "#1a9fff" : "rgba(255, 255, 255, 0.06)",
            color: activeTab === "settings" ? "#ffffff" : "#8b929a",
          }}
        >
          <FaCog /> Settings
        </DialogButton>
      </Focusable>

      {/* TAB 1: GAMES */}
      {activeTab === "games" && (
        <>
          <PanelSection title="Initialized Games">
            {loading ? (
              <PanelSectionRow>
                <div style={{ padding: "12px", color: "#8b929a", textAlign: "center", fontSize: "11px" }}>
                  Loading game profiles...
                </div>
              </PanelSectionRow>
            ) : profiles.length > 0 ? (
              profiles.map((prof) => {
                const isSyncing = syncingId === prof.id;
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
                          {renderDirectionBadge(prof)}
                        </div>
                      </div>

                      {/* Row 2: Timestamp */}
                      <div style={{ fontSize: "10px", color: "#8b929a" }}>
                        Last synced: {formatTime(prof.last_synced)}
                      </div>

                      {/* Row 3: Action Buttons (Focusable with horizontal navigation) */}
                      <Focusable
                        flow-children="horizontal"
                        style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "2px", width: "100%" }}
                      >
                        {/* Primary Sync button */}
                        <DialogButton
                          onClick={() => handleSyncGame(prof)}
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
                          }}
                        >
                          <FaSyncAlt className={isSyncing ? "spin" : ""} />
                          <span>{isSyncing ? "Syncing..." : "Sync"}</span>
                        </DialogButton>

                        {/* Compact Config Icon Button */}
                        <DialogButton
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
                          }}
                        >
                          <FaCog />
                        </DialogButton>

                        {/* Compact Log Icon Button */}
                        {prof.last_synced && (
                          <DialogButton
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
                              color: prof.last_status === "error" ? "#e74c3c" : undefined,
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
                  No games initialized yet. Select a Non-Steam game below to set up Unison.
                </div>
              </PanelSectionRow>
            )}
          </PanelSection>

          {/* Available Non-Steam Games to Initialize */}
          <PanelSection title="Non-Steam Games Detected">
            {unconfiguredGames.length > 0 ? (
              unconfiguredGames.map((game) => (
                <PanelSectionRow key={game.app_id}>
                  <Focusable
                    flow-children="horizontal"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "4px 0",
                      width: "100%",
                      gap: "8px",
                    }}
                  >
                    <div style={{ flex: 1, overflow: "hidden" }}>
                      <div
                        style={{
                          fontSize: "12px",
                          fontWeight: "bold",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {game.name}
                      </div>
                      <div style={{ fontSize: "10px", color: "#8b929a" }}>AppID: {game.app_id}</div>
                    </div>
                    <DialogButton
                      onClick={() => openProfileConfig(game)}
                      style={{
                        height: "30px",
                        minWidth: "64px",
                        padding: "0 10px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "5px",
                        fontSize: "11px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <FaPlus /> Init
                    </DialogButton>
                  </Focusable>
                </PanelSectionRow>
              ))
            ) : (
              <PanelSectionRow>
                <div style={{ padding: "12px", color: "#8b929a", textAlign: "center", fontSize: "11px" }}>
                  {games.length === 0
                    ? "No Non-Steam games detected in Steam shortcuts."
                    : "All detected Non-Steam games are initialized!"}
                </div>
              </PanelSectionRow>
            )}
          </PanelSection>
        </>
      )}

      {/* TAB 2: SETTINGS */}
      {activeTab === "settings" && (
        <>
          <PanelSection title="Remotes & Connections">
            <PanelSectionRow>
              <ButtonItem layout="below" onClick={openRemoteManager}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontSize: "12px" }}>
                  <FaServer /> Manage Remotes & SSH Key
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
                    onActivate={() => openLogModal(item)}
                    onClick={() => openLogModal(item)}
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
                    <div style={{ flex: 1, overflow: "hidden" }}>
                      <span style={{ fontWeight: "bold" }}>{item.game_name}</span>
                      <span style={{ color: "#8b929a", marginLeft: "6px" }}>({formatTime(item.timestamp)})</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
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
    </>
  );
}
