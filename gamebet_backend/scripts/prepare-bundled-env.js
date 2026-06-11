'use strict';

const fs = require('fs');
const path = require('path');

const backendRoot = path.join(__dirname, '..');
const dest = path.join(backendRoot, 'build', 'supabase.env');
const srcEnv = path.join(backendRoot, '.env');
const mode = process.env.GAMEBET_BUNDLE_ENV || 'auto';

function validateSupabaseEnv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const url = text.match(/^SUPABASE_URL=(.+)$/m)?.[1]?.trim();
  const key =
    text.match(/^SUPABASE_KEY=(.+)$/m)?.[1]?.trim() ||
    text.match(/^SUPABASE_SERVICE_KEY=(.+)$/m)?.[1]?.trim();
  if (!url || !key || url.includes('YOUR_PROJECT') || key.includes('your_')) {
    console.error('[prepare-bundled-env] invalid or placeholder Supabase config in', filePath);
    process.exit(1);
  }
}

fs.mkdirSync(path.dirname(dest), { recursive: true });

if (mode === 'skip') {
  console.log('[prepare-bundled-env] skip');
  process.exit(0);
}

const mustBundle = mode === 'required' || mode === '1';

if (mustBundle) {
  if (!fs.existsSync(srcEnv)) {
    console.error('[prepare-bundled-env] release build requires', srcEnv);
    process.exit(1);
  }
  fs.copyFileSync(srcEnv, dest);
  validateSupabaseEnv(dest);
  console.log('[prepare-bundled-env] bundled Supabase into installer');
} else if (fs.existsSync(srcEnv)) {
  fs.copyFileSync(srcEnv, dest);
  console.log('[prepare-bundled-env] bundled Supabase from .env');
} else if (fs.existsSync(dest)) {
  console.log('[prepare-bundled-env] keep existing build/supabase.env');
} else {
  fs.writeFileSync(dest, 'SUPABASE_URL=\nSUPABASE_KEY=\n', 'utf8');
  console.log('[prepare-bundled-env] no .env — empty stub (local dev only)');
}
