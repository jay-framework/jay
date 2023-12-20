import { rollup, RollupBuild, RollupOptions } from 'rollup';
import { JayRollupConfig, jayRuntime } from '../../lib';
import typescript from 'rollup-plugin-typescript2';

export async function generateProject(
    projectRoot: string,
    { isWorker }: { isWorker: boolean },
): Promise<RollupBuild> {
    return await rollup(getRollupConfig(projectRoot, isWorker));
}

function getRollupConfig(projectRoot: string, isWorker: boolean): RollupOptions {
    const tsConfigFilePath = `${projectRoot}/source/tsconfig.json`;
    const jayOptions: JayRollupConfig = {
        tsConfigFilePath,
        outputDir: `../dist/${isWorker ? 'worker' : 'main'}`,
        isWorker,
    };
    return {
        input: `${projectRoot}/source/${isWorker ? 'sandbox-root' : 'index'}.ts`,
        logLevel: 'debug',
        plugins: [jayRuntime(jayOptions), typescript({ tsconfig: tsConfigFilePath, check: false })],
    };
}
