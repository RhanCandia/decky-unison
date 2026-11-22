import {
  ModalRoot,
  DialogHeader,
  DialogSubHeader,
  DialogBody,
  DialogFooter,
  DialogButton,
  DialogButtonSecondary,
  DialogControlsSection,
  DialogControlsSectionHeader,
  Focusable,
} from "@decky/ui";
import { useState, useEffect } from "react";
import { getSSHKey } from "../api";
import { SSHKeyInfo } from "../types";
import { FaKey, FaCopy, FaCheck, FaInfoCircle } from "react-icons/fa";

interface SSHKeyModalProps {
  closeModal?: () => void;
}

export function SSHKeyModal({ closeModal }: SSHKeyModalProps) {
  const [keyInfo, setKeyInfo] = useState<SSHKeyInfo | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      try {
        const info = await getSSHKey();
        setKeyInfo(info);
      } catch (e) {
        console.error("[DeckyUnison] Failed to load SSH key:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleCopy = () => {
    if (keyInfo?.public_key) {
      navigator.clipboard?.writeText(keyInfo.public_key);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <ModalRoot onCancel={closeModal}>
      <DialogHeader>Steam Deck SSH Key</DialogHeader>
      <DialogSubHeader>Public key for passwordless server authorization</DialogSubHeader>

      <DialogBody>
        <div className="decky-unison-root" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <DialogControlsSection>
            <DialogControlsSectionHeader>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <FaKey style={{ color: "#67c1f5" }} />
                <span>Your Steam Deck Public Key</span>
              </div>
            </DialogControlsSectionHeader>

            {loading ? (
              <div style={{ padding: "12px", color: "#8b929a", textAlign: "center", fontSize: "11px" }}>
                Loading SSH key...
              </div>
            ) : keyInfo?.public_key ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ fontSize: "11px", color: "#c9d1d9", lineHeight: "1.4" }}>
                  This public key uniquely identifies your Steam Deck. Add it to your sync server so it accepts save synchronization connections without requiring a password prompt.
                </div>

                <Focusable
                  style={{
                    fontFamily: "monospace",
                    fontSize: "10px",
                    wordBreak: "break-all",
                    background: "rgba(0, 0, 0, 0.45)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    padding: "10px",
                    borderRadius: "6px",
                    color: "#67c1f5",
                    lineHeight: "1.4",
                    userSelect: "all",
                  }}
                >
                  {keyInfo.public_key}
                </Focusable>

                <DialogButton
                  className="decky-unison-btn-compact"
                  onClick={handleCopy}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    height: "32px",
                    fontSize: "12px",
                  }}
                >
                  {copied ? <FaCheck style={{ color: "#2ecc71" }} /> : <FaCopy />}
                  {copied ? "Copied to Clipboard!" : "Copy Public Key"}
                </DialogButton>
              </div>
            ) : (
              <div style={{ padding: "12px", color: "#e74c3c", fontSize: "11px" }}>
                No public SSH key found at ~/.ssh/id_ed25519.pub or ~/.ssh/id_rsa.pub.
              </div>
            )}
          </DialogControlsSection>

          <DialogControlsSection>
            <DialogControlsSectionHeader>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <FaInfoCircle style={{ color: "#67c1f5" }} />
                <span>How to Authorize on Your Server</span>
              </div>
            </DialogControlsSectionHeader>

            <div style={{ fontSize: "11px", color: "#8b929a", lineHeight: "1.5", display: "flex", flexDirection: "column", gap: "6px" }}>
              <div>
                <strong>Method 1 (Paste into authorized_keys):</strong>
                <br />
                Copy this key, open your remote server or PC, and append it to:
                <br />
                <code style={{ color: "#67c1f5" }}>~/.ssh/authorized_keys</code>
              </div>
              <div>
                <strong>Method 2 (From your PC):</strong>
                <br />
                If you already connect from your desktop to this Deck via SSH, you can use standard key management or configure an alias in <code style={{ color: "#67c1f5" }}>~/.ssh/config</code>.
              </div>
            </div>
          </DialogControlsSection>
        </div>
      </DialogBody>

      <DialogFooter>
        <DialogButtonSecondary onClick={closeModal} className="decky-unison-btn-compact" style={{ height: "36px" }}>
          Close
        </DialogButtonSecondary>
      </DialogFooter>
    </ModalRoot>
  );
}
