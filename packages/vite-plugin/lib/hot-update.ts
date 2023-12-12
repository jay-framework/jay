import { HmrContext, ModuleNode } from 'vite';

export function handleHotUpdate(ctx: HmrContext): ModuleNode[] {
    const { modules, file, server } = ctx;
    if (modules.length === 0 && file.endsWith('.jay-html')) {
        const tsFile = server.moduleGraph.getModuleById(`${file}.ts`);
        return tsFile ? [tsFile] : [];
    }
    return modules;
}
