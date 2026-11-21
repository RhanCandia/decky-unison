import {
  ModalRoot,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogButton,
} from "@decky/ui";
import { useState } from "react";
import { HistoryEntry } from "../types";
import { FaTerminal, FaCopy, FaTimes, FaExclamationTriangle, FaCheckCircle } from "react-icons/fa";

interface SyncLogModalProps {
  log: HistoryEntry;
  closeModal?: () => void;
}

export function SyncLogModal({ log, closeModal }: SyncLogModalProps) {
  const [copied, setCopied] = useState<boolean>(false);

  const handleCopy = () => {
    const textToCopy = `Command: ${log.command || "N/A"}\n\nLog Output:\n${log.raw_output || log.details || "No output recorded"}`;
    navigator.clipboard?.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const isExitCode3 = (log.raw_output || log.details || "").includes("code 3") || (log.raw_output || "").includes("Fatal error");

  return (
    <ModalRoot onCancel={closeModal}>
      <DialogHeader>Sync Log: {log.game_name}</DialogHeader>
      <DialogBody>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {/* Status Badge */}
          <div
            style={{
              padding: "8px 12px",
              borderRadius: "4px",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: log.success ? "rgba(46, 204, 113, 0.15)" : "rgba(231, 76, 60, 0.15)",
              color: log.success ? "#2ecc71" : "#e74c3c",
            }}
          >
            {log.success ? <FaCheckCircle /> : <FaExclamationTriangle />}
            <span style={{ fontWeight: "bold" }}>
              Status: {log.status} ({log.details})
            </span>
          </div>

          {/* Diagnostic tips for exit code 3 */}
          {isExitCode3 && (
            <div
              style={{
                background: "rgba(230, 126, 34, 0.15)",
                border: "1px solid rgba(230, 126, 34, 0.4)",
                padding: "8px 10px",
                borderRadius: "4px",
                fontSize: "11px",
                color: "#e67e22",
              }}
            >
              <div style={{ fontWeight: "bold", marginBottom: "4px" }}>
                💡 Diagnostic Tips for Exit Code 3 (Fatal Error):
              </div>
              <ul style={{ margin: 0, paddingLeft: "16px" }}>
                <li>
                  <b>Remote 'unison' binary not found:</b> The remote server must have <code>unison</code> installed in its non-interactive SSH PATH, or specify the exact binary path in <i>Remote Unison Executable</i> (under Manage Remotes).
                </li>
                <li>
                  <b>Version mismatch:</b> The Steam Deck runs Unison <b>v2.54.0</b>. The remote server should also run <b>v2.54.0</b>.
                </li>
                <li>
                  <b>Remote folder missing:</b> Verify the remote save path exists on the server.
                </li>
              </ul>
            </div>
          )}

          {/* Executed Command */}
          {log.command && (
            <div>
              <div style={{ fontSize: "11px", color: "#8b929a", marginBottom: "4px" }}>
                Command Executed:
              </div>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: "10px",
                  wordBreak: "break-all",
                  background: "rgba(0, 0, 0, 0.4)",
                  padding: "6px 8px",
                  borderRadius: "3px",
                  color: "#67c1f5",
                }}
              >
                {log.command}
              </div>
            </div>
          )}

          {/* Full Log Output */}
          <div>
            <div style={{ fontSize: "11px", color: "#8b929a", marginBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
              <FaTerminal /> Terminal Output:
            </div>
            <pre
              style={{
                maxHeight: "220px",
                overflowY: "auto",
                fontFamily: "monospace",
                fontSize: "11px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                background: "#0d1117",
                color: "#c9d1d9",
                padding: "10px",
                borderRadius: "4px",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                margin: 0,
              }}
            >
              {log.raw_output || log.details || "No terminal output recorded."}
            </pre>
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <DialogButton onClick={handleCopy} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <FaCopy /> {copied ? "Copied Log!" : "Copy Full Log"}
        </DialogButton>
        <DialogButton onClick={closeModal} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <FaTimes /> Close
        </DialogButton>
      </DialogFooter>
    </ModalRoot>
  );
}
