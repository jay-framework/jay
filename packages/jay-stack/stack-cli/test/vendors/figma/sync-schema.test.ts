import { describe, it, expect } from 'vitest';
import {
    parseSyncState,
    serializeSyncState,
    parseSyncBaseline,
    serializeSyncBaseline,
    SYNC_STATE_KEY,
    SYNC_BASELINE_KEY,
    SYNC_ROLLBACK_KEY,
    LEGACY_IMPORT_REPORT_KEY,
    LEGACY_IMPORT_HASH_KEY,
    LEGACY_IMPORT_TIMESTAMP_KEY,
} from '../../../lib/vendors/figma/types';
import type { SyncStateV1, SyncBaselineV1 } from '@jay-framework/editor-protocol';

describe('Sync Schema Validation', () => {
    describe('SyncStateV1 parse/serialize', () => {
        const validState: SyncStateV1 = {
            schemaVersion: 1,
            pageUrl: '/products',
            sectionSyncId: 'section-abc-123',
            baselineImportHash: 'sha256-abc123def456',
            baselineImportedAt: '2026-03-13T12:00:00.000Z',
            unresolvedConflictCount: 0,
        };

        it('parses valid SyncStateV1 payload', () => {
            const raw = JSON.stringify(validState);
            const result = parseSyncState(raw);
            expect(result).toEqual(validState);
        });

        it('parses state with optional fields', () => {
            const stateWithOptionals: SyncStateV1 = {
                ...validState,
                lastMergeSessionId: 'session-xyz',
                lastMergeAppliedAt: '2026-03-13T13:00:00.000Z',
                unresolvedConflictCount: 3,
            };
            const raw = JSON.stringify(stateWithOptionals);
            const result = parseSyncState(raw);
            expect(result).toEqual(stateWithOptionals);
        });

        it('returns null for undefined input', () => {
            expect(parseSyncState(undefined)).toBeNull();
        });

        it('returns null for empty string', () => {
            expect(parseSyncState('')).toBeNull();
        });

        it('returns null for malformed JSON', () => {
            expect(parseSyncState('{not valid json')).toBeNull();
        });

        it('returns null for wrong schema version', () => {
            const bad = JSON.stringify({ ...validState, schemaVersion: 2 });
            expect(parseSyncState(bad)).toBeNull();
        });

        it('returns null for missing required fields', () => {
            expect(parseSyncState(JSON.stringify({ schemaVersion: 1 }))).toBeNull();
            expect(parseSyncState(JSON.stringify({ schemaVersion: 1, pageUrl: '/x' }))).toBeNull();
        });

        it('serialize then parse roundtrip is lossless', () => {
            const serialized = serializeSyncState(validState);
            const parsed = parseSyncState(serialized);
            const reSerialized = serializeSyncState(parsed!);
            expect(reSerialized).toBe(serialized);
        });
    });

    describe('SyncBaselineV1 parse/serialize', () => {
        const validBaseline: SyncBaselineV1 = {
            schemaVersion: 1,
            pageUrl: '/products',
            nodes: [
                { nodeKey: 'node-1', properties: { fill: '#ff0000', fontSize: 16 } },
                { nodeKey: 'node-2', properties: { fill: '#00ff00', width: 200 } },
            ],
        };

        it('parses valid SyncBaselineV1 payload', () => {
            const raw = JSON.stringify(validBaseline);
            const result = parseSyncBaseline(raw);
            expect(result).toEqual(validBaseline);
        });

        it('parses baseline with empty nodes array', () => {
            const empty = { ...validBaseline, nodes: [] };
            const result = parseSyncBaseline(JSON.stringify(empty));
            expect(result).toEqual(empty);
        });

        it('returns null for undefined input', () => {
            expect(parseSyncBaseline(undefined)).toBeNull();
        });

        it('returns null for malformed JSON', () => {
            expect(parseSyncBaseline('corrupt')).toBeNull();
        });

        it('returns null for wrong schema version', () => {
            const bad = JSON.stringify({ ...validBaseline, schemaVersion: 99 });
            expect(parseSyncBaseline(bad)).toBeNull();
        });

        it('returns null for missing nodes array', () => {
            const bad = JSON.stringify({ schemaVersion: 1, pageUrl: '/x' });
            expect(parseSyncBaseline(bad)).toBeNull();
        });

        it('returns null for nodes not being an array', () => {
            const bad = JSON.stringify({ schemaVersion: 1, pageUrl: '/x', nodes: 'not-array' });
            expect(parseSyncBaseline(bad)).toBeNull();
        });

        it('serialize then parse roundtrip is lossless', () => {
            const serialized = serializeSyncBaseline(validBaseline);
            const parsed = parseSyncBaseline(serialized);
            const reSerialized = serializeSyncBaseline(parsed!);
            expect(reSerialized).toBe(serialized);
        });
    });

    describe('PluginData key constants', () => {
        it('sync keys have expected values', () => {
            expect(SYNC_STATE_KEY).toBe('jay-sync-state-v1');
            expect(SYNC_BASELINE_KEY).toBe('jay-sync-baseline-v1');
            expect(SYNC_ROLLBACK_KEY).toBe('jay-sync-rollback-v1');
        });

        it('legacy keys are still available for migration', () => {
            expect(LEGACY_IMPORT_REPORT_KEY).toBe('jay-import-report');
            expect(LEGACY_IMPORT_HASH_KEY).toBe('jay-import-content-hash');
            expect(LEGACY_IMPORT_TIMESTAMP_KEY).toBe('jay-import-timestamp');
        });
    });
});
