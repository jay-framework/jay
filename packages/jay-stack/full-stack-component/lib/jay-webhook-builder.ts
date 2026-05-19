import { ServiceMarker, ServiceMarkers } from './jay-stack-types';

export interface WebhookEvent {
    type: string;
    payload: unknown;
    headers: Record<string, string | undefined>;
}

export interface InvalidateContract {
    (contractName: string, params?: Record<string, string>): Promise<void>;
}

export interface JayWebhook<Services extends any[] = any[]> {
    readonly webhookName: string;
    readonly services: ServiceMarkers<Services>;
    readonly handler: (
        event: WebhookEvent,
        invalidate: InvalidateContract,
        ...services: Services
    ) => Promise<void>;
    readonly _brand: 'JayWebhook';
}

export interface JayWebhookBuilder<Services extends any[]> {
    withServices<NewServices extends any[]>(
        ...services: ServiceMarkers<NewServices>
    ): JayWebhookBuilder<NewServices>;

    withHandler(
        handler: (
            event: WebhookEvent,
            invalidate: InvalidateContract,
            ...services: Services
        ) => Promise<void>,
    ): JayWebhook<Services>;
}

class JayWebhookBuilderImpl<Services extends any[]> implements JayWebhookBuilder<Services> {
    private _services: ServiceMarkers<Services> = [] as unknown as ServiceMarkers<Services>;

    constructor(private readonly _webhookName: string) {}

    withServices<NewServices extends any[]>(
        ...services: ServiceMarkers<NewServices>
    ): JayWebhookBuilder<NewServices> {
        this._services = services as unknown as ServiceMarkers<Services>;
        return this as unknown as JayWebhookBuilder<NewServices>;
    }

    withHandler(
        handler: (
            event: WebhookEvent,
            invalidate: InvalidateContract,
            ...services: Services
        ) => Promise<void>,
    ): JayWebhook<Services> {
        return {
            webhookName: this._webhookName,
            services: this._services,
            handler,
            _brand: 'JayWebhook' as const,
        };
    }
}

/**
 * Create a webhook handler for data change invalidation.
 *
 * @param name - Unique webhook name (e.g., 'wix-stores.product-change')
 *
 * @example
 * ```typescript
 * export const onProductChange = makeWebhook('wix-stores.product-change')
 *     .withServices(PRODUCTS_SERVICE)
 *     .withHandler(async (event, invalidate, productsService) => {
 *         const slug = await productsService.resolveSlug(event.payload.itemId);
 *         await invalidate('product-page', { slug });
 *     });
 * ```
 */
export function makeWebhook(name: string): JayWebhookBuilder<[]> {
    return new JayWebhookBuilderImpl<[]>(name);
}

export function isJayWebhook(value: unknown): value is JayWebhook {
    return (
        typeof value === 'object' &&
        value !== null &&
        (value as any)._brand === 'JayWebhook' &&
        typeof (value as any).webhookName === 'string'
    );
}