import { useState } from 'react';
import ModuleList from './components/ModuleList';
import { MODULES, mergeDefaults } from './modules';

export default function App({ initialSettings }) {
  const [settings, setSettings] = useState(
    () => mergeDefaults(initialSettings)
  );

  const enabledCount = Object.values(settings.enabled).filter(Boolean).length;

  function handleToggle(id, value) {
    setSettings((prev) => ({
      ...prev,
      enabled: { ...prev.enabled, [id]: value },
    }));
  }

  function handleEnableAll() {
    const enabled = {};
    for (const m of MODULES) enabled[m.id] = true;
    setSettings((prev) => ({ ...prev, enabled }));
  }

  function handleDisableAll() {
    const enabled = {};
    for (const m of MODULES) enabled[m.id] = false;
    setSettings((prev) => ({ ...prev, enabled }));
  }

  return (
    <div className="popup">
      <header>
        <h1>TW Suite</h1>
        <span id="enabledBadge">{enabledCount} enabled</span>
      </header>

      <div className="actions">
        <button id="enableAll" onClick={handleEnableAll}>
          Enable All
        </button>
        <button id="disableAll" onClick={handleDisableAll}>
          Disable All
        </button>
      </div>

      <ModuleList
        modules={MODULES}
        enabled={settings.enabled}
        onToggle={handleToggle}
      />
    </div>
  );
}
