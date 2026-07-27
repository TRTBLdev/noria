// Default fallback hashes (SHA-256) if VITE_BETA_CODES is not set in environment
const DEFAULT_BETA_HASHES = [
  "5979c5c7d81a9f074d081f215082664d4c82b9a7cbb0299f1c71286c12fbbf60",
  "3a4f6cfcc9ccb186bdf3b5e40e34c264a7ccf7e6e583c48545e8557ee077229a"
];

// Helper to calculate SHA-256 hash in browser
export async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Check if a code matches any of the registered hashes or plain text codes
export async function validateBetaCode(code) {
  if (!code) return false;
  const cleanCode = code.trim().toLowerCase();
  const hashedInput = await sha256(code);

  // 1. Check environment variables (Vercel Environment Variables or local .env.local)
  const envCodes = import.meta.env.VITE_BETA_CODES;
  if (envCodes) {
    const envList = envCodes.split(',').map(h => h.trim().toLowerCase());
    // Accepts either plain text code or SHA-256 hash in VITE_BETA_CODES
    if (envList.includes(cleanCode) || envList.includes(hashedInput)) {
      return true;
    }
  }

  // 2. Default fallback hashes and codes (if VITE_BETA_CODES is not defined in environment)
  if (cleanCode === 'noria.beta.2026' || cleanCode === 'acceso.creadora' || DEFAULT_BETA_HASHES.includes(hashedInput)) {
    return true;
  }

  return false;
}
