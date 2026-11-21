import {
  ModalRoot,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogButton,
  TextField,
  DropdownItem,
} from "@decky/ui";
import { useState, useEffect } from "react";
import { getRemotes, saveRemote, testRemote, getSSHKey } from "../api";
import { RemoteConfig, TestResult, SSHKeyInfo } from "../types";
import { FaServer, FaCheckCircle, FaExclamationTriangle, FaKey, FaTimes } from "react-icons/fa";

interface RemoteManagerModalProps {
  closeModal?: () => void;
  onSaved?: () => void;
}

export function RemoteManagerModal({ closeModal, onSaved }: RemoteManagerModalProps) {
  const [remotes, setRemotes] = useState<RemoteConfig[]>([]);
  const [selectedRemoteId, setSelectedRemoteId] = useState<string>("");
  const [name, setName] = useState<string>("Central Server");
  const [type, setType] = useState<"ssh" | "socket" | "local">("ssh");
  const [host, setHost] = useState<string>("");
  const [port, setPort] = useState<number>(22);
  const [user, setUser] = useState<string>("");
  const [localPath, setLocalPath] = useState<string>("");
  const [remoteUnisonPath, setRemoteUnisonPath] = useState<string>("unison");

  const [testing, setTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [sshKeyInfo, setSshKeyInfo] = useState<SSHKeyInfo | null>(null);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);

  const loadData = async () => {
    try {
      const remoteList = await getRemotes();
      setRemotes(remoteList);
      if (remoteList.length > 0) {
        loadRemoteIntoForm(remoteList[0]);
      }
      const key = await getSSHKey();
      setSshKeyInfo(key);
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
    setLocalPath(remote.local_path || "");
    setRemoteUnisonPath(remote.remote_unison_path || "unison");
    setTestResult(null);
  };

  const handleSave = async () => {
    const payload: RemoteConfig = {
      id: selectedRemoteId || undefined,
      name,
      type,
      host,
      port: Number(port),
      user,
      local_path: localPath,
      remote_unison_path: remoteUnisonPath,
    };
    await saveRemote(payload);
    await loadData();
    onSaved?.();
    closeModal?.();
  };

  const handleTest = async () => {
    if (!selectedRemoteId) {
      // Temporarily save first to test
      const saved = await saveRemote({
        id: undefined,
        name,
        type,
        host,
        port: Number(port),
        user,
        local_path: localPath,
        remote_unison_path: remoteUnisonPath,
      });
      setSelectedRemoteId(saved.id!);
      setTesting(true);
      const res = await testRemote(saved.id!);
      setTestResult(res);
      setTesting(false);
      return;
    }
    setTesting(true);
    try {
      const res = await testRemote(selectedRemoteId);
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

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <TextField
            label="Remote Display Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <DropdownItem
            label="Connection Protocol"
            rgOptions={[
              { label: "SSH (Central Server / VPS / PC)", data: "ssh" },
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
                label="Host / IP / Tailscale Domain"
                value={host}
                onChange={(e) => setHost(e.target.value)}
              />
              <div style={{ display: "flex", gap: "10px" }}>
                <div style={{ flex: 1 }}>
                  <TextField
                    label="Port"
                    value={String(port)}
                    onChange={(e) => setPort(Number(e.target.value))}
                  />
                </div>
                {type === "ssh" && (
                  <div style={{ flex: 1 }}>
                    <TextField
                      label="Username"
                      value={user}
                      onChange={(e) => setUser(e.target.value)}
                    />
                  </div>
                )}
              </div>
              {type === "ssh" && (
                <TextField
                  label="Remote Unison Executable (default: unison)"
                  value={remoteUnisonPath}
                  onChange={(e) => setRemoteUnisonPath(e.target.value)}
                />
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
                Copy and add this key to <code>~/.ssh/authorized_keys</code> on your server:
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
