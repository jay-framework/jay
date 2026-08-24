import { describe, expect, it } from 'vitest';
import { validateAiditorSettingsFile } from '../lib/aiditor-settings-lint';

describe('validateAiditorSettingsFile', () => {
    it('accepts a valid settings contribution', () => {
        const result = validateAiditorSettingsFile(
            {
                label: 'Media Manager',
                route: '/wix-media/settings',
                requires: [{ plugin: 'wix-server-client', status: 'configured' }],
            },
            'agent-kit/aiditor/settings/wix-media.yaml',
        );
        expect(result.errors).toEqual([]);
        expect(result.file).toEqual({
            label: 'Media Manager',
            route: '/wix-media/settings',
            requires: [{ plugin: 'wix-server-client', status: 'configured' }],
        });
    });

    it('rejects missing label and route', () => {
        const result = validateAiditorSettingsFile({}, 'settings.yaml');
        expect(result.file).toBeUndefined();
        expect(result.errors.length).toBeGreaterThan(0);
    });
});
