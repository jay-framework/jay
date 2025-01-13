export function checkCodeErrors(code: string): string {
    if (code.length === 0) throw new Error('Empty code file');
    return code;
}
