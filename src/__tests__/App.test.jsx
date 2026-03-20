import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

describe('App', () => {
  it('renders the TW Suite heading', () => {
    render(<App />);
    expect(screen.getByText('TW Suite')).toBeInTheDocument();
  });

  it('shows "0 enabled" badge when no modules are enabled by default', () => {
    render(<App />);
    expect(screen.getByText('0 enabled')).toBeInTheDocument();
  });

  it('shows the correct initial enabled count when initialSettings are provided', () => {
    render(<App initialSettings={{ enabled: { fakes: true, auto_mint: true } }} />);
    expect(screen.getByText('2 enabled')).toBeInTheDocument();
  });

  it('renders Enable All and Disable All buttons', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /Enable All/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Disable All/i })).toBeInTheDocument();
  });

  it('enables all modules when Enable All is clicked', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Enable All/i }));

    expect(screen.getByText('10 enabled')).toBeInTheDocument();
    const checkboxes = screen.getAllByRole('checkbox');
    for (const cb of checkboxes) {
      expect(cb).toBeChecked();
    }
  });

  it('disables all modules when Disable All is clicked', async () => {
    const user = userEvent.setup();
    render(<App initialSettings={{ enabled: { fakes: true, auto_mint: true } }} />);

    await user.click(screen.getByRole('button', { name: /Disable All/i }));

    expect(screen.getByText('0 enabled')).toBeInTheDocument();
    const checkboxes = screen.getAllByRole('checkbox');
    for (const cb of checkboxes) {
      expect(cb).not.toBeChecked();
    }
  });

  it('increments the enabled count when a module is toggled on', async () => {
    const user = userEvent.setup();
    render(<App />);

    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]);

    expect(screen.getByText('1 enabled')).toBeInTheDocument();
  });

  it('decrements the enabled count when a module is toggled off', async () => {
    const user = userEvent.setup();
    render(<App initialSettings={{ enabled: { fakes: true } }} />);

    const fakesCheckbox = screen.getByRole('checkbox', { name: /Toggle Fakes Sender/i });
    await user.click(fakesCheckbox);

    expect(screen.getByText('0 enabled')).toBeInTheDocument();
  });

  it('renders all 10 module checkboxes', () => {
    render(<App />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(10);
  });
});
