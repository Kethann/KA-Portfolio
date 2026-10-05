// Startup environment validation. Call validateEnv() before the server begins accepting requests.
// In production (KA_ENV=production): throws immediately if critical secrets are missing or
// left at their insecure local-development fallback values so a misconfigured deployment is
// caught at boot rather than silently serving with weak keys.
// In development: logs a warning only — never blocks a local dev restart.
import { env } from './env.js';

const DEV_FALLBACKS = {
  DOWNLOAD_TOKEN_SECRET: 'local-development-only',
  ADMIN_ENCRYPTION_KEY: 'local-development-only-key',
};

export function validateEnv() {
  const isProd = env('KA_ENV') === 'production';
  const warnings = [];

  for (const [key, fallback] of Object.entries(DEV_FALLBACKS)) {
    const val = env(key, '');
    if (!val) {
      warnings.push(`${key} is not set`);
    } else if (val === fallback) {
      warnings.push(`${key} is still set to the local-development fallback value — change it before going live`);
    }
  }

  if (warnings.length === 0) return;   // all good

  if (isProd) {
    // Hard failure in production: a misconfigured secret collapses security.
    throw new Error(
      `[ka] Production startup blocked — insecure environment configuration:\n` +
      warnings.map(w => `  • ${w}`).join('\n') +
      `\nSet strong, unique values in your Cloudflare dashboard (Workers & Pages > Settings > Variables and Secrets).`
    );
  } else {
    // Soft warning in development — never block a local restart.
    for (const w of warnings) {
      console.warn(`[ka] Dev env warning: ${w} (safe for local development only)`);
    }
  }
}

