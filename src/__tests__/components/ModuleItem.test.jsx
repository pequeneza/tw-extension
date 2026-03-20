import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModuleItem from '../../components/ModuleItem';

const mockModule = {
  id: 'fakes',
  name: 'Fakes Sender',
  desc: 'Smart fake sender with caps + UI.',
};

describe('ModuleItem', () => {
  it('renders module name and description', () => {
    render(
      <ModuleItem module={mockModule} enabled={false} onToggle={() => {}} />
    );
    expect(screen.getByText('Fakes Sender')).toBeInTheDocument();
    expect(
      screen.getByText('Smart fake sender with caps + UI.')
    ).toBeInTheDocument();
  });

  it('renders a checked checkbox when enabled is true', () => {
    render(
      <ModuleItem module={mockModule} enabled={true} onToggle={() => {}} />
    );
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('renders an unchecked checkbox when enabled is false', () => {
    render(
      <ModuleItem module={mockModule} enabled={false} onToggle={() => {}} />
    );
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('calls onToggle with module id and new value when toggled', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();

    render(
      <ModuleItem module={mockModule} enabled={false} onToggle={onToggle} />
    );

    await user.click(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalledWith('fakes', true);
  });

  it('calls onToggle with false when unchecking a checked module', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();

    render(
      <ModuleItem module={mockModule} enabled={true} onToggle={onToggle} />
    );

    await user.click(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalledWith('fakes', false);
  });

  it('has accessible aria-label for the toggle', () => {
    render(
      <ModuleItem module={mockModule} enabled={false} onToggle={() => {}} />
    );
    expect(
      screen.getByRole('checkbox', { name: /Toggle Fakes Sender/i })
    ).toBeInTheDocument();
  });
});
