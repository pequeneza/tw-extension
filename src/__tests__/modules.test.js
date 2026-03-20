import { describe, it, expect } from 'vitest';
import { MODULES, mergeDefaults } from '../modules';

describe('MODULES', () => {
  it('contains 10 modules', () => {
    expect(MODULES).toHaveLength(10);
  });

  it('each module has id, name, and desc', () => {
    for (const mod of MODULES) {
      expect(mod).toHaveProperty('id');
      expect(mod).toHaveProperty('name');
      expect(mod).toHaveProperty('desc');
      expect(typeof mod.id).toBe('string');
      expect(typeof mod.name).toBe('string');
      expect(typeof mod.desc).toBe('string');
    }
  });

  it('module ids are unique', () => {
    const ids = MODULES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('mergeDefaults', () => {
  it('returns all modules disabled when called with no saved settings', () => {
    const result = mergeDefaults(null);
    for (const mod of MODULES) {
      expect(result.enabled[mod.id]).toBe(false);
    }
  });

  it('preserves saved enabled state', () => {
    const result = mergeDefaults({ enabled: { fakes: true } });
    expect(result.enabled.fakes).toBe(true);
  });

  it('defaults missing modules to false even when other settings exist', () => {
    const result = mergeDefaults({ enabled: { fakes: true } });
    expect(result.enabled.auto_mint).toBe(false);
  });

  it('returns enabled object with all module ids', () => {
    const result = mergeDefaults(undefined);
    for (const mod of MODULES) {
      expect(result.enabled).toHaveProperty(mod.id);
    }
  });
});
