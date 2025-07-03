// Message format for WebSocket communication
export interface ProtocolMessage {
  id: string; // Unique message ID for request/response correlation
  type: 'publish' | 'saveImage' | 'hasImage';
  params: PublishMessage | SaveImageMessage | HasImageMessage;
  timestamp: number;
}

// Import message types from protocol
import type { PublishMessage, SaveImageMessage, HasImageMessage } from './protocol';

export interface ProtocolResponse {
  id: string; // Matches the request ID
  success: boolean;
  data?: any;
  error?: string;
  timestamp: number;
}

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