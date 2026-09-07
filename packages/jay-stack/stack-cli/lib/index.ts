// Export API for programmatic use
export * from './server';
export * from './config';

// Re-export contract materializer from stack-server-build for convenience
export {
    materializeContracts,
    listContracts,
    type PluginsIndex,
    type PluginsIndexEntry,
    type PluginContractEntry,
    type MaterializeContractsOptions,
    type MaterializeResult,
} from '@jay-framework/stack-server-build';

// CLI entry point
import './cli';
