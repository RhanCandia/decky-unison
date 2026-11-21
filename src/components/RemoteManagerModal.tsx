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
} from "@decky/ui";
import { useState, useEffect } from "react";
import { getRemotes, saveRemote, testRemote, getSSHKey, getSSHConfigHosts, deleteRemote } from "../api";
import { RemoteConfig, TestResult, SSHKeyInfo, SSHConfigHost } from "../types";
import { FaServer, FaCheckCircle, FaExclamationTriangle, FaKey, FaBook, FaTrash, FaCog } from "react-icons/fa";

interface RemoteManagerModalProps {
  closeModal?: () => void;
  onSaved?: () => void;
}

export function RemoteManagerModal({ closeModal, onSaved }: RemoteManagerModalProps) {
  const [remotes, setRemotes] = useState<RemoteConfig[]>([]);
  const [sshConfigHosts, setSshConfigHosts] = useState<SSHConfigHost[]>([]);
  const [selectedRemoteId, setSelectedRemoteId] = useState<string>("");
  const [name, setName] = useState<string>("Central Server");
  const [type, setType] = useState<"ssh" | "socket" | "local">("ssh");
  const [host, setHost] = useState<string>("");
  const [port, setPort] = useState<number>(22);
  const [user, setUser] = useState<string>("");
  const [keyPath, setKeyPath] = useState<string>("");
  const [localPath, setLocalPath] = useState<string>("");
  const [remoteUnisonPath, setRemoteUnisonPath] = useState<string>("unison");

  const [testing, setTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [sshKeyInfo, setSshKeyInfo] = useState<SSHKeyInfo | null>(null);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [showSSHKey, setShowSSHKey] = useState<boolean>(false);

  const loadData = async () => {
    try {
      const [remoteList, key, sshHosts] = await Promise.all([
        getRemotes(),
        getSSHKey(),
        getSSHConfigHosts().catch(() => []),
      ]);
      setRemotes(remoteList);
      setSshKeyInfo(key);
      setSshConfigHosts(sshHosts);
      if (remoteList.length > 0 && !selectedRemoteId) {
        loadRemoteIntoForm(remoteList[0]);
      }
    } catch (e) {
      console.error("[DeckyUnison] Error loading remotes:", e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadRemoteIntoForm = (remote: RemoteConfig) => {
    setSelectedRemoteId(remote.id || "");
    setName(remote.name || "Central Server");
    setType(remote.type || "ssh");
    setHost(remote.host || "");
    setPort(remote.port || (remote.type === "socket" ? 26867 : 22));
    setUser(remote.user || "");
    setKeyPath(remote.key_path || "");
    setLocalPath(remote.local_path || "");
    setRemoteUnisonPath(remote.remote_unison_path || "unison");
    setTestResult(null);
  };

  const resetFormForNew = () => {
    setSelectedRemoteId("");
    setName("New Server");
    setType("ssh");
    setHost("");
    setPort(22);
    setUser("");
    setKeyPath("");
    setLocalPath("");
    setRemoteUnisonPath("unison");
    setTestResult(null);
  };

  const applySSHConfigHost = (cfg: SSHConfigHost) => {
    setName(cfg.alias);
    setHost(cfg.alias);
    setType("ssh");
    if (cfg.user) setUser(cfg.user);
    if (cfg.port) setPort(cfg.port);
    if (cfg.identityfile) setKeyPath(cfg.identityfile);
  };

  const handleSave = async () => {
    const payload: RemoteConfig = {
      id: selectedRemoteId || undefined,
      name,
      type,
      host,
      port: Number(port),
      user,
      key_path: keyPath,
      local_path: localPath,
      remote_unison_path: remoteUnisonPath,
    };
    await saveRemote(payload);
    await loadData();
    onSaved?.();
    closeModal?.();
  };

  const handleDelete = async () => {
    if (selectedRemoteId) {
      await deleteRemote(selectedRemoteId);
      await loadData();
      resetFormForNew();
      onSaved?.();
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const saved = await saveRemote({
        id: selectedRemoteId || undefined,
        name,
        type,
        host,
        port: Number(port),
        user,
        key_path: keyPath,
        local_path: localPath,
        remote_unison_path: remoteUnisonPath,
      });
      setSelectedRemoteId(saved.id!);
      const res = await testRemote(saved.id!);
      setTestResult(res);
    } catch (e: any) {
      setTestResult({ success: false, message: e.message || "Failed to test connection" });
    } finally {
      setTesting(false);
    }
  };

  const handleCopyKey = () => {
    if (sshKeyInfo?.public_key) {
      navigator.clipboard?.writeText(sshKeyInfo.public_key);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 3000);
    }
  };

  return (
    <ModalRoot onCancel={closeModal}>
      <DialogHeader>Manage Remotes</DialogHeader>
      <DialogSubHeader>Configure sync servers, network devices, and SSH keys</DialogSubHeader>

      <DialogBody>
        <div className="decky-unison-root" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {/* Section 1: Remote Profile & Identification */}
          <DialogControlsSection>
            <DialogControlsSectionHeader>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                <span>Remote Profile</span>
                {selectedRemoteId && (
                  <DialogButton
                    className="decky-unison-btn-compact"
                    onClick={handleDelete}
                    style={{ color: "#e74c3c", height: "26px", fontSize: "11px", padding: "0 8px" }}
                  >
                    <FaTrash /> Delete Profile
                  </DialogButton>
                )}
              </div>
            </DialogControlsSectionHeader>

            {remotes.length > 0 && (
              <DropdownItem
                label="Selected Remote"
                rgOptions={[
                  ...remotes.map((r) => ({
                    label: `${r.name} (${r.type.toUpperCase()})`,
                    data: r.id!,
                  })),
                  { label: "+ Add New Remote...", data: "new" },
                ]}
                selectedOption={selectedRemoteId || "new"}
                onChange={(opt) => {
                  if (opt.data === "new") {
                    resetFormForNew();
                  } else {
                    const found = remotes.find((r) => r.id === opt.data);
                    if (found) loadRemoteIntoForm(found);
                  }
                }}
              />
            )}

            <TextField
              label="Profile Name"
              description="A friendly label for this remote device or server"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <DropdownItem
              label="Protocol"
              rgOptions={[
                { label: "SSH (Central Server / ~/.ssh/config alias)", data: "ssh" },
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

          {/* Section 2: Connection Endpoint */}
          <DialogControlsSection>
            <DialogControlsSectionHeader>Endpoint & Verification</DialogControlsSectionHeader>

            {type !== "local" ? (
              <>
                {/* SSH Config Host presets helper */}
                {sshConfigHosts.length > 0 && type === "ssh" && (
                  <div style={{ marginBottom: "6px" }}>
                    <div style={{ fontSize: "11px", color: "#8b929a", marginBottom: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
                      <FaBook style={{ color: "#67c1f5" }} /> Quick Fill from ~/.ssh/config:
                    </div>
                    <Focusable flow-children="horizontal" style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {sshConfigHosts.map((h, idx) => (
                        <DialogButton
                          key={idx}
                          className="decky-unison-chip"
                          style={{
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
                  label="Host / IP / SSH Alias"
                  description="Hostname, IP address, or ~/.ssh/config alias"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                />

                {/* Inline Test Connection button & status */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px", flexWrap: "wrap" }}>
                  <DialogButton
                    className="decky-unison-btn-compact"
                    onClick={handleTest}
                    disabled={testing}
                    style={{ background: "#2ecc71", color: "#ffffff" }}
                  >
                    <FaServer /> {testing ? "Verifying..." : "Test Connection"}
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

                {/* Collapsible Advanced SSH Fields */}
                <div style={{ marginTop: "10px" }}>
                  <DialogButton
                    className="decky-unison-btn-compact"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                  >
                    <FaCog /> {showAdvanced ? "Hide Advanced Settings" : "Advanced Settings (Port, User, Key...)"}
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
                        onChange={(e) => setPort(Number(e.target.value))}
                      />
                      {type === "ssh" && (
                        <>
                          <TextField
                            label="Username"
                            description="Optional if configured in ~/.ssh/config"
                            value={user}
                            onChange={(e) => setUser(e.target.value)}
                          />
                          <TextField
                            label="Identity File Path"
                            description="Optional if using standard key or ~/.ssh/config"
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

          {/* Section 3: Steam Deck Public SSH Key (Collapsible) */}
          {type === "ssh" && sshKeyInfo && (
            <DialogControlsSection>
              <DialogControlsSectionHeader>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <FaKey style={{ color: "#67c1f5" }} /> Steam Deck Public SSH Key
                  </span>
                  <DialogButton
                    className="decky-unison-btn-compact"
                    onClick={() => setShowSSHKey(!showSSHKey)}
                    style={{ height: "26px", fontSize: "11px", padding: "0 8px" }}
                  >
                    {showSSHKey ? "Hide Key" : "View Key"}
                  </DialogButton>
                </div>
              </DialogControlsSectionHeader>

              {showSSHKey ? (
                <div>
                  <div style={{ fontSize: "11px", color: "#8b929a", marginBottom: "6px" }}>
                    Add this key to <code>~/.ssh/authorized_keys</code> on your server if not using a key from ~/.ssh/config:
                  </div>
                  <Focusable
                    style={{
                      fontFamily: "monospace",
                      fontSize: "10px",
                      wordBreak: "break-all",
                      background: "rgba(0, 0, 0, 0.4)",
                      padding: "8px",
                      borderRadius: "4px",
                      marginBottom: "8px",
                      color: "#67c1f5",
                      lineHeight: "1.3",
                    }}
                  >
                    {sshKeyInfo.public_key}
                  </Focusable>
                  <DialogButton
                    className="decky-unison-btn-compact"
                    onClick={handleCopyKey}
                  >
                    {copiedKey ? "Copied to Clipboard!" : "Copy Public Key"}
                  </DialogButton>
                </div>
              ) : (
                <div style={{ fontSize: "11px", color: "#8b929a" }}>
                  Used to authorize this Steam Deck to connect to your SSH server without passwords.
                </div>
              )}
            </DialogControlsSection>
          )}
        </div>
      </DialogBody>

      <DialogFooter>
        <DialogButtonPrimary onClick={handleSave} className="decky-unison-btn-compact" style={{ height: "36px" }}>
          Save Remote
        </DialogButtonPrimary>
        <DialogButtonSecondary onClick={closeModal} className="decky-unison-btn-compact" style={{ height: "36px" }}>
          Cancel
        </DialogButtonSecondary>
      </DialogFooter>
    </ModalRoot>
  );
}
