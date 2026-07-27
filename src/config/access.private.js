// Legacy local access hashes. Keep plaintext access codes out of source comments.
const LOCAL_BETA_HASHES = [
  "5979c5c7d81a9f074d081f215082664d4c82b9a7cbb0299f1c71286c12fbbf60", // "noria.beta.2026"
  "3a4f6cfcc9ccb186bdf3b5e40e34c264a7ccf7e6e583c48545e8557ee077229a"  // "acceso.creadora"
];

// Helper to calculate SHA-256 hash in browser
export async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Check if a code matches any of the registered hashes
export async function validateBetaCode(code) {
  const cleanCode = code.trim().toLowerCase();

  // Allow plain-text code comparison in local development
  if (import.meta.env.DEV) {
    if (cleanCode === 'noria.beta.2026' || cleanCode === 'acceso.creadora') {
      return true;
    }
  }

  const hashedInput = await sha256(code);
  // 1. Check local development hashes
  if (LOCAL_BETA_HASHES.includes(hashedInput)) {
    return true;
  }

  // 2. Check environment variables (Vercel production build-time codes)
  const envCodes = import.meta.env.VITE_BETA_CODES;
  if (envCodes) {
    const envHashesList = envCodes.split(',').map(h => h.trim().toLowerCase());
    if (envHashesList.includes(hashedInput)) {
      return true;
    }
  }

  return false;
}
