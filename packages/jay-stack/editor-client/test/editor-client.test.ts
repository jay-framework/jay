import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorClient, createEditorClient, createEditorClientWithConnectionManager } from '../lib';
import { ConnectionManager, createConnectionManager } from '../lib';
import { createTestServer, TestServer, TestServerResponse } from './test-server';
import type { PublishMessage } from '@jay-framework/editor-protocol';

describe('Editor Client', () => {
    let client: EditorClient;
    let connectionManager: ConnectionManager;
    let testServer: TestServer;
    let serverResponse: TestServerResponse;

    beforeEach(async () => {
        // Start test server
        testServer = createTestServer({});
        serverResponse = await testServer.start();

        // Create connection manager that will connect to our test server
        connectionManager = createConnectionManager({
            portRange: [serverResponse.port, serverResponse.port], // Only scan the test server port
            scanTimeout: 1000,
            retryAttempts: 1,
            editorId: 'test-editor-id',
        });
        client = createEditorClientWithConnectionManager(connectionManager);
    });

    afterEach(async () => {
        await client.disconnect();
        await serverResponse.close();
    });

    it('should create editor client instance', () => {
        expect(client).toBeInstanceOf(EditorClient);
    });

    it('should have initial disconnected state', () => {
        expect(client.getConnectionState()).toBe('disconnected');
    });

    it('should connect to test server', async () => {
        await client.connect();
        expect(client.getConnectionState()).toBe('connected');
    });

    it('should publish jay-html files', async () => {
        // Set up test server handler
        testServer.onPublish(async (msg) => {
            expect(msg.type).toBe('publish');
            expect(msg.pages).toHaveLength(1);
            expect(msg.pages[0].route).toBe('/test');
            expect(msg.pages[0].name).toBe('test-page');
            return {
                status: [{ success: true, filePath: '/test/test-page.jay-html' }],
            };
        });

        await client.connect();

        const result = await client.publish({
            type: 'publish',
            pages: [
                {
                    route: '/test',
                    jayHtml: '<div>Test content</div>',
                    name: 'test-page',
                },
            ] as [
                {
                    route: string;
                    jayHtml: string;
                    name: string;
                },
            ],
        });

        expect(result.status).toHaveLength(1);
        expect(result.status[0].success).toBe(true);
        expect(result.status[0].filePath).toBe('/test/test-page.jay-html');
    });

    it('should save images', async () => {
        // Set up test server handler
        testServer.onSaveImage(async (msg) => {
            expect(msg.type).toBe('saveImage');
            expect(msg.imageId).toBe('test-image');
            expect(msg.imageData).toContain('data:image/png;base64');
            return {
                success: true,
                imageUrl: '/assets/test-image.png',
            };
        });

        await client.connect();

        const result = await client.saveImage({
            type: 'saveImage',
            imageId: 'test-image',
            imageData:
                'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        });

        expect(result.success).toBe(true);
        expect(result.imageUrl).toBe('/assets/test-image.png');
    });

    it('should check if images exist', async () => {
        // Set up test server handler
        testServer.onHasImage(async (msg) => {
            expect(msg.type).toBe('hasImage');
            expect(msg.imageId).toBe('test-image');
            return {
                exists: true,
                imageUrl: '/assets/test-image.png',
            };
        });

        await client.connect();

        const result = await client.hasImage({
            type: 'hasImage',
            imageId: 'test-image',
        });

        expect(result.exists).toBe(true);
        expect(result.imageUrl).toBe('/assets/test-image.png');
    });

    it('should handle server errors', async () => {
        // Set up test server handler that throws an error
        testServer.onPublish(async () => {
            throw new Error('Test server error');
        });

        await client.connect();

        await expect(
            client.publish({
                type: 'publish',
                pages: [
                    {
                        route: '/test',
                        jayHtml: '<div>Test</div>',
                        name: 'test-page',
                    },
                ] as [
                    {
                        route: string;
                        jayHtml: string;
                        name: string;
                    },
                ],
            }),
        ).rejects.toThrow('Test server error');
    });

    it('should provide access to underlying ConnectionManager', () => {
        const manager = client.getConnectionManager();
        expect(manager).toBe(connectionManager);
    });

    it('should implement EditorProtocol interface', () => {
        expect(typeof client.publish).toBe('function');
        expect(typeof client.saveImage).toBe('function');
        expect(typeof client.hasImage).toBe('function');
    });
});

describe('Connection Manager', () => {
    let manager: ConnectionManager;
    let testServer: TestServer;
    let serverResponse: any;

    beforeEach(async () => {
        // Start test server
        testServer = createTestServer({});
        serverResponse = await testServer.start();

        manager = createConnectionManager({
            portRange: [serverResponse.port, serverResponse.port],
            scanTimeout: 1000,
            retryAttempts: 1,
            editorId: 'test-editor-id',
            autoReconnect: false,
        });
    });

    afterEach(async () => {
        await manager.disconnect();
        await serverResponse.close();
    });

    it('should create connection manager instance', () => {
        expect(manager).toBeInstanceOf(ConnectionManager);
    });

    it('should have initial disconnected state', () => {
        expect(manager.getConnectionState()).toBe('disconnected');
    });

    it('should connect to test server', async () => {
        await manager.connect();
        expect(manager.getConnectionState()).toBe('connected');
    });

    it('should send messages when connected', async () => {
        // Set up test server handler
        testServer.onPublish(async (msg) => {
            expect(msg.type).toBe('publish');
            return { status: [{ success: true, filePath: '/test/file.jay-html' }] };
        });

        await manager.connect();

        const result = await manager.sendMessage<never, PublishMessage>({
            type: 'publish',
            pages: [
                {
                    route: '/test',
                    jayHtml: '<div>Test</div>',
                    name: 'test-page',
                },
            ] as [
                {
                    route: string;
                    jayHtml: string;
                    name: string;
                },
            ],
        });

        expect(result.status).toHaveLength(1);
        expect(result.status[0].success).toBe(true);
        expect(result.status[0].filePath).toBe('/test/file.jay-html');
    });

    it('should handle connection errors gracefully', async () => {
        // Create manager with non-existent port range
        const badManager = createConnectionManager({
            portRange: [9999, 9999],
            scanTimeout: 100,
            retryAttempts: 1,
        });

        await expect(badManager.connect()).rejects.toThrow('No editor server found');
        expect(badManager.getConnectionState()).toBe('error');
    });

    it('should handle manual disconnect', async () => {
        await manager.connect();
        expect(manager.getConnectionState()).toBe('connected');

        await manager.disconnect();
        expect(manager.getConnectionState()).toBe('disconnected');
    });

    it('should handle server in configured mode', async () => {
        // Close the init server
        await serverResponse.close();

        // Start a new server in configured mode
        const configuredServer = createTestServer({
            editorId: 'test-editor-id',
        });
        const configuredResponse = await configuredServer.start();

        // Create manager with different editor ID (should not connect)
        const wrongManager = createConnectionManager({
            portRange: [configuredResponse.port, configuredResponse.port],
            scanTimeout: 500,
            retryAttempts: 1,
            editorId: 'wrong-editor-id',
        });

        await expect(wrongManager.connect()).rejects.toThrow('No editor server found');

        // Create manager with correct editor ID (should connect)
        const correctManager = createConnectionManager({
            portRange: [configuredResponse.port, configuredResponse.port],
            scanTimeout: 500,
            retryAttempts: 1,
            editorId: 'test-editor-id',
        });

        await correctManager.connect();
        expect(correctManager.getConnectionState()).toBe('connected');

        await correctManager.disconnect();
        await configuredResponse.close();
    }, 10000); // Increase timeout for this test
});

describe('Multiple Servers and Clients', () => {
    let initServer1: TestServer;
    let initServer2: TestServer;
    let configuredServer1: TestServer;
    let configuredServer2: TestServer;
    let serverResponses: TestServerResponse[] = [];

    beforeEach(async () => {
        // Start multiple servers in different states
        initServer1 = createTestServer({});
        initServer2 = createTestServer({});
        configuredServer1 = createTestServer({
            editorId: 'client-1',
        });
        configuredServer2 = createTestServer({
            editorId: 'client-2',
        });

        const initResponse1 = await initServer1.start();
        const initResponse2 = await initServer2.start();
        const configuredResponse1 = await configuredServer1.start();
        const configuredResponse2 = await configuredServer2.start();

        serverResponses = [initResponse1, initResponse2, configuredResponse1, configuredResponse2];
    });

    afterEach(async () => {
        // Close all servers
        for (const response of serverResponses) {
            await response.close();
        }
    });

    it('should connect multiple clients to init servers', async () => {
        // Create clients that should connect to init servers
        const client1 = createEditorClient({
            portRange: [serverResponses[0].port, serverResponses[1].port], // init servers
            scanTimeout: 1000,
            retryAttempts: 1,
            editorId: 'client-1',
        });

        const client2 = createEditorClient({
            portRange: [serverResponses[0].port, serverResponses[1].port], // init servers
            scanTimeout: 1000,
            retryAttempts: 1,
            editorId: 'client-2',
        });

        // Both clients should connect to init servers (any of them)
        await client1.connect();
        await client2.connect();

        expect(client1.getConnectionState()).toBe('connected');
        expect(client2.getConnectionState()).toBe('connected');

        // Verify they can communicate
        initServer1.onPublish(async (msg) => {
            expect(msg.type).toBe('publish');
            return { status: [{ success: true, filePath: '/test1.jay-html' }] };
        });

        initServer2.onPublish(async (msg) => {
            expect(msg.type).toBe('publish');
            return { status: [{ success: true, filePath: '/test2.jay-html' }] };
        });

        const result1 = await client1.publish({
            type: 'publish',
            pages: [
                {
                    route: '/test1',
                    jayHtml: '<div>Test 1</div>',
                    name: 'test-page-1',
                },
            ] as [
                {
                    route: string;
                    jayHtml: string;
                    name: string;
                },
            ],
        });

        const result2 = await client2.publish({
            type: 'publish',
            pages: [
                {
                    route: '/test2',
                    jayHtml: '<div>Test 2</div>',
                    name: 'test-page-2',
                },
            ] as [
                {
                    route: string;
                    jayHtml: string;
                    name: string;
                },
            ],
        });

        expect(result1.status[0].success).toBe(true);
        expect(result2.status[0].success).toBe(true);

        await client1.disconnect();
        await client2.disconnect();
    });

    it('should connect clients to specific configured servers', async () => {
        // Create clients that should connect to specific configured servers
        const client1 = createEditorClient({
            portRange: [serverResponses[2].port, serverResponses[2].port], // configured server 1
            scanTimeout: 1000,
            retryAttempts: 1,
            editorId: 'client-1',
        });

        const client2 = createEditorClient({
            portRange: [serverResponses[3].port, serverResponses[3].port], // configured server 2
            scanTimeout: 1000,
            retryAttempts: 1,
            editorId: 'client-2',
        });

        // Both clients should connect to their specific configured servers
        await client1.connect();
        await client2.connect();

        expect(client1.getConnectionState()).toBe('connected');
        expect(client2.getConnectionState()).toBe('connected');

        // Verify they communicate with the correct servers
        configuredServer1.onPublish(async (msg) => {
            expect(msg.type).toBe('publish');
            expect(msg.pages[0].name).toBe('client1-page');
            return { status: [{ success: true, filePath: '/client1.jay-html' }] };
        });

        configuredServer2.onPublish(async (msg) => {
            expect(msg.type).toBe('publish');
            expect(msg.pages[0].name).toBe('client2-page');
            return { status: [{ success: true, filePath: '/client2.jay-html' }] };
        });

        const result1 = await client1.publish({
            type: 'publish',
            pages: [
                {
                    route: '/client1',
                    jayHtml: '<div>Client 1</div>',
                    name: 'client1-page',
                },
            ] as [
                {
                    route: string;
                    jayHtml: string;
                    name: string;
                },
            ],
        });

        const result2 = await client2.publish({
            type: 'publish',
            pages: [
                {
                    route: '/client2',
                    jayHtml: '<div>Client 2</div>',
                    name: 'client2-page',
                },
            ] as [
                {
                    route: string;
                    jayHtml: string;
                    name: string;
                },
            ],
        });

        expect(result1.status[0].success).toBe(true);
        expect(result1.status[0].filePath).toBe('/client1.jay-html');
        expect(result2.status[0].success).toBe(true);
        expect(result2.status[0].filePath).toBe('/client2.jay-html');

        await client1.disconnect();
        await client2.disconnect();
    });

    it('should reject connections to wrong configured servers', async () => {
        // Try to connect client-1 to client-2's configured server
        const wrongClient = createEditorClient({
            portRange: [serverResponses[3].port, serverResponses[3].port], // client-2's server
            scanTimeout: 1000,
            retryAttempts: 1,
            editorId: 'client-1', // Wrong ID for this server
        });

        // Should fail to connect
        await expect(wrongClient.connect()).rejects.toThrow('No editor server found');
        expect(wrongClient.getConnectionState()).toBe('error');

        // Try to connect client-2 to client-1's configured server
        const wrongClient2 = createEditorClient({
            portRange: [serverResponses[2].port, serverResponses[2].port], // client-1's server
            scanTimeout: 1000,
            retryAttempts: 1,
            editorId: 'client-2', // Wrong ID for this server
        });

        // Should fail to connect
        await expect(wrongClient2.connect()).rejects.toThrow('No editor server found');
        expect(wrongClient2.getConnectionState()).toBe('error');
    });

    it('should handle mixed init and configured servers in port range', async () => {
        // Create a client that scans a range including both init and configured servers
        const mixedClient = createEditorClient({
            portRange: [serverResponses[0].port, serverResponses[3].port], // All servers
            scanTimeout: 2000,
            retryAttempts: 2,
            editorId: 'client-1',
        });

        // Set up handlers for ALL servers in the port range since the client might connect to any of them
        initServer1.onPublish(async (msg) => {
            expect(msg.type).toBe('publish');
            return { status: [{ success: true, filePath: '/mixed-test.jay-html' }] };
        });

        initServer2.onPublish(async (msg) => {
            expect(msg.type).toBe('publish');
            return { status: [{ success: true, filePath: '/mixed-test.jay-html' }] };
        });

        configuredServer1.onPublish(async (msg) => {
            expect(msg.type).toBe('publish');
            return { status: [{ success: true, filePath: '/mixed-test.jay-html' }] };
        });

        configuredServer2.onPublish(async (msg) => {
            expect(msg.type).toBe('publish');
            return { status: [{ success: true, filePath: '/mixed-test.jay-html' }] };
        });

        // Should connect to the configured server that matches the client ID
        await mixedClient.connect();
        expect(mixedClient.getConnectionState()).toBe('connected');

        const result = await mixedClient.publish({
            type: 'publish',
            pages: [
                {
                    route: '/mixed-test',
                    jayHtml: '<div>Mixed Test</div>',
                    name: 'mixed-test-page',
                },
            ] as [
                {
                    route: string;
                    jayHtml: string;
                    name: string;
                },
            ],
        });

        expect(result.status[0].success).toBe(true);
        expect(result.status[0].filePath).toBe('/mixed-test.jay-html');

        await mixedClient.disconnect();
    });

    it('should handle concurrent connections to multiple servers', async () => {
        // Create multiple clients that should connect to different servers
        const clients = [
            createEditorClient({
                portRange: [serverResponses[0].port, serverResponses[0].port],
                scanTimeout: 1000,
                retryAttempts: 1,
                editorId: 'client-init-1',
            }),
            createEditorClient({
                portRange: [serverResponses[1].port, serverResponses[1].port],
                scanTimeout: 1000,
                retryAttempts: 1,
                editorId: 'client-init-2',
            }),
            createEditorClient({
                portRange: [serverResponses[2].port, serverResponses[2].port],
                scanTimeout: 1000,
                retryAttempts: 1,
                editorId: 'client-1',
            }),
            createEditorClient({
                portRange: [serverResponses[3].port, serverResponses[3].port],
                scanTimeout: 1000,
                retryAttempts: 1,
                editorId: 'client-2',
            }),
        ];

        // Connect all clients concurrently
        await Promise.all(clients.map((client) => client.connect()));

        // Verify all are connected
        for (const client of clients) {
            expect(client.getConnectionState()).toBe('connected');
        }

        // Set up handlers for each server
        initServer1.onPublish(async () => ({
            status: [{ success: true, filePath: '/init1.jay-html' }],
        }));
        initServer2.onPublish(async () => ({
            status: [{ success: true, filePath: '/init2.jay-html' }],
        }));
        configuredServer1.onPublish(async () => ({
            status: [{ success: true, filePath: '/config1.jay-html' }],
        }));
        configuredServer2.onPublish(async () => ({
            status: [{ success: true, filePath: '/config2.jay-html' }],
        }));

        // Send messages from all clients concurrently
        const results = await Promise.all(
            clients.map((client, index) =>
                client.publish({
                    type: 'publish',
                    pages: [
                        {
                            route: `/test-${index}`,
                            jayHtml: `<div>Test ${index}</div>`,
                            name: `test-page-${index}`,
                        },
                    ] as [
                        {
                            route: string;
                            jayHtml: string;
                            name: string;
                        },
                    ],
                }),
            ),
        );

        // Verify all messages were processed
        for (const result of results) {
            expect(result.status[0].success).toBe(true);
        }

        // Disconnect all clients
        await Promise.all(clients.map((client) => client.disconnect()));
    });
}, 30000); // Increase timeout for multiple server tests
