import { glob } from 'fast-glob';
import { JAY_EXTENSION } from 'jay-compiler-shared';

export async function findAllJayFiles(dir): Promise<string[]> {
    return await glob(`${dir}/**/*{${JAY_EXTENSION}}`);
}
