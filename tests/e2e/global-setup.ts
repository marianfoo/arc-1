/**
 * E2E global setup — runs once before all test files.
 *
 * Validates the MCP server is reachable, reports its identity (version, PID,
 * startedAt), and catches zombie processes early — before any test runs.
 *
 * If the health check fails, all tests are skipped with a clear error.
 */

export async function setup(): Promise<void> {
  const mcpUrl = process.env.E2E_MCP_URL ?? 'http://localhost:3000/mcp';
  const healthUrl = mcpUrl.replace(/\/mcp$/, '/health');

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  E2E Pre-flight: Server Identity Check                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  try {
    const resp = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} from ${healthUrl}`);
    }
    const health = (await resp.json()) as {
      status: string;
      version: string;
      startedAt?: string;
      pid?: number;
    };

    console.log(`  Server URL:   ${mcpUrl}`);
    console.log(`  Status:       ${health.status}`);
    console.log(`  Version:      ${health.version}`);
    console.log(`  PID:          ${health.pid ?? 'unknown (upgrade server for PID tracking)'}`);
    console.log(`  Started at:   ${health.startedAt ?? 'unknown'}`);

    // Warn if the server has been running for too long (possible zombie)
    if (health.startedAt) {
      const ageMs = Date.now() - new Date(health.startedAt).getTime();
      const ageMin = Math.round(ageMs / 60_000);
      console.log(`  Server age:   ${ageMin} minutes`);
      if (ageMin > 10) {
        console.log('');
        console.log('  ⚠ WARNING: Server has been running for >10 minutes.');
        console.log('  If this is unexpected, a zombie process may be serving stale code.');
        console.log('  Run: npm run test:e2e:stop && npm run test:e2e:deploy');
      }
    }

    console.log('');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('');
    console.error(`  ✗ Health check FAILED: ${msg}`);
    console.error('');
    console.error('  The MCP server is not reachable. Tests cannot run.');
    console.error('  Deploy the server first: npm run test:e2e:deploy');
    console.error('');
    throw new Error(`E2E pre-flight failed: MCP server not reachable at ${healthUrl} — ${msg}`);
  }
}
