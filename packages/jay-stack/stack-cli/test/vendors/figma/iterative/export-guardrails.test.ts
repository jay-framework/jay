import { describe, it, expect } from 'vitest';
import type { ExportResponse, SyncStateV1 } from '@jay-framework/editor-protocol';
import { parseSyncState, SYNC_STATE_KEY } from '../../../../lib/vendors/figma/types';

function makeSyncState(overrides: Partial<SyncStateV1> = {}): SyncStateV1 {
    return {
        schemaVersion: 1,
        pageUrl: '/test',
        sectionSyncId: 'section-1',
        baselineImportHash: 'abc123',
        baselineImportedAt: '2026-01-01T00:00:00Z',
        unresolvedConflictCount: 0,
        ...overrides,
    };
}

function checkExportGuardrail(
    pluginData: Record<string, string> | undefined,
): ExportResponse | null {
    if (!pluginData) return null;
    const syncState = parseSyncState(pluginData[SYNC_STATE_KEY]);
    if (syncState && syncState.unresolvedConflictCount > 0) {
        return {
            type: 'export',
            success: false,
            error: `Export blocked: ${syncState.unresolvedConflictCount} unresolved conflict(s)`,
            blocked: true,
            blockedReason: 'Unresolved conflicts',
            unresolvedConflictCount: syncState.unresolvedConflictCount,
            actionHint: 'Resolve conflicts before exporting',
        };
    }
    return null;
}

describe('Export Guardrails (N6)', () => {
    describe('blocked when section has action_required conflicts', () => {
        it('blocks export with correct payload when conflicts > 0', () => {
            const pluginData = {
                [SYNC_STATE_KEY]: JSON.stringify(makeSyncState({ unresolvedConflictCount: 3 })),
            };

            const result = checkExportGuardrail(pluginData);

            expect(result).not.toBeNull();
            expect(result!.success).toBe(false);
            expect(result!.blocked).toBe(true);
            expect(result!.blockedReason).toBe('Unresolved conflicts');
            expect(result!.unresolvedConflictCount).toBe(3);
            expect(result!.actionHint).toBe('Resolve conflicts before exporting');
            expect(result!.error).toContain('3 unresolved conflict(s)');
        });

        it('includes correct conflict count in error message', () => {
            const pluginData = {
                [SYNC_STATE_KEY]: JSON.stringify(makeSyncState({ unresolvedConflictCount: 7 })),
            };

            const result = checkExportGuardrail(pluginData);

            expect(result!.unresolvedConflictCount).toBe(7);
            expect(result!.error).toContain('7 unresolved conflict(s)');
        });

        it('blocks even with a single unresolved conflict', () => {
            const pluginData = {
                [SYNC_STATE_KEY]: JSON.stringify(makeSyncState({ unresolvedConflictCount: 1 })),
            };

            const result = checkExportGuardrail(pluginData);

            expect(result).not.toBeNull();
            expect(result!.blocked).toBe(true);
            expect(result!.unresolvedConflictCount).toBe(1);
        });
    });

    describe('allows export when zero unresolved conflicts', () => {
        it('returns null for clean section (zero conflicts)', () => {
            const pluginData = {
                [SYNC_STATE_KEY]: JSON.stringify(makeSyncState({ unresolvedConflictCount: 0 })),
            };

            const result = checkExportGuardrail(pluginData);

            expect(result).toBeNull();
        });

        it('returns null when no sync state exists', () => {
            const result = checkExportGuardrail({});
            expect(result).toBeNull();
        });

        it('returns null when pluginData is undefined', () => {
            const result = checkExportGuardrail(undefined);
            expect(result).toBeNull();
        });
    });

    describe('handles malformed sync state gracefully', () => {
        it('returns null for invalid JSON in sync state', () => {
            const pluginData = {
                [SYNC_STATE_KEY]: 'not-json',
            };

            const result = checkExportGuardrail(pluginData);

            expect(result).toBeNull();
        });

        it('returns null for wrong schema version', () => {
            const pluginData = {
                [SYNC_STATE_KEY]: JSON.stringify({ schemaVersion: 99, unresolvedConflictCount: 5 }),
            };

            const result = checkExportGuardrail(pluginData);

            expect(result).toBeNull();
        });

        it('returns null for missing required fields', () => {
            const pluginData = {
                [SYNC_STATE_KEY]: JSON.stringify({ schemaVersion: 1 }),
            };

            const result = checkExportGuardrail(pluginData);

            expect(result).toBeNull();
        });
    });

    describe('ExportResponse shape for blocked exports', () => {
        it('blocked response has type "export"', () => {
            const pluginData = {
                [SYNC_STATE_KEY]: JSON.stringify(makeSyncState({ unresolvedConflictCount: 2 })),
            };

            const result = checkExportGuardrail(pluginData)!;

            expect(result.type).toBe('export');
        });

        it('blocked response matches ExportResponse interface', () => {
            const pluginData = {
                [SYNC_STATE_KEY]: JSON.stringify(makeSyncState({ unresolvedConflictCount: 4 })),
            };

            const result = checkExportGuardrail(pluginData)!;

            const response: ExportResponse = result;
            expect(response.type).toBe('export');
            expect(response.success).toBe(false);
            expect(response.blocked).toBe(true);
            expect(typeof response.blockedReason).toBe('string');
            expect(typeof response.unresolvedConflictCount).toBe('number');
            expect(typeof response.actionHint).toBe('string');
        });

        it('blocked response JSON serializes cleanly', () => {
            const pluginData = {
                [SYNC_STATE_KEY]: JSON.stringify(makeSyncState({ unresolvedConflictCount: 1 })),
            };

            const result = checkExportGuardrail(pluginData)!;
            const serialized = JSON.parse(JSON.stringify(result));

            expect(serialized).toEqual(result);
        });
    });
});
