/**
 * Client-side initialization utilities for Jay Stack.
 *
 * With the makeJayInit pattern, client initialization is handled automatically:
 * 1. Server: makeJayInit().withServer() returns data to pass to client
 * 2. Server: Data embedded as JSON in page HTML
 * 3. Client: makeJayInit().withClient() receives typed data
 * 4. Client: Component tree is mounted with contexts available
 *
 * Use registerGlobalContext from @jay-framework/runtime to register global contexts.
 */

// This file is kept for potential future client-side utilities.
// Currently, all client init functionality is handled by makeJayInit().
