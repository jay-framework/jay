// Import message and response types from protocol
export type {
    ProtocolMessage,
    ProtocolResponse,
    PublishMessage,
    SaveImageMessage,
    HasImageMessage,
    GetProjectInfoMessage,
    ExportDesignMessage,
    ImportDesignMessage,
    PublishResponse,
    SaveImageResponse,
    HasImageResponse,
    GetProjectInfoResponse,
    ExportDesignResponse,
    ImportDesignResponse,
    BaseMessage,
    BaseResponse,
    ContractTag,
    ContractSchema,
    ProjectInfo,
    ProjectPage,
    ProjectComponent,
    // New plugin system types
    PluginManifest,
    PluginPageDef,
    PluginComponentDef,
    StaticContractDef,
    DynamicContractDef,
    Plugin,
    PluginContractsByType,
    PluginPageContract,
    PluginComponentContract,
} from './protocol';

// Connection configuration
export interface EditorConfig {
    id?: string; // Optional UUID for the editor connection
    name?: string; // Optional project name
    portRanges: {
        http: [number, number]; // HTTP site port range
        editor: [number, number]; // Editor communication port range
    };
}

// Connection state
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

// Port discovery response
export interface PortDiscoveryResponse {
    status: 'init' | 'match' | 'no-match';
    id?: string;
    port: number;
}
