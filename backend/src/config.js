import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const ROOT = resolve(__dirname, '..');

/**
 * Runtime configuration. Everything can be overridden by environment variables,
 * which is used by both Docker and the automated test-suite.
 */
export function loadConfig(env = process.env) {
  return {
    host: env.HOST || '0.0.0.0',
    port: Number(env.PORT || 8080),
    dataDir: env.DATA_DIR
      ? resolve(env.DATA_DIR)
      : resolve(ROOT, 'data'),
    // Directory containing the built React assets (Vite output).
    staticDir: env.STATIC_DIR
      ? resolve(env.STATIC_DIR)
      : resolve(ROOT, '..', 'frontend', 'dist'),
    // How often the simulator produces a new point for every enabled source (ms).
    tickIntervalMs: Number(env.TICK_INTERVAL_MS || 1000),
    // Rolling retention window for archived points (default 24h).
    retentionMs: Number(env.RETENTION_MS || 24 * 60 * 60 * 1000),
    // Compaction cadence for the on-disk per-series logs (ms).
    compactionIntervalMs: Number(env.COMPACTION_INTERVAL_MS || 60_000),
    // Demo fault injection: occasionally flip a healthy source to error.
    autoFaults: env.AUTO_FAULTS !== 'false'
  };
}
