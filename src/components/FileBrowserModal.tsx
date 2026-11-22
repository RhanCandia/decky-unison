import {
  ModalRoot,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogButton,
  DialogButtonPrimary,
  DialogButtonSecondary,
  Focusable,
} from "@decky/ui";
import { useState, useEffect } from "react";
import { browseDirectory, getQuickJumps } from "../api";
import { DirectoryListing, QuickJump } from "../types";
import { FaFolder, FaFile, FaArrowUp, FaCheck, FaBolt } from "react-icons/fa";

interface FileBrowserModalProps {
  initialPath?: string;
  appId?: number;
  onSelect: (selectedPath: string) => void;
  closeModal?: () => void;
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

  const currentFolderBaseName = currentPath
    ? currentPath.split(/[/\\]/).filter(Boolean).pop() || ""
    : "";
  const currentParentPath = listing?.parent_path || (currentPath ? currentPath.substring(0, currentPath.lastIndexOf("/")) : "");

  return (
    <ModalRoot onCancel={closeModal}>
      <DialogHeader>Browse Save Folder</DialogHeader>

      <DialogBody>
        <div className="decky-unison-root" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {/* Navigation Bar: Up Button + Clean Path Breadcrumb */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "rgba(0, 0, 0, 0.4)",
              padding: "6px 10px",
              borderRadius: "6px",
            }}
          >
            <DialogButton
              className="decky-unison-btn-compact"
              disabled={!listing?.parent_path}
              onClick={() => listing?.parent_path && loadDir(listing.parent_path)}
              style={{
                height: "26px",
                minWidth: "auto",
                padding: "0 8px",
                fontSize: "11px",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                color: listing?.parent_path ? "#ffffff" : "#666666",
                flexShrink: 0,
              }}
            >
              <FaArrowUp /> Up
            </DialogButton>

            <div
              style={{
                flex: 1,
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                gap: "2px",
                fontSize: "11px",
              }}
            >
              <span style={{ color: "#8b929a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {currentParentPath ? `${currentParentPath}/` : "/"}
              </span>
              <strong style={{ color: "#67c1f5", whiteSpace: "nowrap" }}>
                {currentFolderBaseName}
              </strong>
            </div>
          </div>

          {/* Quick Jumps: Compact Horizontal Scroll Row */}
          {quickJumps.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                overflowX: "auto",
                paddingBottom: "2px",
              }}
            >
              <span
                style={{
                  fontSize: "10px",
                  color: "#8b929a",
                  whiteSpace: "nowrap",
                  display: "flex",
                  alignItems: "center",
                  gap: "3px",
                  flexShrink: 0,
                }}
              >
                <FaBolt style={{ color: "#f1c40f", fontSize: "10px" }} /> Quick Jumps:
              </span>
              <Focusable flow-children="horizontal" style={{ display: "flex", gap: "5px" }}>
                {quickJumps.map((jump, idx) => {
                  const label = jump.name.replace(/^Game:\s*/, "");
                  const isCurrent = currentPath === jump.path;
                  return (
                    <DialogButton
                      key={idx}
                      className="decky-unison-chip"
                      onClick={() => loadDir(jump.path)}
                      style={{
                        height: "24px",
                        fontSize: "10px",
                        padding: "0 8px",
                        whiteSpace: "nowrap",
                        background: isCurrent ? "rgba(26, 159, 255, 0.3)" : "rgba(255, 255, 255, 0.08)",
                        border: isCurrent ? "1px solid #1a9fff" : undefined,
                        color: isCurrent ? "#ffffff" : "#c9d1d9",
                      }}
                    >
                      {label}
                    </DialogButton>
                  );
                })}
              </Focusable>
            </div>
          )}

          {/* Directory Content List Viewport */}
          <div
            style={{
              maxHeight: "320px",
              minHeight: "180px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              background: "rgba(0, 0, 0, 0.25)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              padding: "6px",
              borderRadius: "6px",
            }}
          >
            {loading ? (
              <div style={{ padding: "32px 16px", textAlign: "center", color: "#8b929a", fontSize: "12px" }}>
                Loading folder contents...
              </div>
            ) : listing?.entries && listing.entries.length > 0 ? (
              listing.entries.map((entry, idx) => {
                if (entry.is_dir) {
                  return (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        width: "100%",
                      }}
                    >
                      <DialogButton
                        className="decky-unison-card"
                        onClick={() => loadDir(entry.path)}
                        style={{
                          flex: 1,
                          minHeight: "36px",
                          padding: "6px 10px",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          background: "rgba(255, 255, 255, 0.05)",
                          border: "1px solid rgba(255, 255, 255, 0.08)",
                          borderRadius: "4px",
                          textAlign: "left",
                          overflow: "hidden",
                        }}
                      >
                        <FaFolder style={{ color: "#e5a93c", fontSize: "14px", flexShrink: 0 }} />
                        <span
                          style={{
                            fontSize: "12px",
                            color: "#ffffff",
                            textOverflow: "ellipsis",
                            overflow: "hidden",
                            whiteSpace: "nowrap",
                            flex: 1,
                          }}
                        >
                          {entry.name}
                        </span>
                      </DialogButton>

                      <DialogButton
                        className="decky-unison-btn-compact"
                        onClick={() => {
                          onSelect(entry.path);
                          closeModal?.();
                        }}
                        style={{
                          height: "36px",
                          width: "auto",
                          minWidth: "60px",
                          padding: "0 10px",
                          fontSize: "11px",
                          background: "rgba(26, 159, 255, 0.18)",
                          border: "1px solid rgba(26, 159, 255, 0.4)",
                          color: "#67c1f5",
                          flexShrink: 0,
                        }}
                      >
                        Select
                      </DialogButton>
                    </div>
                  );
                } else {
                  return (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "4px 10px",
                        borderRadius: "4px",
                        opacity: 0.6,
                        fontSize: "11px",
                        color: "#8b929a",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
                        <FaFile style={{ fontSize: "12px", flexShrink: 0 }} />
                        <span style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                          {entry.name}
                        </span>
                      </div>
                      <span style={{ fontSize: "10px", marginLeft: "8px", flexShrink: 0 }}>
                        {formatFileSize(entry.size)}
                      </span>
                    </div>
                  );
                }
              })
            ) : (
              <div style={{ padding: "32px 16px", textAlign: "center", color: "#8b929a", fontSize: "12px" }}>
                (Folder is empty)
              </div>
            )}
          </div>
        </div>
      </DialogBody>

      <DialogFooter>
        <DialogButtonPrimary
          onClick={handleSelectCurrent}
          className="decky-unison-btn-compact"
          style={{
            height: "36px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          <FaCheck /> {currentFolderBaseName ? `Choose: "${currentFolderBaseName}"` : "Choose Current Folder"}
        </DialogButtonPrimary>
        <DialogButtonSecondary onClick={closeModal} className="decky-unison-btn-compact" style={{ height: "36px" }}>
          Cancel
        </DialogButtonSecondary>
      </DialogFooter>
    </ModalRoot>
  );
}
