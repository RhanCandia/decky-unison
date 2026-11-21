export const GLOBAL_STYLES = `
/* Decky Unison Global Styling Overhaul */

/* Compact action buttons */
.decky-unison-btn-compact {
  width: auto !important;
  min-width: auto !important;
  height: 32px !important;
  padding: 0 12px !important;
  font-size: 12px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 6px !important;
  border-radius: 4px !important;
  box-sizing: border-box !important;
  white-space: nowrap !important;
  border: 1px solid rgba(255, 255, 255, 0.12) !important;
  transition: all 0.12s ease-in-out !important;
}

/* Compact chip / pill buttons (quick presets, candidates) */
.decky-unison-chip {
  width: auto !important;
  min-width: auto !important;
  height: 26px !important;
  padding: 0 10px !important;
  font-size: 11px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  border-radius: 13px !important;
  gap: 4px !important;
  box-sizing: border-box !important;
  white-space: nowrap !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  transition: all 0.12s ease-in-out !important;
}

/* Standard Decky Unison button */
.decky-unison-btn {
  transition: all 0.12s ease-in-out !important;
  border: 1px solid rgba(255, 255, 255, 0.12) !important;
}

/* Tab button */
.decky-unison-tab {
  transition: all 0.12s ease-in-out !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
}

/* Activity history card */
.decky-unison-card {
  transition: all 0.12s ease-in-out !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
}

/* High-contrast Focus Outline & Glow for controller & hover */
.decky-unison-btn:focus,
.decky-unison-btn:focus-visible,
.decky-unison-btn:hover,
.decky-unison-btn.gpfocus,
.decky-unison-btn[data-gpfocus="true"],
.decky-unison-btn.focused,
.decky-unison-btn-compact:focus,
.decky-unison-btn-compact:focus-visible,
.decky-unison-btn-compact:hover,
.decky-unison-btn-compact.gpfocus,
.decky-unison-btn-compact[data-gpfocus="true"],
.decky-unison-btn-compact.focused,
.decky-unison-chip:focus,
.decky-unison-chip:focus-visible,
.decky-unison-chip:hover,
.decky-unison-chip.gpfocus,
.decky-unison-chip[data-gpfocus="true"],
.decky-unison-chip.focused,
.decky-unison-tab:focus,
.decky-unison-tab:focus-visible,
.decky-unison-tab:hover,
.decky-unison-tab.gpfocus,
.decky-unison-tab[data-gpfocus="true"],
.decky-unison-tab.focused {
  outline: 2px solid #ffffff !important;
  outline-offset: 1px !important;
  box-shadow: 0 0 10px rgba(255, 255, 255, 0.9) !important;
  border-color: #ffffff !important;
  filter: brightness(1.25) !important;
  z-index: 2 !important;
}

.decky-unison-card:focus,
.decky-unison-card:focus-visible,
.decky-unison-card:hover,
.decky-unison-card.gpfocus,
.decky-unison-card[data-gpfocus="true"],
.decky-unison-card.focused {
  outline: 2px solid #ffffff !important;
  outline-offset: 1px !important;
  box-shadow: 0 0 12px rgba(26, 159, 255, 0.9) !important;
  border-color: #67c1f5 !important;
  background: rgba(26, 159, 255, 0.22) !important;
}

/* Catch-all for any focused interactive element in decky-unison */
.decky-unison-root *:focus,
.decky-unison-root *:focus-visible,
.decky-unison-root *.gpfocus,
.decky-unison-root *[data-gpfocus="true"],
.decky-unison-root *.focused {
  outline: 2px solid #ffffff !important;
  outline-offset: 1px !important;
}
`;

export function injectGlobalStyles(): () => void {
  const existing = document.getElementById("decky-unison-styles");
  if (existing) existing.remove();

  const styleEl = document.createElement("style");
  styleEl.id = "decky-unison-styles";
  styleEl.textContent = GLOBAL_STYLES;
  document.head.appendChild(styleEl);

  return () => {
    const el = document.getElementById("decky-unison-styles");
    if (el) el.remove();
  };
}
