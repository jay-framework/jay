/**
 * Context passed to compiled renderToStream functions.
 * Provides `write` for streaming HTML chunks and `onAsync` for registering
 * promise-based async content that will be swapped in via inline scripts.
 */
export interface ServerRenderContext {
    /** Write an HTML chunk to the response stream. */
    write: (chunk: string) => void;

    /**
     * Register an async promise for streaming resolution.
     * The pending variant is rendered inline immediately.
     * When the promise settles, the framework writes an inline script
     * that swaps the pending content with resolved/rejected content.
     */
    onAsync: (
        promise: Promise<any>,
        id: string,
        templates: {
            resolved: (val: any) => string;
            rejected: (err: any) => string;
        },
    ) => void;
}
