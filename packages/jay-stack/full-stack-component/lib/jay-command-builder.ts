import { ServiceMarkers, createJayService } from './jay-stack-types';

// ============================================================================
// Console Context Service
// ============================================================================

export interface ConsoleContext {
    projectRoot: string;
    publicFolder: string;
    build: {
        frontend: string;
        backend: string;
    };
    verbose: boolean;
    log: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
}

export const CONSOLE_CONTEXT = createJayService<ConsoleContext>('ConsoleContext');

// ============================================================================
// CLI Command Types
// ============================================================================

export interface JayCliCommand<Input> {
    commandName: string;
    services: ServiceMarkers<any[]>;
    handler: (input: Input, ...services: any[]) => Promise<{ success: boolean }>;
    _brand: 'JayCliCommand';
}

export interface JayCliCommandDefinition<Input, Services extends any[]> {
    commandName: string;
    services: ServiceMarkers<Services>;
    handler: (input: Input, ...services: Services) => Promise<{ success: boolean }>;
}

export function isJayCliCommand(value: unknown): value is JayCliCommand<unknown> {
    return (
        typeof value === 'object' &&
        value !== null &&
        '_brand' in value &&
        (value as any)._brand === 'JayCliCommand'
    );
}

// ============================================================================
// Builder Interface
// ============================================================================

export interface JayCliCommandBuilder<Services extends any[]> {
    withServices<NewServices extends any[]>(
        ...services: ServiceMarkers<NewServices>
    ): JayCliCommandBuilder<NewServices>;

    withHandler<I>(
        handler: (input: I, ...services: Services) => Promise<{ success: boolean }>,
    ): JayCliCommand<I> & JayCliCommandDefinition<I, Services>;
}

// ============================================================================
// Builder Implementation
// ============================================================================

class JayCliCommandBuilderImpl<Services extends any[]> implements JayCliCommandBuilder<Services> {
    private _services: ServiceMarkers<Services> = [] as unknown as ServiceMarkers<Services>;

    constructor(private readonly _commandName: string) {}

    withServices<NewServices extends any[]>(
        ...services: ServiceMarkers<NewServices>
    ): JayCliCommandBuilder<NewServices> {
        this._services = services as unknown as ServiceMarkers<Services>;
        return this as unknown as JayCliCommandBuilder<NewServices>;
    }

    withHandler<I>(
        handler: (input: I, ...services: Services) => Promise<{ success: boolean }>,
    ): JayCliCommand<I> & JayCliCommandDefinition<I, Services> {
        return {
            commandName: this._commandName,
            services: this._services,
            handler,
            _brand: 'JayCliCommand' as const,
        };
    }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a CLI command that can be run via `jay-stack run <plugin>/<command>`.
 * Use for admin/batch operations: media upload, deployment, data sync, etc.
 *
 * @param name - Command name (e.g., 'upload-public')
 *
 * @example
 * ```typescript
 * export const uploadPublic = makeCliCommand('upload-public')
 *     .withServices(MEDIA_SERVICE, CONSOLE_CONTEXT)
 *     .withHandler(async (input: { folder?: string; dryRun?: boolean }, mediaService, console) => {
 *         console.log('Uploading files...');
 *         // ...
 *         return { success: true };
 *     });
 * ```
 */
export function makeCliCommand(name: string): JayCliCommandBuilder<[]> {
    return new JayCliCommandBuilderImpl<[]>(name);
}
