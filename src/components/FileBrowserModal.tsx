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
  Focusable,
} from "@decky/ui";
import { useState, useEffect } from "react";
import { browseDirectory, getQuickJumps } from "../api";
import { DirectoryListing, QuickJump } from "../types";
import { FaFolder, FaFile, FaArrowUp, FaCheck } from "react-icons/fa";

interface FileBrowserModalProps {
  initialPath?: string;
  appId?: number;
  onSelect: (selectedPath: string) => void;
  closeModal?: () => void;
}

export function FileBrowserModal({
  initialPath,
  appId,
  onSelect,
  closeModal,
}: FileBrowserModalProps) {
  const [currentPath, setCurrentPath] = useState<string>(initialPath || "");
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [quickJumps, setQuickJumps] = useState<QuickJump[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const loadDir = async (path?: string) => {
    setLoading(true);
    try {
      const res = await browseDirectory(path);
      setListing(res);
      setCurrentPath(res.current_path);
    } catch (e) {
      console.error("[DeckyUnison] Error browsing directory:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDir(initialPath);
    getQuickJumps(appId).then((jumps) => setQuickJumps(jumps)).catch(console.error);
  }, []);

  const handleSelectCurrent = () => {
    if (currentPath) {
      onSelect(currentPath);
      closeModal?.();
    }
  };

  return (
    <ModalRoot onCancel={closeModal}>
      <DialogHeader>Browse Save Folder</DialogHeader>
      <DialogSubHeader>
        <span
          style={{
            fontFamily: "monospace",
            fontSize: "11px",
            color: "#67c1f5",
            wordBreak: "break-all",
          }}
        >
          {currentPath || "Loading directory..."}
        </span>
      </DialogSubHeader>

      <DialogBody>
        <div className="decky-unison-root" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {/* Quick Jumps as compact chips */}
          {quickJumps.length > 0 && (
            <DialogControlsSection>
              <DialogControlsSectionHeader>Quick Locations</DialogControlsSectionHeader>
              <Focusable
                flow-children="horizontal"
                style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}
              >
                {quickJumps.map((jump, idx) => (
                  <DialogButton
                    key={idx}
                    className="decky-unison-chip"
                    onClick={() => loadDir(jump.path)}
                  >
                    {jump.name}
                  </DialogButton>
                ))}
              </Focusable>
            </DialogControlsSection>
          )}

          {/* Directory Contents Section */}
          <DialogControlsSection>
            <DialogControlsSectionHeader>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                <span>Folder Contents</span>
                {listing?.parent_path && (
                  <DialogButton
                    className="decky-unison-btn-compact"
                    style={{ height: "26px", fontSize: "11px", padding: "0 8px" }}
                    onClick={() => loadDir(listing.parent_path!)}
                  >
                    <FaArrowUp /> Up One Level
                  </DialogButton>
                )}
              </div>
            </DialogControlsSectionHeader>

            <div
              style={{
                maxHeight: "220px",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "3px",
                background: "rgba(0, 0, 0, 0.25)",
                padding: "6px",
                borderRadius: "6px",
              }}
            >
              {loading ? (
                <div style={{ padding: "16px", textAlign: "center", color: "#8b929a", fontSize: "12px" }}>
                  Loading folder contents...
                </div>
              ) : listing?.entries && listing.entries.length > 0 ? (
                listing.entries.map((entry, idx) => (
                  <Focusable
                    key={idx}
                    flow-children="horizontal"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 8px",
                      borderRadius: "4px",
                      background: entry.is_dir ? "rgba(255, 255, 255, 0.04)" : "transparent",
                    }}
                  >
                    <div
                      onClick={() => {
                        if (entry.is_dir) loadDir(entry.path);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        flex: 1,
                        overflow: "hidden",
                        cursor: entry.is_dir ? "pointer" : "default",
                      }}
                    >
                      {entry.is_dir ? (
                        <FaFolder style={{ color: "#e5a93c", flexShrink: 0 }} />
                      ) : (
                        <FaFile style={{ color: "#8b929a", flexShrink: 0 }} />
                      )}
                      <span
                        style={{
                          fontSize: "12px",
                          textOverflow: "ellipsis",
                          overflow: "hidden",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {entry.name}
                      </span>
                    </div>

                    {entry.is_dir && (
                      <div style={{ display: "flex", gap: "6px" }}>
                        <DialogButton
                          className="decky-unison-btn-compact"
                          style={{ height: "24px", fontSize: "10px", padding: "0 8px" }}
                          onClick={() => loadDir(entry.path)}
                        >
                          Open
                        </DialogButton>
                        <DialogButton
                          className="decky-unison-btn-compact"
                          style={{
                            height: "24px",
                            fontSize: "10px",
                            padding: "0 8px",
                            background: "#1a9fff",
                            color: "#fff",
                          }}
                          onClick={() => {
                            onSelect(entry.path);
                            closeModal?.();
                          }}
                        >
                          Select
                        </DialogButton>
                      </div>
                    )}
                  </Focusable>
                ))
              ) : (
                <div style={{ padding: "16px", textAlign: "center", color: "#8b929a", fontSize: "12px" }}>
                  (Folder is empty)
                </div>
              )}
            </div>
          </DialogControlsSection>
        </div>
      </DialogBody>

      <DialogFooter>
        <DialogButtonPrimary
          onClick={handleSelectCurrent}
          className="decky-unison-btn-compact"
          style={{ height: "36px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
        >
          <FaCheck /> Select Current Folder
        </DialogButtonPrimary>
        <DialogButtonSecondary onClick={closeModal} className="decky-unison-btn-compact" style={{ height: "36px" }}>
          Cancel
        </DialogButtonSecondary>
      </DialogFooter>
    </ModalRoot>
  );
}
