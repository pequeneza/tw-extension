import ModuleItem from './ModuleItem';

export default function ModuleList({ modules, enabled, onToggle }) {
  return (
    <div id="list">
      {modules.map((mod) => (
        <ModuleItem
          key={mod.id}
          module={mod}
          enabled={!!enabled[mod.id]}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}
