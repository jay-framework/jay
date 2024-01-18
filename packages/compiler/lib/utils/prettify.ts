import * as prettier from 'prettier';

export async function prettify(code: string): Promise<string> {
    // same format as global .prettierrc
    try {
        return (await prettier.format(code, {
            printWidth: 100,
            singleQuote: true,
            tabWidth: 4,
            parser: 'typescript',
        }))
            // .split("\n")
            // .filter(line => line.trim())  // Remove empty lines
            // .join("\n");
    }
    catch (error) {
        throw new Error(`failed to prettify code
original error: ${error.message}
code:
${code}`)
    }
}

export function removeComments(code: string): string {
    return code
        .split('\n')
        .filter((line) => !line.includes('// @ts-expect-error '))
        .join('\n');
}
