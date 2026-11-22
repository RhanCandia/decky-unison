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
  Focusable,
  showModal,
} from "@decky/ui";
import { useState, useEffect } from "react";
import { saveRemote, testRemote, deleteRemote, getSSHConfigHosts, pairSSH } from "../api";
import { RemoteConfig, TestResult, SSHConfigHost } from "../types";
import { SSHKeyModal } from "./SSHKeyModal";
import { FaServer, FaCheckCircle, FaExclamationTriangle, FaBook, FaTrash, FaCog, FaKey } from "react-icons/fa";

interface RemoteConfigModalProps {
  remote?: RemoteConfig;
  closeModal?: () => void;
  onSaved?: () => void;
}

export function RemoteConfigModal({ remote, closeModal, onSaved }: RemoteConfigModalProps) {
  const isEditing = Boolean(remote?.id);

  const [name, setName] = useState<string>(remote?.name || "My Server");
  const [type, setType] = useState<"ssh" | "socket" | "local">(remote?.type || "ssh");
  const [host, setHost] = useState<string>(remote?.host || "");
  const [port, setPort] = useState<number>(remote?.port || (remote?.type === "socket" ? 26867 : 22));
  const [user, setUser] = useState<string>(remote?.user || "");
  const [keyPath, setKeyPath] = useState<string>(remote?.key_path || "");
  const [localPath, setLocalPath] = useState<string>(remote?.local_path || "");
  const [remoteUnisonPath, setRemoteUnisonPath] = useState<string>(remote?.remote_unison_path || "unison");

  // Authentication mode for SSH
  const [authMode, setAuthMode] = useState<"password" | "key">(isEditing ? "key" : "password");
  const [password, setPassword] = useState<string>("");
  const [pairing, setPairing] = useState<boolean>(false);
  const [pairResult, setPairResult] = useState<TestResult | null>(null);

  const [sshConfigHosts, setSshConfigHosts] = useState<SSHConfigHost[]>([]);
  const [testing, setTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      try {
        const hosts = await getSSHConfigHosts();
        setSshConfigHosts(hosts || []);
      } catch (e) {
        console.warn("[DeckyUnison] Failed to load SSH config hosts:", e);
      }
    })();
  }, []);

  const applySSHConfigHost = (cfg: SSHConfigHost) => {
    if (!remote?.id) {
      setName(cfg.alias);
    }
    setHost(cfg.alias);
    setType("ssh");
    setAuthMode("key");
    if (cfg.user) setUser(cfg.user);
    if (cfg.port) setPort(cfg.port);
    if (cfg.identityfile) setKeyPath(cfg.identityfile);
  };

  const handlePair = async () => {
    setPairing(true);
    setPairResult(null);
    try {
      const res = await pairSSH(host.trim(), user.trim(), password, Number(port) || 22);
      setPairResult(res);
      if (res.success) {
        // Pairing succeeded: key is now authorized, so test is also satisfied
        setTestResult(res);
      }
    } catch (e: any) {
      setPairResult({ success: false, message: e?.message || "Pairing failed" });
    } finally {
      setPairing(false);
    }
  };

  const handleSave = async () => {
    const payload: RemoteConfig = {
      id: remote?.id,
      name: name.trim() || "Server",
      type,
      host: host.trim(),
      port: Number(port) || 22,
      user: user.trim(),
      key_path: keyPath.trim(),
      local_path: localPath.trim(),
      remote_unison_path: remoteUnisonPath.trim() || "unison",
    };
    await saveRemote(payload);
    onSaved?.();
    closeModal?.();
  };

  const handleDelete = async () => {
    if (remote?.id) {
      await deleteRemote(remote.id);
      onSaved?.();
      closeModal?.();
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const saved = await saveRemote({
        id: remote?.id,
        name: name.trim() || "Server",
        type,
        host: host.trim(),
        port: Number(port) || 22,
        user: user.trim(),
        key_path: keyPath.trim(),
        local_path: localPath.trim(),
        remote_unison_path: remoteUnisonPath.trim() || "unison",
      });
      const res = await testRemote(saved.id!);
      setTestResult(res);
    } catch (e: any) {
      setTestResult({ success: false, message: e?.message || "Failed to test connection" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <ModalRoot onCancel={closeModal}>
      <DialogHeader>{isEditing ? "Edit Remote" : "Add New Remote"}</DialogHeader>
      <DialogSubHeader>
        {isEditing ? `Settings for "${remote?.name}"` : "Connect a sync server, PC, or network target"}
      </DialogSubHeader>

      <DialogBody>
        <div className="decky-unison-root" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {/* Section 1: Basic Info */}
          <DialogControlsSection>
            <DialogControlsSectionHeader>Remote Details</DialogControlsSectionHeader>

            <TextField
              label="Remote Name"
              description="A friendly label (e.g., Gaming PC, Home NAS, Cloud VPS)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <DropdownItem
              label="Protocol"
              rgOptions={[
                { label: "SSH (Standard for Linux, Windows OpenSSH, Cloud)", data: "ssh" },
                { label: "Unison Socket (Direct TCP socket://)", data: "socket" },
                { label: "Local Directory (Mounted SMB/NFS share)", data: "local" },
              ]}
              selectedOption={type}
              onChange={(opt) => {
                const newType = opt.data as "ssh" | "socket" | "local";
                setType(newType);
                if (newType === "socket" && port === 22) setPort(26867);
                if (newType === "ssh" && port === 26867) setPort(22);
              }}
            />
          </DialogControlsSection>

          {/* Section 2: Endpoint */}
          <DialogControlsSection>
            <DialogControlsSectionHeader>Connection Target</DialogControlsSectionHeader>

            {type !== "local" ? (
              <>
                <TextField
                  label="Host / IP Address"
                  description="e.g. 192.168.1.150, my-pc.local, or cloud IP"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                />

                {type === "ssh" && (
                  <>
                    <DropdownItem
                      label="Authentication Method"
                      description="Choose how to authenticate with this remote"
                      rgOptions={[
                        { label: "Password (One-Click Pairing — Easy Setup)", data: "password" },
                        { label: "SSH Key / ~/.ssh/config (Advanced)", data: "key" },
                      ]}
                      selectedOption={authMode}
                      onChange={(opt) => {
                        setAuthMode(opt.data as "password" | "key");
                        setPairResult(null);
                      }}
                    />

                    {authMode === "password" ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px" }}>
                        <TextField
                          label="Remote Username"
                          description="Login user on the remote PC (e.g. deck, ubuntu, john)"
                          value={user}
                          onChange={(e) => setUser(e.target.value)}
                        />

                        <TextField
                          label="Remote Password"
                          description="Used once to authorize this Steam Deck. Never saved to disk."
                          bIsPassword={true}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />

                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px", flexWrap: "wrap" }}>
                          <DialogButton
                            className="decky-unison-btn-compact"
                            onClick={handlePair}
                            disabled={pairing || !host.trim() || !user.trim() || !password.trim()}
                            style={{
                              background: "#2ecc71",
                              color: "#ffffff",
                              height: "32px",
                              fontSize: "11px",
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            <FaKey /> {pairing ? "Pairing with server..." : "Pair Device & Authorize"}
                          </DialogButton>

                          {pairResult && (
                            <div
                              style={{
                                fontSize: "12px",
                                color: pairResult.success ? "#2ecc71" : "#e74c3c",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                lineHeight: "1.2",
                              }}
                            >
                              {pairResult.success ? <FaCheckCircle /> : <FaExclamationTriangle />}
                              <span>{pairResult.message}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* SSH Config Host presets */}
                        {sshConfigHosts.length > 0 && (
                          <div style={{ marginBottom: "6px", marginTop: "4px" }}>
                            <div style={{ fontSize: "11px", color: "#8b929a", marginBottom: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
                              <FaBook style={{ color: "#67c1f5" }} /> Quick Fill from ~/.ssh/config:
                            </div>
                            <Focusable flow-children="horizontal" style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                              {sshConfigHosts.map((h, idx) => (
                                <DialogButton
                                  key={idx}
                                  className="decky-unison-chip"
                                  style={{
                                    height: "26px",
                                    padding: "0 8px",
                                    fontSize: "11px",
                                    background: host === h.alias ? "#1a9fff" : "rgba(255, 255, 255, 0.08)",
                                    color: host === h.alias ? "#ffffff" : "#c9d1d9",
                                  }}
                                  onClick={() => applySSHConfigHost(h)}
                                >
                                  {h.alias}
                                </DialogButton>
                              ))}
                            </Focusable>
                          </div>
                        )}

                        <TextField
                          label="Username"
                          description="Username (leave blank if defined in ~/.ssh/config)"
                          value={user}
                          onChange={(e) => setUser(e.target.value)}
                        />

                        {/* Inline Test Connection button & status */}
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px", flexWrap: "wrap" }}>
                          <DialogButton
                            className="decky-unison-btn-compact"
                            onClick={handleTest}
                            disabled={testing || !host.trim()}
                            style={{ background: "#2ecc71", color: "#ffffff", height: "30px", fontSize: "11px" }}
                          >
                            <FaServer /> {testing ? "Testing..." : "Test Connection"}
                          </DialogButton>

                          {testResult && (
                            <div
                              style={{
                                fontSize: "12px",
                                color: testResult.success ? "#2ecc71" : "#e74c3c",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                lineHeight: "1.2",
                              }}
                            >
                              {testResult.success ? <FaCheckCircle /> : <FaExclamationTriangle />}
                              <span>{testResult.message}</span>
                            </div>
                          )}
                        </div>

                        {/* Option to view/copy Deck's public SSH key if needed */}
                        <div style={{ marginTop: "10px", padding: "8px 10px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: "11px", color: "#8b929a" }}>Need to authorize this Deck manually?</span>
                          <DialogButton
                            className="decky-unison-btn-compact"
                            onClick={() => showModal(<SSHKeyModal />)}
                            style={{ height: "26px", fontSize: "11px", padding: "0 8px", display: "flex", alignItems: "center", gap: "4px" }}
                          >
                            <FaKey style={{ color: "#67c1f5" }} /> View Public Key
                          </DialogButton>
                        </div>
                      </>
                    )}
                  </>
                )}

                {type === "socket" && (
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px", flexWrap: "wrap" }}>
                    <DialogButton
                      className="decky-unison-btn-compact"
                      onClick={handleTest}
                      disabled={testing || !host.trim()}
                      style={{ background: "#2ecc71", color: "#ffffff", height: "30px", fontSize: "11px" }}
                    >
                      <FaServer /> {testing ? "Testing..." : "Test Connection"}
                    </DialogButton>

                    {testResult && (
                      <div
                        style={{
                          fontSize: "12px",
                          color: testResult.success ? "#2ecc71" : "#e74c3c",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          lineHeight: "1.2",
                        }}
                      >
                        {testResult.success ? <FaCheckCircle /> : <FaExclamationTriangle />}
                        <span>{testResult.message}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Collapsible Advanced Settings */}
                <div style={{ marginTop: "10px" }}>
                  <DialogButton
                    className="decky-unison-btn-compact"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    style={{ height: "26px", fontSize: "11px" }}
                  >
                    <FaCog /> {showAdvanced ? "Hide Advanced Settings" : "Advanced Settings (Port, Key Path, Unison Executable...)"}
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
                      <TextField
                        label="Port"
                        description={type === "ssh" ? "Default: 22" : "Default: 26867"}
                        value={String(port)}
                        onChange={(e) => setPort(Number(e.target.value) || (type === "socket" ? 26867 : 22))}
                      />
                      {type === "ssh" && (
                        <>
                          <TextField
                            label="Identity File Path"
                            description="Optional if using default key or ~/.ssh/config"
                            value={keyPath}
                            onChange={(e) => setKeyPath(e.target.value)}
                          />
                          <TextField
                            label="Remote Unison Executable"
                            description="Default: 'unison'. Specify full path if not in remote PATH"
                            value={remoteUnisonPath}
                            onChange={(e) => setRemoteUnisonPath(e.target.value)}
                          />
                        </>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <TextField
                label="Local Share Directory"
                description="Absolute path to mounted folder or share"
                value={localPath}
                onChange={(e) => setLocalPath(e.target.value)}
              />
            )}
          </DialogControlsSection>
        </div>
      </DialogBody>

      <DialogFooter>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <div>
            {isEditing && (
              <DialogButton
                className="decky-unison-btn-compact"
                onClick={handleDelete}
                style={{ color: "#e74c3c", height: "36px", fontSize: "11px", padding: "0 10px" }}
              >
                <FaTrash /> Delete
              </DialogButton>
            )}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <DialogButtonSecondary onClick={closeModal} className="decky-unison-btn-compact" style={{ height: "36px" }}>
              Cancel
            </DialogButtonSecondary>
            <DialogButtonPrimary onClick={handleSave} className="decky-unison-btn-compact" style={{ height: "36px" }}>
              Save Remote
            </DialogButtonPrimary>
          </div>
        </div>
      </DialogFooter>
    </ModalRoot>
  );
}
