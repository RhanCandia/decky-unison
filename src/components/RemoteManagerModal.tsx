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
import { FaServer, FaCheckCircle, FaExclamationTriangle, FaKey, FaBook, FaTrash } from "react-icons/fa";

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
    setName("New Remote Server");
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
      <DialogHeader>Manage Remotes & Central Server</DialogHeader>
      <DialogSubHeader>Configure SSH, Socket, or Local sync destinations</DialogSubHeader>

      <DialogBody>
        {/* Remote Selector & Add Button */}
        <DialogControlsSection>
          <DialogControlsSectionHeader>Active Remote</DialogControlsSectionHeader>
          <DropdownItem
            label="Select Configured Remote"
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
        </DialogControlsSection>

        {/* SSH Config Host presets helper */}
        {sshConfigHosts.length > 0 && type === "ssh" && (
          <DialogControlsSection>
            <DialogControlsSectionHeader>
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <FaBook style={{ color: "#67c1f5" }} /> Auto-Detected From ~/.ssh/config
              </span>
            </DialogControlsSectionHeader>
            <Focusable flow-children="horizontal" style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {sshConfigHosts.map((h, idx) => (
                <DialogButton
                  key={idx}
                  style={{
                    fontSize: "11px",
                    padding: "6px 10px",
                    height: "auto",
                    minWidth: "auto",
                    background: host === h.alias ? "#1a9fff" : undefined,
                  }}
                  onClick={() => applySSHConfigHost(h)}
                >
                  {h.alias} {h.hostname ? `(${h.hostname})` : ""}
                </DialogButton>
              ))}
            </Focusable>
          </DialogControlsSection>
        )}

        {/* Remote Identification */}
        <DialogControlsSection>
          <DialogControlsSectionHeader>Remote Configuration</DialogControlsSectionHeader>
          <TextField
            label="Remote Display Name"
            description="A friendly label for this device or server"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <DropdownItem
            label="Connection Protocol"
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

        {/* Connection Details */}
        {type !== "local" ? (
          <DialogControlsSection>
            <DialogControlsSectionHeader>Endpoint Details</DialogControlsSectionHeader>
            <TextField
              label="Host / IP / ~/.ssh/config Alias"
              description="Enter your server address, IP, or host alias from ~/.ssh/config"
              value={host}
              onChange={(e) => setHost(e.target.value)}
            />
            <TextField
              label="Port"
              description={type === "ssh" ? "SSH Port (default: 22)" : "Unison Socket Port (default: 26867)"}
              value={String(port)}
              onChange={(e) => setPort(Number(e.target.value))}
            />
            {type === "ssh" && (
              <>
                <TextField
                  label="Username"
                  description="Optional if defined in ~/.ssh/config"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                />
                <TextField
                  label="Identity File Path"
                  description="Optional if using standard key or configured in ~/.ssh/config"
                  value={keyPath}
                  onChange={(e) => setKeyPath(e.target.value)}
                />
                <TextField
                  label="Remote Unison Executable"
                  description="Default: 'unison'. Specify full path if not in remote SSH PATH"
                  value={remoteUnisonPath}
                  onChange={(e) => setRemoteUnisonPath(e.target.value)}
                />
              </>
            )}
          </DialogControlsSection>
        ) : (
          <DialogControlsSection>
            <DialogControlsSectionHeader>Local Mounted Share</DialogControlsSectionHeader>
            <TextField
              label="Local Share Directory"
              description="Absolute filesystem path to your mounted share or folder"
              value={localPath}
              onChange={(e) => setLocalPath(e.target.value)}
            />
          </DialogControlsSection>
        )}

        {/* Test Connection Section */}
        <DialogControlsSection>
          <DialogControlsSectionHeader>Connection Verification</DialogControlsSectionHeader>
          <DialogButton
            onClick={handleTest}
            disabled={testing}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
          >
            <FaServer /> {testing ? "Verifying Remote & Unison..." : "Test Connection"}
          </DialogButton>

          {testResult && (
            <div
              style={{
                marginTop: "8px",
                padding: "10px 12px",
                borderRadius: "6px",
                fontSize: "12px",
                display: "flex",
                alignItems: "flex-start",
                gap: "8px",
                background: testResult.success ? "rgba(46, 204, 113, 0.15)" : "rgba(231, 76, 60, 0.15)",
                border: testResult.success ? "1px solid rgba(46, 204, 113, 0.3)" : "1px solid rgba(231, 76, 60, 0.3)",
                color: testResult.success ? "#2ecc71" : "#e74c3c",
              }}
            >
              <div style={{ marginTop: "2px" }}>
                {testResult.success ? <FaCheckCircle /> : <FaExclamationTriangle />}
              </div>
              <div style={{ flex: 1, lineHeight: "1.4" }}>{testResult.message}</div>
            </div>
          )}
        </DialogControlsSection>

        {/* SSH Key Helper */}
        {type === "ssh" && sshKeyInfo && (
          <DialogControlsSection>
            <DialogControlsSectionHeader>
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <FaKey /> Steam Deck Public SSH Key
              </span>
            </DialogControlsSectionHeader>
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
              onClick={handleCopyKey}
              style={{ fontSize: "11px", padding: "6px 12px" }}
            >
              {copiedKey ? "Copied to Clipboard!" : "Copy Public Key"}
            </DialogButton>
          </DialogControlsSection>
        )}
      </DialogBody>

      <DialogFooter>
        <DialogButtonPrimary onClick={handleSave}>
          Save Remote
        </DialogButtonPrimary>
        {selectedRemoteId && (
          <DialogButton
            onClick={handleDelete}
            style={{ color: "#e74c3c", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
          >
            <FaTrash /> Delete
          </DialogButton>
        )}
        <DialogButtonSecondary onClick={closeModal}>
          Cancel
        </DialogButtonSecondary>
      </DialogFooter>
    </ModalRoot>
  );
}
