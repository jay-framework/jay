import { selectPluginsByRequest } from '../lib/match-plugins.js';

const selectedNames = (requested: string[]): string[] =>
    selectPluginsByRequest(requested).selected.map((plugin) => plugin.name);

describe('selectPluginsByRequest', () => {
    it('matches Title-Case labels (regression: was broken for documented names)', () => {
        const { selected, unknown } = selectPluginsByRequest(['Wix Forms', 'Wix Members']);
        expect(selected.map((plugin) => plugin.name)).toEqual([
            '@jay-framework/wix-members',
            '@jay-framework/wix-forms',
        ]);
        expect(unknown).toEqual([]);
    });

    it('matches a lowercase label', () => {
        expect(selectedNames(['wix forms'])).toEqual(['@jay-framework/wix-forms']);
        expect(selectPluginsByRequest(['wix forms']).unknown).toEqual([]);
    });

    it('matches an exact package name', () => {
        expect(selectedNames(['@jay-framework/wix-data'])).toEqual(['@jay-framework/wix-data']);
        expect(selectPluginsByRequest(['@jay-framework/wix-data']).unknown).toEqual([]);
    });

    it('reports an unknown name and selects nothing', () => {
        const { selected, unknown } = selectPluginsByRequest(['Nope Plugin']);
        expect(selected).toEqual([]);
        expect(unknown).toEqual(['Nope Plugin']);
    });

    it('selects the known plugin and reports the unknown one in a mixed request', () => {
        const { selected, unknown } = selectPluginsByRequest(['Wix Forms', 'Bogus']);
        expect(selected.map((plugin) => plugin.name)).toEqual(['@jay-framework/wix-forms']);
        expect(unknown).toEqual(['Bogus']);
    });

    it('returns empty selection and no unknowns for empty input', () => {
        const { selected, unknown } = selectPluginsByRequest([]);
        expect(selected).toEqual([]);
        expect(unknown).toEqual([]);
    });
});
