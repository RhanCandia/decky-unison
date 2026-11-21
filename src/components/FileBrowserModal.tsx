import {
  ModalRoot,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogButton,
  Focusable,
} from "@decky/ui";
import { useState, useEffect } from "react";
import { browseDirectory, getQuickJumps } from "../api";
import { DirectoryListing, QuickJump } from "../types";
import { FaFolder, FaFile, FaArrowUp, FaCheck, FaTimes } from "react-icons/fa";

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
      <DialogBody>
        {/* Quick Jumps */}
        {quickJumps.length > 0 && (
          <div style={{ marginBottom: "12px" }}>
            <div style={{ fontSize: "12px", color: "#8b929a", marginBottom: "6px" }}>
              Quick Jumps:
            </div>
            <Focusable style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {quickJumps.map((jump, idx) => (
                <DialogButton
                  key={idx}
                  style={{
                    fontSize: "11px",
                    padding: "4px 8px",
                    height: "auto",
                    minWidth: "auto",
                  }}
                  onClick={() => loadDir(jump.path)}
                >
                  {jump.name}
                </DialogButton>
              ))}
            </Focusable>
          </div>
        )}

        {/* Current Path Bar & Up button */}
        <Focusable
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "rgba(0, 0, 0, 0.3)",
            padding: "8px",
            borderRadius: "4px",
            marginBottom: "10px",
          }}
        >
          {listing?.parent_path && (
            <DialogButton
              style={{ minWidth: "40px", padding: "6px 10px" }}
              onClick={() => loadDir(listing.parent_path!)}
            >
              <FaArrowUp />
            </DialogButton>
          )}
          <div
            style={{
              fontSize: "12px",
              wordBreak: "break-all",
              fontFamily: "monospace",
              color: "#67c1f5",
            }}
          >
            {currentPath || "Loading..."}
          </div>
        </Focusable>

        {/* Directory Contents */}
        <div
          style={{
            maxHeight: "260px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          {loading ? (
            <div style={{ padding: "16px", textAlign: "center", color: "#8b929a" }}>
              Loading folder contents...
            </div>
          ) : listing?.entries && listing.entries.length > 0 ? (
            listing.entries.map((entry, idx) => (
              <Focusable
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  borderRadius: "4px",
                  background: entry.is_dir ? "rgba(255, 255, 255, 0.05)" : "transparent",
                  cursor: entry.is_dir ? "pointer" : "default",
                }}
                onClick={() => {
                  if (entry.is_dir) {
                    loadDir(entry.path);
                  }
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {entry.is_dir ? (
                    <FaFolder style={{ color: "#e5a93c" }} />
                  ) : (
                    <FaFile style={{ color: "#8b929a" }} />
                  )}
                  <span style={{ fontSize: "13px" }}>{entry.name}</span>
                </div>
                {entry.is_dir && (
                  <DialogButton
                    style={{
                      fontSize: "11px",
                      padding: "2px 6px",
                      height: "auto",
                      minWidth: "auto",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(entry.path);
                      closeModal?.();
                    }}
                  >
                    Select
                  </DialogButton>
                )}
              </Focusable>
            ))
          ) : (
            <div style={{ padding: "16px", textAlign: "center", color: "#8b929a" }}>
              (Empty folder)
            </div>
          )}
        </div>
      </DialogBody>
      <DialogFooter>
        <DialogButton onClick={handleSelectCurrent} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <FaCheck /> Select Current Folder
        </DialogButton>
        <DialogButton onClick={closeModal} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <FaTimes /> Cancel
        </DialogButton>
      </DialogFooter>
    </ModalRoot>
  );
}
