import * as fastGlob from 'fast-glob';
const { glob } = fastGlob;
import { JAY_EXTENSION } from '@jay-framework/compiler-shared';

export async function findAllJayFiles(dir): Promise<string[]> {
    return await glob(`${dir}/**/*${JAY_EXTENSION}`);
}
