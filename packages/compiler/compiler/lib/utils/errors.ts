export function withOriginalTrace<T extends Error>(error: T, originalError: Error): T {
    error.stack = `${error.stack}\nCaused by\n${originalError.stack}`;
    return error;
}
