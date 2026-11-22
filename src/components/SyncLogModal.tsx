import {
  ModalRoot,
  DialogHeader,
  DialogSubHeader,
  DialogBody,
  DialogFooter,
  DialogButtonPrimary,
  DialogButtonSecondary,
  DialogControlsSection,
  DialogControlsSectionHeader,
  Focusable,
} from "@decky/ui";
import { useState } from "react";
import { HistoryEntry } from "../types";
import { FaTerminal, FaCopy, FaCheckCircle, FaExclamationTriangle } from "react-icons/fa";

interface SyncLogModalProps {
  log: HistoryEntry;
  closeModal?: () => void;
}

export function SyncLogModal({ log, closeModal }: SyncLogModalProps) {
  const [copied, setCopied] = useState<boolean>(false);

  const handleCopy = () => {
    const textToCopy = `=== Decky Unison Sync Log ===\nGame: ${log.game_name}${log.target_name ? ` (Target: ${log.target_name})` : ""}\nStatus: ${log.status} (${log.details})\nDirection: ${log.direction_label || "N/A"}\n\nCommand:\n${log.command || "N/A"}\n\nOutput:\n${log.raw_output || log.details || "No output recorded"}`;
    navigator.clipboard?.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const isExitCode3 = (log.raw_output || log.details || "").includes("code 3") || (log.raw_output || "").includes("Fatal error");

  return (
    <ModalRoot onCancel={closeModal}>
      <DialogHeader>Sync Log: {log.game_name} {log.target_name ? `(${log.target_name})` : ""}</DialogHeader>
      <DialogSubHeader>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            color: log.success ? "#2ecc71" : "#e74c3c",
            fontWeight: "bold",
            fontSize: "13px",
          }}
        >
          {log.success ? <FaCheckCircle /> : <FaExclamationTriangle />}
          {log.direction_label || log.details || (log.success ? "Sync Succeeded" : "Sync Failed")}
        </span>
      </DialogSubHeader>

      <DialogBody>
        <div className="decky-unison-root">
        {/* Diagnostic tips for exit code 3 */}
        {isExitCode3 && (
          <DialogControlsSection>
            <div
              style={{
                background: "rgba(230, 126, 34, 0.15)",
                border: "1px solid rgba(230, 126, 34, 0.4)",
                padding: "10px 12px",
                borderRadius: "6px",
                fontSize: "12px",
                color: "#f39c12",
              }}
            >
              <div style={{ fontWeight: "bold", marginBottom: "6px" }}>
                💡 Diagnostic Tips for Exit Code 3 (Fatal Error):
              </div>
              <ul style={{ margin: 0, paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "4px" }}>
                <li>
                  <b>Path format:</b> Unison requires absolute paths without <code>~/</code> (e.g. <code>/home/user/saves/...</code>).
                </li>
                <li>
                  <b>Remote 'unison' binary:</b> The server must have <code>unison</code> in its SSH PATH. Check with <i>Test Connection</i> in Remotes.
                </li>
                <li>
                  <b>Remote directory missing:</b> The target folder on the remote server must exist or be accessible.
                </li>
              </ul>
            </div>
          </DialogControlsSection>
        )}

        {/* Command Executed */}
        {log.command && (
          <DialogControlsSection>
            <DialogControlsSectionHeader>Command Executed</DialogControlsSectionHeader>
            <Focusable
              style={{
                fontFamily: "monospace",
                fontSize: "11px",
                wordBreak: "break-all",
                background: "rgba(0, 0, 0, 0.4)",
                padding: "8px 10px",
                borderRadius: "4px",
                color: "#67c1f5",
                lineHeight: "1.4",
              }}
            >
              {log.command}
            </Focusable>
          </DialogControlsSection>
        )}

        {/* Terminal Output Stream */}
        <DialogControlsSection>
          <DialogControlsSectionHeader>
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <FaTerminal /> Terminal Output
            </span>
          </DialogControlsSectionHeader>
          <Focusable
            style={{
              maxHeight: "240px",
              overflowY: "auto",
              fontFamily: "monospace",
              fontSize: "11px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              background: "#080c14",
              color: "#c9d1d9",
              padding: "12px",
              borderRadius: "6px",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              lineHeight: "1.4",
            }}
          >
            {log.raw_output || log.details || "No terminal output recorded."}
          </Focusable>
        </DialogControlsSection>
        </div>
      </DialogBody>

      <DialogFooter>
        <DialogButtonPrimary
          onClick={handleCopy}
          className="decky-unison-btn-compact"
          style={{ height: "36px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
        >
          <FaCopy /> {copied ? "Copied to Clipboard!" : "Copy Full Log"}
        </DialogButtonPrimary>
        <DialogButtonSecondary
          onClick={closeModal}
          className="decky-unison-btn-compact"
          style={{ height: "36px" }}
        >
          Close
        </DialogButtonSecondary>
      </DialogFooter>
    </ModalRoot>
  );
}
