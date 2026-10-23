/** @filedesc Tests for Assist transport abstraction (InProcess, PostMessage, HTTP). */

import { beforeAll, describe, expect, it } from 'vitest';
import {
  InProcessTransport,
  PostMessageTransport,
  HttpTransport,
  createHttpServerHandler,
  generateCallId,
} from '../src/transport/index.js';
import { createAssistProvider } from '../src/provider.js';
import { createEngine, ensureEngine } from './helpers.js';

describe('Assist Transports (fs-krx9 / M14)', () => {
  beforeAll(async () => {
    await ensureEngine();
  });

  it('generateCallId generates unique RFC4122-compatible strings', () => {
    const id1 = generateCallId();
    const id2 = generateCallId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^[0-9a-f-]{36}$/i);
  });

  describe('InProcessTransport', () => {
    it('registers provider and executes tool invocation round-trip', async () => {
      const engine = createEngine();
      const provider = createAssistProvider({ engine });
      const transport = new InProcessTransport(provider);

      expect(transport.name).toBe('in-process');

      const tools = await transport.listTools();
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.some((t) => t.name === 'formspec.form.describe')).toBe(true);

      const result = await transport.invoke('formspec.form.describe');
      expect(result.isError).toBeFalsy();
      expect(result.content.length).toBe(1);
      const data = JSON.parse(result.content[0].text);
      expect(data.title).toBeDefined();
    });

    it('throws error when invoking without registered provider', async () => {
      const transport = new InProcessTransport();
      await expect(transport.invoke('formspec.form.describe')).rejects.toThrow(
        /no AssistProvider registered/
      );
    });
  });

  describe('PostMessageTransport', () => {
    it('correlates request and response over bidirectional message endpoints', async () => {
      const engine = createEngine();
      const provider = createAssistProvider({ engine });

      type Listener = (event: { data: unknown }) => void;
      const clientListeners: Listener[] = [];
      const serverListeners: Listener[] = [];

      const clientEndpoint = {
        postMessage: (data: unknown) => {
          setTimeout(() => {
            for (const l of serverListeners) l({ data });
          }, 0);
        },
        addEventListener: (_type: string, l: Listener) => clientListeners.push(l),
        removeEventListener: (_type: string, l: Listener) => {
          const idx = clientListeners.indexOf(l);
          if (idx !== -1) clientListeners.splice(idx, 1);
        },
      };

      const serverEndpoint = {
        postMessage: (data: unknown) => {
          setTimeout(() => {
            for (const l of clientListeners) l({ data });
          }, 0);
        },
        addEventListener: (_type: string, l: Listener) => serverListeners.push(l),
        removeEventListener: (_type: string, l: Listener) => {
          const idx = serverListeners.indexOf(l);
          if (idx !== -1) serverListeners.splice(idx, 1);
        },
      };

      // Server side
      const serverTransport = new PostMessageTransport({ endpoint: serverEndpoint });
      serverTransport.register(provider);

      // Client side
      const clientTransport = new PostMessageTransport({ endpoint: clientEndpoint });

      const result = await clientTransport.invoke('formspec.form.describe');
      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data.title).toBeDefined();

      serverTransport.unregister();
      clientTransport.unregister();
    });
  });

  describe('HttpTransport and createHttpServerHandler', () => {
    it('handles GET /formspec/tools and POST /formspec/tools/{name}', async () => {
      const engine = createEngine();
      const provider = createAssistProvider({ engine });
      const handler = createHttpServerHandler(provider);

      // Simulate GET /formspec/tools
      let getStatusCode = 0;
      let getHeaders: Record<string, string> = {};
      let getResponseBody: unknown = null;

      const getReq = { method: 'GET', url: 'http://localhost/formspec/tools' };
      const getRes = {
        status: (code: number) => {
          getStatusCode = code;
          return getRes;
        },
        setHeader: (k: string, v: string) => {
          getHeaders[k] = v;
          return getRes;
        },
        json: (data: unknown) => {
          getResponseBody = data;
        },
        send: (text: string) => {
          getResponseBody = text;
        },
      };

      await handler(getReq, getRes);
      expect(getStatusCode).toBe(200);
      expect(getHeaders['Content-Type']).toBe('application/json');
      const getJson = getResponseBody as { tools: Array<{ name: string }> };
      expect(Array.isArray(getJson.tools)).toBe(true);
      expect(getJson.tools.some((t) => t.name === 'formspec.form.describe')).toBe(true);

      // Simulate POST /formspec/tools/formspec.form.describe (with dot in name preserved!)
      let postStatusCode = 0;
      let postResponseBody: unknown = null;
      const postReq = {
        method: 'POST',
        url: 'http://localhost/formspec/tools/formspec.form.describe',
        body: {},
      };
      const postRes = {
        status: (code: number) => {
          postStatusCode = code;
          return postRes;
        },
        setHeader: () => postRes,
        json: (data: unknown) => {
          postResponseBody = data;
        },
        send: () => {},
      };

      await handler(postReq, postRes);
      expect(postStatusCode).toBe(200);
      const postResult = postResponseBody as { isError?: boolean; content: Array<{ text: string }> };
      expect(postResult.isError).toBeFalsy();
      expect(JSON.parse(postResult.content[0].text).title).toBeDefined();

      // Test client HttpTransport with mock fetch
      const mockFetch: typeof fetch = async (input, init) => {
        const urlStr = String(input);
        let reqStatusCode = 200;
        let reqBody: unknown = null;

        const req = {
          method: init?.method || 'GET',
          url: urlStr,
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        };
        const res = {
          status: (c: number) => {
            reqStatusCode = c;
            return res;
          },
          setHeader: () => res,
          json: (d: unknown) => {
            reqBody = d;
          },
          send: () => {},
        };

        await handler(req, res);
        return new Response(JSON.stringify(reqBody), {
          status: reqStatusCode,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const client = new HttpTransport({
        baseUrl: 'http://localhost',
        fetchFn: mockFetch,
      });

      const clientTools = await client.listTools();
      expect(clientTools.length).toBeGreaterThan(0);

      const clientResult = await client.invoke('formspec.form.describe');
      expect(clientResult.isError).toBeFalsy();
      expect(JSON.parse(clientResult.content[0].text).title).toBeDefined();
    });
  });
});
