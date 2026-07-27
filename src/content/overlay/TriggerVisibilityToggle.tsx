import React, { useEffect, useState } from "react";
import { ModuleId } from "../../types/modules";

/** Shared across every dedicated view's cfg-header and Overlay.tsx's trigger-stack gating. */
export const TRIGGER_VISIBILITY_KEY = "xbot_trigger_visibility_v1";

/**
 * Small icon button for a view's cfg-header — toggles whether this module's
 * dedicated trigger icon shows in the overlay's trigger-stack. When
 * "unpinned" the module is still fully reachable via the main ⚡ overlay's
 * module list — this only controls the on-page shortcut icon.
 */
export function TriggerVisibilityToggle({ moduleId }: { moduleId: ModuleId }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    chrome.storage.sync.get(TRIGGER_VISIBILITY_KEY, (r) => {
      const map = (r[TRIGGER_VISIBILITY_KEY] as Partial<Record<ModuleId, boolean>>) ?? {};
      setVisible(map[moduleId] !== false);
    });
  }, [moduleId]);

  const toggle = () => {
    const next = !visible;
    setVisible(next);
    chrome.storage.sync.get(TRIGGER_VISIBILITY_KEY, (r) => {
      const map = (r[TRIGGER_VISIBILITY_KEY] as Partial<Record<ModuleId, boolean>>) ?? {};
      chrome.storage.sync.set({ [TRIGGER_VISIBILITY_KEY]: { ...map, [moduleId]: next } });
    });
  };

  return (
    <button className={`back-btn${visible ? " back-btn--active" : ""}`}
      onClick={toggle}
      title={visible ? "Atalho fixo no jogo — clica para ocultar" : "Atalho oculto — abre só pelo menu principal"}
      aria-label="Mostrar atalho no jogo" aria-pressed={visible}>
      <img src={chrome.runtime.getURL("icons/drawer-svgrepo-com.svg")} alt=""
        style={{ width: 14, height: 14, opacity: visible ? 1 : 0.4 }} />
    </button>
  );
}
