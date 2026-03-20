import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";

declare global {
  interface Window {
    TM_WH_BALANCER?: { run?: () => void };
    TW_SUITE_NOBLE?: { run?: () => void };
  }
}

const NOBLE_SCREENS = ["snob", "overview"];

function getScreen(): string {
  return new URLSearchParams(location.search).get("screen") ?? "";
}

function OverlayApp() {
  const [screen, setScreen] = useState<string>(getScreen);

  useEffect(() => {
    const onNav = () => setScreen(getScreen());
    window.addEventListener("popstate", onNav);
    return () => window.removeEventListener("popstate", onNav);
  }, []);

  const nobleEnabled = NOBLE_SCREENS.includes(screen);

  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        zIndex: 99999,
        background: "rgba(30,20,10,0.92)",
        border: "1px solid #c8a84b",
        borderRadius: 6,
        padding: "10px 14px",
        minWidth: 160,
        color: "#f0e0a0",
        fontFamily: "sans-serif",
        fontSize: 13,
        boxShadow: "0 2px 12px rgba(0,0,0,0.6)"
      }}
    >
      <div style={{ marginBottom: 8, fontWeight: "bold", borderBottom: "1px solid #c8a84b", paddingBottom: 4 }}>
        TW Suite
      </div>
      <div style={{ marginBottom: 8, fontSize: 11, opacity: 0.7 }}>
        screen: <strong>{screen || "(none)"}</strong>
      </div>
      <button
        onClick={() => window.TM_WH_BALANCER?.run?.()}
        style={{
          display: "block",
          width: "100%",
          marginBottom: 6,
          padding: "4px 0",
          background: "#5a3e1b",
          color: "#f0e0a0",
          border: "1px solid #c8a84b",
          borderRadius: 4,
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: 12
        }}
      >
        Open WH
      </button>
      <button
        disabled={!nobleEnabled}
        onClick={() => window.TW_SUITE_NOBLE?.run?.()}
        style={{
          display: "block",
          width: "100%",
          padding: "4px 0",
          background: nobleEnabled ? "#5a3e1b" : "#2a2a2a",
          color: nobleEnabled ? "#f0e0a0" : "#666",
          border: `1px solid ${nobleEnabled ? "#c8a84b" : "#444"}`,
          borderRadius: 4,
          cursor: nobleEnabled ? "pointer" : "not-allowed",
          fontFamily: "inherit",
          fontSize: 12
        }}
      >
        Run Noble
      </button>
      {!nobleEnabled && (
        <div style={{ marginTop: 6, fontSize: 10, opacity: 0.6 }}>
          Noble available on snob/overview only.
        </div>
      )}
    </div>
  );
}

const containerId = "tw-suite-overlay-root";

if (!document.getElementById(containerId)) {
  const container = document.createElement("div");
  container.id = containerId;
  (document.body || document.documentElement).appendChild(container);
  createRoot(container).render(<OverlayApp />);
}
