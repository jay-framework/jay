import * as prettier from 'prettier';

export async function prettify(code: string): Promise<string> {
    // same format as global .prettierrc
    return await prettier.format(code, {
        printWidth: 100,
        singleQuote: true,
        tabWidth: 4,
        parser: 'typescript',
    });
}

export function removeComments(code: string): string {
    return code
        .split('\n')
        .filter((line) => !line.includes('// @ts-expect-error '))
        .join('\n');
}
