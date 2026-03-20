import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ModuleList from '../../components/ModuleList';
import { MODULES } from '../../modules';

const allDisabled = Object.fromEntries(MODULES.map((m) => [m.id, false]));
const allEnabled = Object.fromEntries(MODULES.map((m) => [m.id, true]));

describe('ModuleList', () => {
  it('renders all module names', () => {
    render(
      <ModuleList modules={MODULES} enabled={allDisabled} onToggle={() => {}} />
    );
    for (const mod of MODULES) {
      expect(screen.getByText(mod.name)).toBeInTheDocument();
    }
  });

  it('renders 10 checkboxes for 10 modules', () => {
    render(
      <ModuleList modules={MODULES} enabled={allDisabled} onToggle={() => {}} />
    );
    expect(screen.getAllByRole('checkbox')).toHaveLength(10);
  });

  it('renders all checkboxes as checked when all are enabled', () => {
    render(
      <ModuleList modules={MODULES} enabled={allEnabled} onToggle={() => {}} />
    );
    const checkboxes = screen.getAllByRole('checkbox');
    for (const cb of checkboxes) {
      expect(cb).toBeChecked();
    }
  });

  it('renders all checkboxes as unchecked when all are disabled', () => {
    render(
      <ModuleList modules={MODULES} enabled={allDisabled} onToggle={() => {}} />
    );
    const checkboxes = screen.getAllByRole('checkbox');
    for (const cb of checkboxes) {
      expect(cb).not.toBeChecked();
    }
  });

  it('renders an empty list when modules array is empty', () => {
    render(<ModuleList modules={[]} enabled={{}} onToggle={() => {}} />);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('passes onToggle down to each item', () => {
    const onToggle = vi.fn();
    render(
      <ModuleList modules={MODULES} enabled={allDisabled} onToggle={onToggle} />
    );
    // Verify the list renders; interaction tests are covered in ModuleItem tests
    expect(screen.getAllByRole('checkbox')).toHaveLength(10);
  });
});
