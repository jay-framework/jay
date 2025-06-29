import { mock } from 'vitest-mock-extended';
import { PluginContext, ResolvedId } from 'rollup';
import path from 'node:path';
import {
    JAY_EXTENSION,
    JAY_QUERY_MAIN_SANDBOX,
    JAY_QUERY_WORKER_TRUSTED_TS,
    SourceFileFormat,
    TS_EXTENSION,
} from '@jay-framework/compiler-shared';
import {
    resolveJayHtml,
    removeSandboxPrefixForWorkerRoot,
    ResolveIdOptions,
    resolveJayModeFile,
} from '../../../lib/runtime/resolve-id';
import { JayMetadata } from '../../../lib/runtime/metadata';
import { SANDBOX_ROOT_PREFIX } from '../../../lib/runtime/sandbox';

describe('resolve-id', () => {
    const options = {} as ResolveIdOptions;

    const getContext = ({
        meta,
        resolvedId,
    }: {
        meta?: { jay?: JayMetadata };
        resolvedId?: Partial<ResolvedId>;
    } = {}) =>
        mock<PluginContext>({
            getModuleInfo: vi.fn().mockReturnValue({ meta }),
            resolve: vi.fn().mockResolvedValue(resolvedId),
            getWatchFiles: vi.fn().mockReturnValue([]),
        });

    describe('addTsExtensionForJayFile', () => {
        const source = './app.jay-html';
        const importer = '/root/src/index.ts';
        const originId = '/root/src/resolved.jay-html';
        const resolvedId = { id: originId } as Partial<ResolvedId>;

        it('adds .ts extension to id, adds originId and format to metadata', async () => {
            const context = getContext({ resolvedId });
            expect(await resolveJayHtml(context, source, importer, options)).toEqual({
                id: `${originId}${TS_EXTENSION}`,
                meta: { jay: { originId, format: SourceFileFormat.JayHtml } },
            });
        });

        describe('when no file is resolved', () => {
            const resolvedId = null;

            it('returns null', async () => {
                const context = getContext({ resolvedId });
                expect(await resolveJayHtml(context, source, importer, options)).toBeNull();
            });
        });

        describe('when file is already resolved by jay', () => {
            const resolvedId = {
                id: originId,
                meta: {
                    jay: {
                        format: SourceFileFormat.JayHtml,
                        originId,
                    },
                } as JayMetadata,
            } as Partial<ResolvedId>;

            it('returns resolved id', async () => {
                const context = getContext({ resolvedId });
                expect(await resolveJayHtml(context, source, importer, options)).toEqual({
                    id: `${resolvedId.meta.jay.originId}${TS_EXTENSION}`,
                    meta: resolvedId.meta,
                });
            });
        });

        describe('for a manually defined *.ts file', () => {
            const resolvedId = { id: `${originId}${TS_EXTENSION}` } as Partial<ResolvedId>;

            it('returns null', async () => {
                const context = getContext({ resolvedId });
                expect(await resolveJayHtml(context, source, importer, options)).toBeNull();
            });
        });
    });

    describe('resolveJayModeFile', () => {
        const resolveId = 'counter.ts';
        const source = `./counter${TS_EXTENSION}${JAY_QUERY_MAIN_SANDBOX}`;
        const importer = '/root/src/app.jay-html.ts';
        const format = SourceFileFormat.JayHtml;
        const meta = { jay: { format } };
        const resolvedId = {
            id: path.join(path.dirname(importer), resolveId),
            meta,
        } as Partial<ResolvedId>;

        it('resolves via rollup, adds query to id, adds originId and format to meta', async () => {
            const context = getContext({ meta, resolvedId });
            expect(await resolveJayModeFile(context, source, importer, options)).toEqual({
                id: `${path.join(path.dirname(importer), source)}${TS_EXTENSION}`,
                meta: { jay: { originId: resolvedId.id, format } },
            });
        });

        describe('for jay file with jay query', () => {
            const source = `./counter${JAY_EXTENSION}${JAY_QUERY_MAIN_SANDBOX}`;
            const resolveId = `counter${JAY_EXTENSION}${TS_EXTENSION}`;
            const resolvedId = {
                id: path.join(path.dirname(importer), resolveId),
                meta: {
                    jay: {
                        format: SourceFileFormat.JayHtml,
                        originId: path.join(path.dirname(importer), `counter${JAY_EXTENSION}`),
                    } as JayMetadata,
                },
            } as Partial<ResolvedId>;

            it('resolves via rollup, adds query to id, adds originId and format from resolved one to meta', async () => {
                const context = getContext({ meta, resolvedId });
                expect(await resolveJayModeFile(context, source, importer, options)).toEqual({
                    id: `${path.join(path.dirname(importer), source)}${TS_EXTENSION}`,
                    meta: resolvedId.meta,
                });
            });
        });

        describe('when no file is resolved', () => {
            const resolvedId = null;

            it('returns null', async () => {
                const context = getContext({ resolvedId });
                expect(await resolveJayModeFile(context, source, importer, options)).toBeNull();
            });
        });

        describe('when origin has no jay format defined', () => {
            const meta = {};
            const resolvedId = {
                id: path.join(path.dirname(importer), resolveId),
            } as Partial<ResolvedId>;

            it('returns typescript format', async () => {
                const context = getContext({ meta, resolvedId });
                expect(await resolveJayModeFile(context, source, importer, options)).toEqual({
                    id: `${path.join(path.dirname(importer), source)}${TS_EXTENSION}`,
                    meta: { jay: { originId: resolvedId.id, format: SourceFileFormat.TypeScript } },
                });
            });
        });
    });

    describe('removeSandboxPrefixForWorkerRoot', () => {
        const filename = 'sandbox-root';
        const source = `${SANDBOX_ROOT_PREFIX}./${filename}`;
        const importer = '/root/src/index.ts';
        const resolveId = path.join(path.dirname(importer), `${filename}${TS_EXTENSION}`);
        const resolvedId = { id: resolveId } as Partial<ResolvedId>;

        it('removes sandbox prefix from id, adds isWorkerRoot to meta', async () => {
            const context = getContext({ resolvedId });
            expect(
                await removeSandboxPrefixForWorkerRoot(context, source, importer, options),
            ).toEqual({
                id: `${resolveId}${JAY_QUERY_WORKER_TRUSTED_TS}`,
                meta: {
                    jay: {
                        isWorkerRoot: true,
                        format: SourceFileFormat.TypeScript,
                        originId: resolveId,
                    },
                },
            });
        });

        describe('for Vite', () => {
            const VITE_POSTFIX = '?type=module&worker_file';
            const resolveId = path.join(
                path.dirname(importer),
                `${filename}${TS_EXTENSION}${VITE_POSTFIX}`,
            );
            const resolvedId = { id: resolveId } as Partial<ResolvedId>;

            it('resolves originId without worker query', async () => {
                const context = getContext({ resolvedId });
                expect(
                    await removeSandboxPrefixForWorkerRoot(context, source, importer, options),
                ).toEqual({
                    id: `${resolveId}${JAY_QUERY_WORKER_TRUSTED_TS}`,
                    meta: {
                        jay: {
                            isWorkerRoot: true,
                            format: SourceFileFormat.TypeScript,
                            originId: path.resolve(
                                path.dirname(importer),
                                `${filename}${TS_EXTENSION}`,
                            ),
                        },
                    },
                });
            });
        });

        describe('when no file is resolved', () => {
            const resolvedId = null;

            it('returns null', async () => {
                const context = getContext({ resolvedId });
                expect(
                    await removeSandboxPrefixForWorkerRoot(context, source, importer, options),
                ).toBeNull();
            });
        });
    });
});
