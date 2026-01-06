/**
 * Action Router for Jay Stack dev server.
 *
 * Handles HTTP requests to /_jay/actions/:actionName
 * and routes them to registered action handlers.
 */

import { Request, Response, RequestHandler } from 'express';
import { ActionRegistry, actionRegistry } from '@jay-framework/stack-server-runtime';
import type { HttpMethod } from '@jay-framework/fullstack-component';

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

        // Execute the action
        const result = await registry.execute(actionName, input);

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
 * Express middleware to parse JSON body for action requests.
 * Should be applied before the action router.
 */
export function actionBodyParser(): RequestHandler {
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

        // Parse JSON body
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
