import { describe, it, expect } from 'vitest';
import type http from 'node:http';
import { pipeFetchResponse } from '../lib/serve/main-server';

function createMockServerResponse() {
    const written: { status?: number; headers?: http.OutgoingHttpHeaders; ended: boolean } = {
        ended: false,
    };
    const res = {
        writeHead(status: number, headers: http.OutgoingHttpHeaders) {
            written.status = status;
            written.headers = headers;
            return res;
        },
        write() {
            return true;
        },
        end() {
            written.ended = true;
        },
    };
    return { res: res as unknown as http.ServerResponse, written };
}

describe('pipeFetchResponse', () => {
    /**
     * Bug: multiple Set-Cookie headers are collapsed into one.
     * Found in: design-log/230 - request cookies for server actions.md (test 20).
     * Expected: every Set-Cookie value reaches the Node response.
     * Actual: headers.forEach copies into a Record, so only the last value survives.
     */
    it('should forward every Set-Cookie header', async () => {
        const headers = new Headers({ 'content-type': 'application/json' });
        headers.append('set-cookie', 'a=1; Path=/');
        headers.append('set-cookie', 'b=2; Path=/');
        const { res, written } = createMockServerResponse();

        await pipeFetchResponse(new Response(null, { status: 200, headers }), res);

        expect(written).toEqual({
            status: 200,
            headers: {
                'content-type': 'application/json',
                'set-cookie': ['a=1; Path=/', 'b=2; Path=/'],
            },
            ended: true,
        });
    });
});
