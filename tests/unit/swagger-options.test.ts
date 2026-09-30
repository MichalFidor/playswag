import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server, type RequestListener } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';
import { buildSecureSwaggerParserOptions } from '../../src/openapi/swagger-options.js';

const servers: Server[] = [];
const directories: string[] = [];
async function serve(handler: RequestListener): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing server port');
  return `http://127.0.0.1:${address.port}`;
}
async function localRoot(schema: unknown): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'playswag-secure-ref-'));
  directories.push(directory);
  const root = join(directory, 'root.json');
  await writeFile(root, JSON.stringify({
    openapi: '3.0.0', info: { title: 'Synthetic security fixture', version: '1.0.0' }, paths: {},
    components: { schemas: { Example: schema } },
  }));
  return root;
}
const options = () => buildSecureSwaggerParserOptions({
  allowedSpecHosts: ['127.0.0.1'], allowPrivateHosts: true,
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.closeAllConnections(); server.close(() => resolve());
  })));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('secured Swagger resolver document provenance', () => {
  it.each(['json', 'yaml'])('blocks local root → remote %s → file reference before resolution', async (format) => {
    const root = await localRoot({});
    const secret = join(root, '..', 'synthetic-secret.json');
    await writeFile(secret, '{"type":"string","description":"synthetic-only"}');
    const fileUrl = pathToFileURL(secret).href;
    const base = await serve((_req, res) => {
      res.end(format === 'json' ? JSON.stringify({ $ref: fileUrl }) : `$ref: '${fileUrl}'\n`);
    });
    await writeFile(root, JSON.stringify({
      openapi: '3.0.0', info: { title: 'Synthetic', version: '1' }, paths: {},
      components: { schemas: { Remote: { $ref: `${base}/schema.${format}` } } },
    }));
    await expect(options().resolve.playswagSecureHttp.read({ url: `${base}/schema.${format}` })).rejects.toThrow(/local file references are not allowed/);
    await expect(SwaggerParser.dereference(root, options())).rejects.toThrow(/Error reading file/);
  });

  it('blocks escaped JSON keys and file-backed schema IDs in remote content', async () => {
    const base = await serve((req, res) => {
      res.end(req.url === '/escaped.json'
        ? '{"\\u0024ref":"file:///synthetic-secret.json"}'
        : '{"$id":"file:///synthetic-dir/schema.json","$ref":"other.json"}');
    });
    for (const path of ['escaped.json', 'id.json']) {
      const root = await localRoot({ $ref: `${base}/${path}` });
      await expect(SwaggerParser.dereference(root, options())).rejects.toThrow(/Error reading file/);
    }
  });

  it('blocks a remote reference even when the local target was already loaded', async () => {
    const root = await localRoot({});
    const target = join(root, '..', 'local.json');
    await writeFile(target, '{"type":"string"}');
    const base = await serve((_req, res) => { res.end(JSON.stringify({ $ref: pathToFileURL(target).href })); });
    await writeFile(root, JSON.stringify({
      openapi: '3.0.0', info: { title: 'Synthetic', version: '1' }, paths: {},
      components: { schemas: { Local: { $ref: './local.json' }, Remote: { $ref: `${base}/schema.json` } } },
    }));
    await expect(SwaggerParser.dereference(root, options())).rejects.toThrow(/Error reading file/);
  });

  it('blocks HTTP references that ref-parser converts to filesystem paths', async () => {
    const root = await localRoot({});
    const target = join(root, '..', 'sentinel-secret.json');
    await writeFile(target, '{"type":"string","description":"sentinel-local-read"}');
    const base = await serve((_req, res) => {
      res.end(JSON.stringify({ $ref: `https://aaa.nonexistanturl.com${target}` }));
    });
    await writeFile(root, JSON.stringify({
      openapi: '3.0.0', info: { title: 'Synthetic', version: '1' }, paths: {},
      components: { schemas: { Remote: { $ref: `${base}/schema.json` } } },
    }));
    await expect(SwaggerParser.dereference(root, options())).rejects.toThrow(/Error reading file/);
  });

  it('preserves legitimate local references and relative HTTP references in a mixed tree', async () => {
    const base = await serve((req, res) => {
      res.end(req.url === '/schema.yaml' ? '$ref: ./child.json\n' : '{"type":"integer"}');
    });
    const root = await localRoot({});
    await writeFile(join(root, '..', 'local.json'), '{"type":"string"}');
    await writeFile(root, JSON.stringify({
      openapi: '3.0.0', info: { title: 'Synthetic', version: '1' }, paths: {},
      components: { schemas: { Local: { $ref: './local.json' }, Remote: { $ref: `${base}/schema.yaml` } } },
    }));
    const doc = await SwaggerParser.dereference(root, options());
    expect(doc).toMatchObject({ components: { schemas: { Local: { type: 'string' }, Remote: { type: 'integer' } } } });
  });

  it('keeps file resolution disabled for remote roots', async () => {
    const base = await serve((_req, res) => {
      res.end(JSON.stringify({
        openapi: '3.0.0', info: { title: 'Synthetic', version: '1' }, paths: {},
        components: { schemas: { Secret: { $ref: 'file:///synthetic-secret.json' } } },
      }));
    });
    await expect(SwaggerParser.dereference(`${base}/root.json`, buildSecureSwaggerParserOptions({
      allowedSpecHosts: ['127.0.0.1'], allowPrivateHosts: true, disableFileResolver: true,
    }))).rejects.toThrow(/Error reading file/);
  });
});
