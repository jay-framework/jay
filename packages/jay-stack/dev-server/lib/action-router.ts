/**
 * Action Router for Jay Stack dev server.
 *
 * Handles HTTP requests to /_jay/actions/:actionName
 * and routes them to registered action handlers.
 */

import { Request, Response, RequestHandler } from 'express';
import { ActionRegistry, actionRegistry } from '@jay-framework/stack-server-runtime';
import type { HttpMethod, JayFile } from '@jay-framework/fullstack-component';
import { getDevLogger } from '@jay-framework/logger';
import Busboy from 'busboy';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * The base path for action endpoints.
 */
export const ACTION_ENDPOINT_BASE = '/_jay/actions';

/**
 * Options for creating the action router.
 */
export interface ActionRouterOptions {
    /**
     * The action registry to use.
     * Defaults to the global actionRegistry.
     */
    registry?: ActionRegistry;
}

/**
 * Creates the action router middleware.
 *
 * Handles requests to /_jay/actions/:actionName
 *
 * For GET requests, input is parsed from query string.
 * For POST/PUT/PATCH/DELETE, input is parsed from request body.
 *
 * @param options - Optional configuration including custom registry for testing
 *
 * @example
 * ```typescript
 * // In dev-server setup (uses default registry)
 * const actionRouter = createActionRouter();
 * app.use(ACTION_ENDPOINT_BASE, actionRouter);
 *
 * // For testing (uses isolated registry)
 * const testRegistry = new ActionRegistry();
 * const actionRouter = createActionRouter({ registry: testRegistry });
 * ```
 */
export function createActionRouter(options?: ActionRouterOptions): RequestHandler {
    const registry = options?.registry ?? actionRegistry;

    return async (req: Request, res: Response) => {
        // Extract action name from URL path
        // URL format: /_jay/actions/domain.actionName
        const actionName = req.path.slice(1); // Remove leading slash

        if (!actionName) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'MISSING_ACTION_NAME',
                    message: 'Action name is required',
                    isActionError: false,
                },
            });
            return;
        }

        // Get the registered action to check method
        const action = registry.get(actionName);

        if (!action) {
            res.status(404).json({
                success: false,
                error: {
                    code: 'ACTION_NOT_FOUND',
                    message: `Action '${actionName}' is not registered`,
                    isActionError: false,
                },
            });
            return;
        }

        // Validate HTTP method
        const requestMethod = req.method.toUpperCase() as HttpMethod;
        if (requestMethod !== action.method) {
            res.status(405).json({
                success: false,
                error: {
                    code: 'METHOD_NOT_ALLOWED',
                    message: `Action '${actionName}' expects ${action.method}, got ${requestMethod}`,
                    isActionError: false,
                },
            });
            return;
        }

        // Parse input based on method
        let input: unknown;
        try {
            if (requestMethod === 'GET') {
                // For GET, parse input from query string
                // Query params can have a special '_input' param for complex objects
                if (req.query._input) {
                    input = JSON.parse(req.query._input as string);
                } else {
                    // Use query params directly
                    input = { ...req.query };
                    delete (input as any)._input;
                }
            } else {
                // For POST/PUT/PATCH/DELETE, use request body
                input = req.body;
            }
        } catch (parseError) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_INPUT',
                    message: 'Failed to parse request input',
                    isActionError: false,
                },
            });
            return;
        }

        // Start request timing
        const timing = getDevLogger()?.startRequest(
            requestMethod,
            ACTION_ENDPOINT_BASE + '/' + actionName,
        );

        // Temp dir cleanup helper (DL#131)
        const tempDir = (req as any)._jayTempDir as string | undefined;
        const cleanup = () => {
            if (tempDir) cleanupTempDir(tempDir);
        };

        // Streaming action (DL#129): respond with NDJSON
        if (registry.isStreaming(actionName)) {
            res.setHeader('Content-Type', 'application/x-ndjson');
            res.setHeader('Transfer-Encoding', 'chunked');

            try {
                const generator = registry.executeStream(actionName, input);
                for await (const chunk of generator) {
                    res.write(JSON.stringify({ chunk }) + '\n');
                }
                res.write(JSON.stringify({ done: true }) + '\n');
            } catch (err: any) {
                res.write(JSON.stringify({ error: err.message }) + '\n');
            }
            cleanup();
            res.end();
            timing?.end();
            return;
        }

        // Execute the action
        const result = await registry.execute(actionName, input);
        cleanup();

        // Set cache headers for GET requests
        if (requestMethod === 'GET' && result.success) {
            const cacheHeaders = registry.getCacheHeaders(actionName);
            if (cacheHeaders) {
                res.set('Cache-Control', cacheHeaders);
            }
        }

        // Return result
        if (result.success) {
            res.status(200).json({
                success: true,
                data: result.data,
            });
        } else {
            // Determine status code based on error type
            const statusCode = getStatusCodeForError(result.error.code, result.error.isActionError);
            res.status(statusCode).json({
                success: false,
                error: result.error,
            });
        }

        timing?.end();
    };
}

/**
 * Determines HTTP status code based on error type.
 */
function getStatusCodeForError(code: string, isActionError: boolean): number {
    // ActionErrors are business logic errors - use 422 (Unprocessable Entity)
    if (isActionError) {
        return 422;
    }

    // Map system error codes to HTTP status codes
    switch (code) {
        case 'ACTION_NOT_FOUND':
            return 404;
        case 'INVALID_INPUT':
        case 'VALIDATION_ERROR':
            return 400;
        case 'UNAUTHORIZED':
            return 401;
        case 'FORBIDDEN':
            return 403;
        case 'INTERNAL_ERROR':
        default:
            return 500;
    }
}

/**
 * Options for the action body parser middleware.
 */
export interface ActionBodyParserOptions {
    /** Build folder for temp file storage (DL#131) */
    buildFolder: string;
    /** Action registry to check for acceptsFiles (default: global actionRegistry) */
    registry?: ActionRegistry;
}

/**
 * Default file upload limits.
 */
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_MAX_FILES = 10;

/**
 * Reconstruct nested objects from multipart field names like `extraFiles.attachment_1_0`
 * (emitted by buildFormData for Record<string, Blob> values). Mutates `body` in place.
 */
function mergeDottedMultipartKeys(body: Record<string, any>): void {
    const keys = Object.keys(body);
    for (const key of keys) {
        if (!key.includes('.')) continue;
        const val = body[key];
        delete body[key];
        const parts = key.split('.');
        let cur: any = body;
        for (let i = 0; i < parts.length - 1; i++) {
            const p = parts[i]!;
            const next = cur[p];
            if (typeof next !== 'object' || next === null || Array.isArray(next)) {
                cur[p] = {};
            }
            cur = cur[p];
        }
        cur[parts[parts.length - 1]!] = val;
    }
}

/**
 * Parse a multipart/form-data request using busboy (DL#131).
 * File fields are written to a temp directory and returned as JayFile objects.
 * The `_json` field contains JSON-serialized text data.
 */
function parseMultipart(
    req: Request,
    tempDir: string,
    maxFileSize: number,
    maxFiles: number,
): Promise<{ body: Record<string, any>; tempDir: string }> {
    return new Promise((resolve, reject) => {
        fs.mkdirSync(tempDir, { recursive: true });

        const files: Record<string, JayFile | JayFile[]> = {};
        let jsonData: Record<string, any> = {};
        let fileCount = 0;
        let errored = false;
        const pendingWrites: Promise<void>[] = [];

        const bb = Busboy({
            headers: req.headers,
            limits: {
                fileSize: maxFileSize,
                files: maxFiles,
            },
        });

        bb.on('file', (fieldname, stream, info) => {
            if (errored) return;
            fileCount++;

            const filename = info.filename || `upload-${fileCount}`;
            const tempPath = path.join(tempDir, `${fileCount}-${filename}`);
            let size = 0;
            let truncated = false;

            const writeStream = fs.createWriteStream(tempPath);
            stream.pipe(writeStream);

            stream.on('data', (data: Buffer) => {
                size += data.length;
            });

            stream.on('limit', () => {
                truncated = true;
            });

            pendingWrites.push(
                new Promise<void>((resolveWrite, rejectWrite) => {
                    writeStream.on('close', () => {
                        if (truncated) {
                            rejectWrite(
                                new Error(
                                    `File "${filename}" exceeds maximum size of ${maxFileSize} bytes`,
                                ),
                            );
                            return;
                        }

                        const jayFile: JayFile = {
                            name: filename,
                            type: info.mimeType,
                            size,
                            path: tempPath,
                        };

                        // Support multiple files on same field name
                        if (files[fieldname]) {
                            const existing = files[fieldname];
                            if (Array.isArray(existing)) {
                                existing.push(jayFile);
                            } else {
                                files[fieldname] = [existing, jayFile];
                            }
                        } else {
                            files[fieldname] = jayFile;
                        }
                        resolveWrite();
                    });
                }),
            );
        });

        bb.on('field', (fieldname, value) => {
            if (errored) return;
            if (fieldname === '_json') {
                try {
                    jsonData = JSON.parse(value);
                } catch {
                    errored = true;
                    reject(new Error('Invalid JSON in _json field'));
                }
            }
        });

        bb.on('close', () => {
            if (errored) return;
            // Wait for all file write streams to finish before resolving
            Promise.all(pendingWrites)
                .then(() => {
                    const body: Record<string, any> = { ...jsonData, ...files };
                    mergeDottedMultipartKeys(body);
                    resolve({ body, tempDir });
                })
                .catch((err) => reject(err));
        });

        bb.on('error', (err: Error) => {
            if (!errored) {
                errored = true;
                reject(err);
            }
        });

        req.pipe(bb);
    });
}

/**
 * Clean up a temp directory and all its contents.
 */
function cleanupTempDir(dir: string): void {
    try {
        fs.rmSync(dir, { recursive: true, force: true });
    } catch {
        // Best effort cleanup
    }
}

/**
 * Express middleware to parse request body for action requests.
 * Supports JSON (default) and multipart/form-data (for actions with .withFiles()).
 * Should be applied before the action router.
 */
export function actionBodyParser(options: ActionBodyParserOptions): RequestHandler {
    const { buildFolder, registry: reg } = options;
    const registryToUse = reg ?? actionRegistry;

    return (req: Request, res: Response, next) => {
        // Only parse for action routes
        if (!req.path.startsWith(ACTION_ENDPOINT_BASE)) {
            next();
            return;
        }

        // Skip body parsing for GET requests
        if (req.method === 'GET') {
            next();
            return;
        }

        const contentType = req.headers['content-type'] || '';

        // Multipart/form-data: parse with busboy (DL#131)
        if (contentType.startsWith('multipart/form-data')) {
            const actionName = req.path.slice(ACTION_ENDPOINT_BASE.length + 1);
            const action = registryToUse.get(actionName);

            if (!action?.acceptsFiles) {
                res.status(400).json({
                    success: false,
                    error: {
                        code: 'FILES_NOT_ACCEPTED',
                        message: `Action '${actionName}' does not accept file uploads. Use .withFiles() on the action builder.`,
                        isActionError: false,
                    },
                });
                return;
            }

            const requestId = crypto.randomUUID();
            const tempDir = path.join(buildFolder, '.tmp', 'actions', requestId);
            const maxFileSize = (action as any).fileOptions?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
            const maxFiles = (action as any).fileOptions?.maxFiles ?? DEFAULT_MAX_FILES;

            parseMultipart(req, tempDir, maxFileSize, maxFiles)
                .then(({ body, tempDir: td }) => {
                    req.body = body;
                    // Attach cleanup function for the action router to call after handler
                    (req as any)._jayTempDir = td;
                    next();
                })
                .catch((err) => {
                    cleanupTempDir(tempDir);
                    res.status(400).json({
                        success: false,
                        error: {
                            code: 'MULTIPART_PARSE_ERROR',
                            message: err.message,
                            isActionError: false,
                        },
                    });
                });
            return;
        }

        // Default: parse JSON body
        let body = '';
        req.setEncoding('utf8');

        req.on('data', (chunk) => {
            body += chunk;
        });

        req.on('end', () => {
            try {
                req.body = body ? JSON.parse(body) : {};
                next();
            } catch (e) {
                res.status(400).json({
                    success: false,
                    error: {
                        code: 'INVALID_JSON',
                        message: 'Invalid JSON in request body',
                        isActionError: false,
                    },
                });
            }
        });
    };
}
