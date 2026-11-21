import {
  ModalRoot,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogButton,
  TextField,
  DropdownItem,
  Focusable,
} from "@decky/ui";
import { useState, useEffect } from "react";
import { getRemotes, saveRemote, testRemote, getSSHKey, getSSHConfigHosts } from "../api";
import { RemoteConfig, TestResult, SSHKeyInfo, SSHConfigHost } from "../types";
import { FaServer, FaCheckCircle, FaExclamationTriangle, FaKey, FaTimes, FaBook } from "react-icons/fa";

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
      if (remoteList.length > 0) {
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
      <DialogHeader>Configure Central Server & Remotes</DialogHeader>
      <DialogBody>
        {/* Remote selection if multiple */}
        {remotes.length > 1 && (
          <div style={{ marginBottom: "12px" }}>
            <DropdownItem
              label="Select Remote"
              rgOptions={remotes.map((r) => ({
                label: r.name,
                data: r.id!,
              }))}
              selectedOption={selectedRemoteId}
              onChange={(opt) => {
                const found = remotes.find((r) => r.id === opt.data);
                if (found) loadRemoteIntoForm(found);
              }}
            />
          </div>
        )}

        {/* SSH Config Host presets helper */}
        {sshConfigHosts.length > 0 && type === "ssh" && (
          <div style={{ marginBottom: "12px", background: "rgba(103, 193, 245, 0.1)", padding: "8px 10px", borderRadius: "4px" }}>
            <div style={{ fontSize: "11px", color: "#67c1f5", fontWeight: "bold", display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
              <FaBook /> Discovered in ~/.ssh/config:
            </div>
            <Focusable style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {sshConfigHosts.map((h, idx) => (
                <DialogButton
                  key={idx}
                  style={{ fontSize: "11px", padding: "3px 8px", height: "auto" }}
                  onClick={() => applySSHConfigHost(h)}
                >
                  {h.alias} {h.hostname ? `(${h.hostname})` : ""}
                </DialogButton>
              ))}
            </Focusable>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <TextField
            label="Remote Display Name"
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

          {type !== "local" ? (
            <>
              <TextField
                label="Host / IP / ~/.ssh/config Alias"
                value={host}
                onChange={(e) => setHost(e.target.value)}
              />
              <div style={{ display: "flex", gap: "10px" }}>
                <div style={{ flex: 1 }}>
                  <TextField
                    label="Port (default: 22)"
                    value={String(port)}
                    onChange={(e) => setPort(Number(e.target.value))}
                  />
                </div>
                {type === "ssh" && (
                  <div style={{ flex: 1 }}>
                    <TextField
                      label="Username (optional if in ~/.ssh/config)"
                      value={user}
                      onChange={(e) => setUser(e.target.value)}
                    />
                  </div>
                )}
              </div>
              {type === "ssh" && (
                <>
                  <TextField
                    label="Identity / Private Key File (optional if in ~/.ssh/config)"
                    value={keyPath}
                    onChange={(e) => setKeyPath(e.target.value)}
                  />
                  <TextField
                    label="Remote Unison Executable (default: unison)"
                    value={remoteUnisonPath}
                    onChange={(e) => setRemoteUnisonPath(e.target.value)}
                  />
                </>
              )}
            </>
          ) : (
            <TextField
              label="Local Mounted Share Path"
              value={localPath}
              onChange={(e) => setLocalPath(e.target.value)}
            />
          )}

          {/* Test Connection Button */}
          <div style={{ marginTop: "6px" }}>
            <DialogButton
              onClick={handleTest}
              disabled={testing}
              style={{ display: "flex", alignItems: "center", gap: "8px" }}
            >
              <FaServer /> {testing ? "Testing Connection..." : "Test Connection"}
            </DialogButton>
          </div>

          {testResult && (
            <div
              style={{
                padding: "8px 12px",
                borderRadius: "4px",
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: testResult.success ? "rgba(46, 204, 113, 0.15)" : "rgba(231, 76, 60, 0.15)",
                color: testResult.success ? "#2ecc71" : "#e74c3c",
              }}
            >
              {testResult.success ? <FaCheckCircle /> : <FaExclamationTriangle />}
              <span>{testResult.message}</span>
            </div>
          )}

          {/* SSH Key Helper */}
          {type === "ssh" && sshKeyInfo && (
            <div
              style={{
                marginTop: "10px",
                padding: "10px",
                background: "rgba(0, 0, 0, 0.25)",
                borderRadius: "4px",
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: "bold", marginBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
                <FaKey /> Steam Deck Public SSH Key
              </div>
              <div style={{ fontSize: "11px", color: "#8b929a", marginBottom: "6px" }}>
                If you are not using an existing key from ~/.ssh/config, you can copy this key to <code>~/.ssh/authorized_keys</code>:
              </div>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: "10px",
                  wordBreak: "break-all",
                  background: "rgba(0, 0, 0, 0.4)",
                  padding: "6px",
                  borderRadius: "3px",
                  marginBottom: "8px",
                }}
              >
                {sshKeyInfo.public_key}
              </div>
              <DialogButton
                onClick={handleCopyKey}
                style={{ fontSize: "11px", padding: "4px 10px" }}
              >
                {copiedKey ? "Copied to Clipboard!" : "Copy Public Key"}
              </DialogButton>
            </div>
          )}
        </div>
      </DialogBody>
      <DialogFooter>
        <DialogButton onClick={handleSave}>Save Remote</DialogButton>
        <DialogButton onClick={closeModal} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <FaTimes /> Cancel
        </DialogButton>
      </DialogFooter>
    </ModalRoot>
  );
}
