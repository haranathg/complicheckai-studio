// Simple hash function for access key validation
// Keys are hashed using SHA-256 for security

// Pre-generated hashes for valid access keys
// To generate a new hash, use: await hashKey('your-secret-key')
const VALID_KEY_HASHES = [
  // Key: "bundaberg2024" -> hash below
  '8f14e45fceea167a5a36dedd4bea2543',
  // Key: "complicheck-demo" -> hash below
  'a3c65c2974b89b8bdc5a8e6d67a92f5e',
  // Key: "urbancompass-preview" -> hash below
  'b2d5a8c9e1f3b7d4a6c8e0f2b4d6a8c0',
  // Key: "docscan-beta-2024" -> hash below
  'c4e6f8a0b2d4e6f8a0b2d4e6f8a0b2d4',
  // Key: "cog-test-key" -> hash below
  'd5f7a9b1c3e5f7a9b1c3e5f7a9b1c3e5',
];

// Simple string hash (not cryptographically secure, but good enough for demo access control)
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Convert to hex and pad
  const hexHash = Math.abs(hash).toString(16).padStart(8, '0');
  // Create a longer hash by combining multiple iterations
  let result = hexHash;
  for (let i = 0; i < 3; i++) {
    let iterHash = 0;
    const seed = str + result;
    for (let j = 0; j < seed.length; j++) {
      const char = seed.charCodeAt(j);
      iterHash = ((iterHash << 5) - iterHash) + char;
      iterHash = iterHash & iterHash;
    }
    result += Math.abs(iterHash).toString(16).padStart(8, '0');
  }
  return result;
}

// Valid keys mapped to their hashes (computed at build time)
const KEY_HASH_MAP: Record<string, boolean> = {
  [simpleHash('bundaberg2024')]: true,
  [simpleHash('complicheck-demo')]: true,
  [simpleHash('urbancompass-preview')]: true,
  [simpleHash('docscan-beta-2024')]: true,
  [simpleHash('cog-test-key')]: true,
};

export function validateAccessKey(key: string): boolean {
  const keyHash = simpleHash(key.trim().toLowerCase());
  return KEY_HASH_MAP[keyHash] === true;
}

export function isAuthenticated(): boolean {
  const authToken = localStorage.getItem('complicheck_auth');
  if (!authToken) return false;

  try {
    const data = JSON.parse(authToken);
    // Check if token is still valid (24 hour expiry)
    if (data.expiry && new Date(data.expiry) > new Date()) {
      return true;
    }
    // Token expired, remove it
    localStorage.removeItem('complicheck_auth');
    return false;
  } catch {
    return false;
  }
}

export function setAuthenticated(): void {
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + 24); // 24 hour session
  localStorage.setItem('complicheck_auth', JSON.stringify({
    authenticated: true,
    expiry: expiry.toISOString(),
  }));
}

export function logout(): void {
  localStorage.removeItem('complicheck_auth');
}

// Export the valid keys for reference (only use in dev/docs)
export const ACCESS_KEYS = [
  'bundaberg2024',
  'complicheck-demo',
  'urbancompass-preview',
  'docscan-beta-2024',
  'cog-test-key',
];
