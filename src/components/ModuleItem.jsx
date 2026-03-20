export default function ModuleItem({ module, enabled, onToggle }) {
  return (
    <div className="item">
      <div className="meta">
        <div className="name">{module.name}</div>
        <div className="desc">{module.desc}</div>
      </div>
      <label className="switch">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(module.id, e.target.checked)}
          aria-label={`Toggle ${module.name}`}
        />
      </label>
    </div>
  );
}
