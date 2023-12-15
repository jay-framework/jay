export const SANDBOX_ROOT_PREFIX = 'jay-sandbox:';

export function hasPrefix(filename: string, prefix: string): boolean {
    return filename.length > prefix.length && filename.startsWith(prefix);
}

export function withoutPrefix(filename: string, prefix: string): string {
    return filename.substring(prefix.length);
}
