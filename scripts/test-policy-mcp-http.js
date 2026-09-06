import './test-helpers/install-policy-evidence-fixture.js';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import policy from '../api/policy-mcp.js';
import refund from '../api/mcp.js';
import cancel from '../api/cancel-mcp.js';
import returns from '../api/return-mcp.js';
import trial from '../api/trial-mcp.js';
const handlers = { '/api/policy-mcp': policy, '/api/mcp': refund, '/api/cancel-mcp': cancel,
  '/api/return-mcp': returns, '/api/trial-mcp': trial };
const server = createServer((req, res) => {
  const handler = handlers[new URL(req.url, 'http://localhost').pathname];
  if (!handler) { res.statusCode = 404; res.end(); return; }
  Promise.resolve(handler(req, res)).catch(() => { res.statusCode = 500; res.end(); });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const { stdout } = await promisify(execFile)('bash', ['scripts/mcp-check.sh'], {
    env: { ...process.env, BASE_URL: `http://127.0.0.1:${server.address().port}` }, timeout: 30000,
  });
  console.log(stdout);
} finally { await new Promise(resolve => server.close(resolve)); }
