import { describe, expect, it } from 'vitest';
import { sortPluginsByDependencies } from '../lib/plugin-dependency-sort';

function plugin(
    name: string,
    packageName: string,
    dependencies: string[] = [],
) {
    return { name, packageName, dependencies };
}

describe('sortPluginsByDependencies', () => {
    it('places dependency plugins before dependents', () => {
        const plugins = [
            plugin('wix-server-client', '@jay-framework/wix-server-client', ['@wix/sdk']),
            plugin('wix-bookings', '@jay-framework/wix-bookings', [
                '@jay-framework/wix-forms',
                '@jay-framework/wix-server-client',
            ]),
            plugin('wix-data', '@jay-framework/wix-data', ['@jay-framework/wix-server-client']),
            plugin('wix-deploy', '@jay-framework/wix-deploy', ['@jay-framework/wix-server-client']),
            plugin('wix-forms', '@jay-framework/wix-forms', ['@jay-framework/wix-server-client']),
            plugin('wix-members', '@jay-framework/wix-members', ['@jay-framework/wix-server-client']),
            plugin('wix-media', '@jay-framework/wix-media', ['@jay-framework/wix-server-client']),
        ];

        const sorted = sortPluginsByDependencies(plugins);

        expect(sorted.findIndex((entry) => entry.name === 'wix-forms')).toBeLessThan(
            sorted.findIndex((entry) => entry.name === 'wix-bookings'),
        );
        expect(sorted.findIndex((entry) => entry.name === 'wix-server-client')).toBeLessThan(
            sorted.findIndex((entry) => entry.name === 'wix-bookings'),
        );
    });

    it('does not rely on discovery order for transitive dependencies', () => {
        const plugins = [
            plugin('wix-bookings', '@jay-framework/wix-bookings', ['@jay-framework/wix-forms']),
            plugin('wix-forms', '@jay-framework/wix-forms', ['@jay-framework/wix-server-client']),
            plugin('wix-server-client', '@jay-framework/wix-server-client'),
        ];

        const sorted = sortPluginsByDependencies(plugins).map((entry) => entry.name);

        expect(sorted).toEqual(['wix-server-client', 'wix-forms', 'wix-bookings']);
    });
});
