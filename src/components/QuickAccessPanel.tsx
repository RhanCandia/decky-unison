import {
  PanelSection,
  PanelSectionRow,
  ButtonItem,
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
} from "../api";
import { GameProfileModal } from "./GameProfileModal";
import { RemoteManagerModal } from "./RemoteManagerModal";
import {
  FaSyncAlt,
  FaServer,
  FaCheckCircle,
  FaExclamationCircle,
  FaClock,
  FaPlus,
} from "react-icons/fa";

export function QuickAccessPanel() {
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
      title: "Unison Sync Started",
      body: `Syncing ${profile.game_name}...`,
    });

    try {
      const res = await triggerSync(profile.id);
      if (res.success) {
        toaster.toast({
          title: "Sync Succeeded",
          body: `${profile.game_name}: ${res.details}`,
        });
      } else {
        toaster.toast({
          title: "Sync Failed",
          body: `${profile.game_name}: ${res.details || "Check remote or logs"}`,
        });
      }
    } catch (e: any) {
      toaster.toast({
        title: "Sync Error",
        body: e.message || "Failed to run Unison",
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

  const formatTime = (ts?: number | null) => {
    if (!ts) return "Never";
    const d = new Date(ts * 1000);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const unconfiguredGames = games.filter(
    (g) => !profiles.some((p) => p.app_id === g.app_id)
  );

  return (
    <>
      {/* Remote & Server Status Section */}
      <PanelSection title="Central Server & Remotes">
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={openRemoteManager}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
              <FaServer /> Manage Remotes & SSH Key
            </div>
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>

      {/* Initialized Games with Unison */}
      <PanelSection title="Initialized Games">
        {loading ? (
          <PanelSectionRow>
            <div style={{ padding: "8px", color: "#8b929a", textAlign: "center" }}>
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
                    padding: "10px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: "bold", fontSize: "14px", color: "#fff" }}>
                      {prof.game_name}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        color:
                          prof.last_status === "in_sync" || prof.last_status === "updated"
                            ? "#2ecc71"
                            : prof.last_status === "error" || prof.last_status === "conflict"
                            ? "#e74c3c"
                            : "#8b929a",
                      }}
                    >
                      {prof.last_status === "in_sync" || prof.last_status === "updated" ? (
                        <FaCheckCircle />
                      ) : prof.last_status === "error" || prof.last_status === "conflict" ? (
                        <FaExclamationCircle />
                      ) : (
                        <FaClock />
                      )}
                      <span>{prof.last_status ? prof.last_status.replace("_", " ") : "Ready"}</span>
                    </div>
                  </div>

                  <div style={{ fontSize: "11px", color: "#8b929a" }}>
                    Last Synced: {formatTime(prof.last_synced)}
                    {prof.last_details ? ` (${prof.last_details})` : ""}
                  </div>

                  <div style={{ display: "flex", gap: "8px" }}>
                    <div style={{ flex: 1 }}>
                      <ButtonItem
                        layout="below"
                        disabled={isSyncing}
                        onClick={() => handleSyncGame(prof)}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                          <FaSyncAlt className={isSyncing ? "spin" : ""} />
                          {isSyncing ? "Syncing..." : "Sync Now"}
                        </div>
                      </ButtonItem>
                    </div>
                    <div style={{ width: "90px" }}>
                      <ButtonItem
                        layout="below"
                        onClick={() => openProfileConfig(matchingGame, prof)}
                      >
                        Config
                      </ButtonItem>
                    </div>
                  </div>
                </div>
              </PanelSectionRow>
            );
          })
        ) : (
          <PanelSectionRow>
            <div style={{ padding: "8px", color: "#8b929a", textAlign: "center", fontSize: "12px" }}>
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
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "4px 0",
                }}
              >
                <div>
                  <div style={{ fontSize: "13px", fontWeight: "bold" }}>{game.name}</div>
                  <div style={{ fontSize: "10px", color: "#8b929a" }}>AppID: {game.app_id}</div>
                </div>
                <div style={{ minWidth: "120px" }}>
                  <ButtonItem
                    layout="below"
                    onClick={() => openProfileConfig(game)}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                      <FaPlus /> Initialize
                    </div>
                  </ButtonItem>
                </div>
              </div>
            </PanelSectionRow>
          ))
        ) : (
          <PanelSectionRow>
            <div style={{ padding: "8px", color: "#8b929a", textAlign: "center", fontSize: "12px" }}>
              {games.length === 0
                ? "No Non-Steam games detected in Steam shortcuts."
                : "All detected Non-Steam games are initialized!"}
            </div>
          </PanelSectionRow>
        )}
      </PanelSection>

      {/* Recent History */}
      {history.length > 0 && (
        <PanelSection title="Recent Activity">
          {history.slice(0, 3).map((item, idx) => (
            <PanelSectionRow key={idx}>
              <div style={{ fontSize: "11px", display: "flex", justifyContent: "space-between", width: "100%" }}>
                <span>{item.game_name}</span>
                <span style={{ color: item.success ? "#2ecc71" : "#e74c3c" }}>
                  {item.status}: {formatTime(item.timestamp)}
                </span>
              </div>
            </PanelSectionRow>
          ))}
        </PanelSection>
      )}
    </>
  );
}
