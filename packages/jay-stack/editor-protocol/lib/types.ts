// Import message and response types from protocol
export type {
    ProtocolMessage,
    ProtocolResponse,
    PublishMessage,
    SaveImageMessage,
    HasImageMessage,
    PublishResponse,
    SaveImageResponse,
    HasImageResponse,
    BaseMessage,
    BaseResponse,
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
    status: 'init' | 'configured';
    id?: string;
    port: number;
}
