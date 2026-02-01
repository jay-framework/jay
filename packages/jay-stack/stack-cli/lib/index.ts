// Export API for programmatic use
export * from './server';
export * from './config';
export * from './editor-handlers';

// Re-export contract materializer from stack-server-runtime for convenience
export {
    materializeContracts,
    listContracts,
    type ContractsIndex,
    type ContractIndexEntry,
    type MaterializeContractsOptions,
    type MaterializeResult,
} from '@jay-framework/stack-server-runtime';

// CLI entry point
import './cli';
