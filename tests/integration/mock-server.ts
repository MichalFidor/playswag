import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';

/**
 * Minimal HTTP server that simulates the sample OpenAPI spec.
 * Used only in integration tests.
 */

const users: Array<{ id: string; name: string; email: string; role?: string }> = [
  { id: '1', name: 'Alice', email: 'alice@example.com', role: 'admin' },
  { id: '2', name: 'Bob', email: 'bob@example.com' },
];

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function createMockServer(port = 3456) {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    const pathname = url.pathname;
    const method = req.method?.toUpperCase() ?? 'GET';

    // GET /api/health
    if (method === 'GET' && pathname === '/api/health') {
      return json(res, 200, { status: 'ok' });
    }

    // GET /api/users
    if (method === 'GET' && pathname === '/api/users') {
      const limit = url.searchParams.get('limit');
      const result = limit ? users.slice(0, Number(limit)) : users;
      return json(res, 200, result);
    }

    // POST /api/users
    if (method === 'POST' && pathname === '/api/users') {
      const body = await readBody(req);
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(body) as Record<string, unknown>;
      } catch {
        return json(res, 400, { error: 'Invalid JSON' });
      }
      if (!parsed['name'] || !parsed['email']) {
        return json(res, 422, { error: 'name and email are required' });
      }
      const newUser = {
        id: String(users.length + 1),
        name: String(parsed['name']),
        email: String(parsed['email']),
        role: typeof parsed['role'] === 'string' ? parsed['role'] : undefined,
      };
      users.push(newUser);
      return json(res, 201, newUser);
    }

    // GET /api/users/:id
    const getUserMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
    if (method === 'GET' && getUserMatch) {
      const user = users.find((u) => u.id === getUserMatch[1]);
      if (!user) return json(res, 404, { error: 'Not found' });
      return json(res, 200, user);
    }

    // DELETE /api/users/:id
    const deleteUserMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
    if (method === 'DELETE' && deleteUserMatch) {
      const idx = users.findIndex((u) => u.id === deleteUserMatch[1]);
      if (idx === -1) return json(res, 404, { error: 'Not found' });
      users.splice(idx, 1);
      res.writeHead(204);
      return res.end();
    }

    json(res, 404, { error: 'Route not found' });
  });

  return new Promise<{ server: ReturnType<typeof createServer>; baseURL: string }>(
    (resolve, reject) => {
      server.listen(port, () => {
        resolve({ server, baseURL: `http://localhost:${port}` });
      });
      server.on('error', reject);
    }
  );
}
