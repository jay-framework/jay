import { rollup, RollupBuild, RollupOptions } from 'rollup';
import { JayRollupConfig, jayRuntime } from '../../lib';
import typescript from 'rollup-plugin-typescript2';

interface GenerateProjectOptions {
    isWorker: boolean,
    compilerPatternFiles?: string[]
}

export async function generateProject(
    projectRoot: string,
    { isWorker, compilerPatternFiles}: GenerateProjectOptions,
): Promise<RollupBuild> {
    return await rollup(getRollupConfig(projectRoot, isWorker, compilerPatternFiles));
}

function getRollupConfig(projectRoot: string, isWorker: boolean, compilerPatternFiles: string[]): RollupOptions {
    const tsConfigFilePath = `${projectRoot}/source/tsconfig.json`;
    const jayOptions: JayRollupConfig = {
        tsConfigFilePath,
        outputDir: `../dist/${isWorker ? 'worker' : 'main'}`,
        isWorker,
        compilerPatternFiles
    };
    return {
        input: `${projectRoot}/source/${isWorker ? 'sandbox-root' : 'index'}.ts`,
        logLevel: 'debug',
        plugins: [jayRuntime(jayOptions), typescript({ tsconfig: tsConfigFilePath, check: false })],
    };
}
