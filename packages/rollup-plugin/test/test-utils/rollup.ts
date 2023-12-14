import { rollup, RollupBuild, RollupOptions } from 'rollup';
import { jayRuntime } from '../../lib';
import typescript from 'rollup-plugin-typescript2';

export async function generateProject(
    projectRoot: string,
    { isWorker }: { isWorker: boolean },
): Promise<RollupBuild> {
    return await rollup(getRollupConfig(projectRoot, isWorker));
}

function getRollupConfig(projectRoot: string, isWorker: boolean): RollupOptions {
    const tsConfigFilePath = `${projectRoot}/source/tsconfig.json`;
    return {
        input: `${projectRoot}/source/index.ts`,
        logLevel: 'debug',
        plugins: [
            jayRuntime({
                tsConfigFilePath,
                outputDir: `../dist/${isWorker ? 'worker' : 'main'}`,
                isWorker,
            }),
            typescript({ tsconfig: tsConfigFilePath, check: false }),
        ],
    };
}
