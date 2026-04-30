import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Pure functions extracted for testing ─────────────────────────────────────
// These mirror the logic in fakes.user.js without browser dependencies.

function isArrivalAllowed(arrivalDate, startStr, endStr) {
    const [startH, startM] = startStr.split(':').map(Number);
    const [endH,   endM  ] = endStr.split(':').map(Number);
    const start = new Date(arrivalDate); start.setHours(startH, startM, 0, 0);
    const end   = new Date(arrivalDate); end.setHours(endH,   endM,   0, 0);
    return arrivalDate >= start && arrivalDate <= end;
}

function generateKey() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `${seg()}-${seg()}-${seg()}-${seg()}`;
}

function normalizeCoordsForFingerprint(coordsArr) {
    const set = new Set();
    for (const c of coordsArr) {
        const s = String(c || '').trim();
        if (/^\d{1,3}\|\d{1,3}$/.test(s)) set.add(s);
    }
    return Array.from(set).sort();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('isArrivalAllowed', () => {
    it('allows arrival inside window', () => {
        const d = new Date(); d.setHours(12, 0, 0, 0);
        assert.equal(isArrivalAllowed(d, '08:00', '22:00'), true);
    });

    it('blocks arrival before window', () => {
        const d = new Date(); d.setHours(7, 0, 0, 0);
        assert.equal(isArrivalAllowed(d, '08:00', '22:00'), false);
    });

    it('blocks arrival after window', () => {
        const d = new Date(); d.setHours(23, 0, 0, 0);
        assert.equal(isArrivalAllowed(d, '08:00', '22:00'), false);
    });

    it('allows arrival exactly at window start', () => {
        const d = new Date(); d.setHours(8, 1, 0, 0);
        assert.equal(isArrivalAllowed(d, '08:01', '22:58'), true);
    });
});

describe('generateKey', () => {
    it('produces XXXX-XXXX-XXXX-XXXX format', () => {
        const key = generateKey();
        assert.match(key, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    });

    it('never contains ambiguous chars 0, O, 1, I', () => {
        for (let i = 0; i < 100; i++) {
            const key = generateKey();
            assert.equal(/[0O1I]/.test(key), false, `Ambiguous char in: ${key}`);
        }
    });

    it('generates unique keys', () => {
        const keys = new Set(Array.from({ length: 200 }, generateKey));
        assert.equal(keys.size, 200);
    });
});

describe('normalizeCoordsForFingerprint', () => {
    it('filters invalid coords', () => {
        const result = normalizeCoordsForFingerprint(['123|456', 'bad', '', '99|99']);
        assert.deepEqual(result, ['123|456', '99|99']);
    });

    it('deduplicates', () => {
        const result = normalizeCoordsForFingerprint(['100|200', '100|200', '200|100']);
        assert.equal(result.length, 2);
    });

    it('sorts deterministically', () => {
        const a = normalizeCoordsForFingerprint(['500|500', '100|100']);
        const b = normalizeCoordsForFingerprint(['100|100', '500|500']);
        assert.deepEqual(a, b);
    });
});
