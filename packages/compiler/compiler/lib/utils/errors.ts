export function withOriginalTrace<T extends Error>(error: T, originalError: Error): T {
    error.stack = `${error.stack}\nCaused by\n${originalError.stack}`;
    return error;
}

export function checkCodeErrors(code: string): string {
    if (code.length === 0) throw new Error('Empty code');
    return code;
}
