import { createJayContext } from 'jay-runtime';
import { IJayEndpoint, IJayPort } from '../comm-channel/comm-channel';
import { FunctionsRepository } from './function-repository-types';

export interface SecureComponentContext {
    compId: number;
    endpoint: IJayEndpoint;
    port: IJayPort;
    funcRepository?: FunctionsRepository;
}
export const SECURE_COMPONENT_MARKER = createJayContext<SecureComponentContext>();
