import { VendorAdapter } from './types';

export class AdapterRegistry {
    private adapters = new Map<string, VendorAdapter>();

    register(adapter: VendorAdapter) {
        if (this.adapters.has(adapter.vendorId)) {
            throw new Error(`Adapter for ${adapter.vendorId} already registered`);
        }
        this.adapters.set(adapter.vendorId, adapter);
    }

    get(vendorId: string): VendorAdapter {
        const adapter = this.adapters.get(vendorId);
        if (!adapter) {
            throw new Error(`No adapter found for vendor: ${vendorId}`);
        }
        return adapter;
    }
}

export const designAdapterRegistry = new AdapterRegistry();

