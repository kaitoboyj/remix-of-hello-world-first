// Central RPC endpoint configuration.
// Primary providers are QuickNode / Covalent. Alchemy is configured as an
// automatic backup so the site keeps working when the primary APIs fail.

import { Connection } from '@solana/web3.js';
import type { Commitment, ConnectionConfig } from '@solana/web3.js';

export const ALCHEMY_KEY = '4ktChsUHziUE8O7iKgSBY';

// Covalent (GoldRush) API keys — first is primary, the rest are automatic backups.
export const COVALENT_API_KEY = 'cqt_rQbVJY3vD7GMV9wF4RM8R36vYHRQ';
export const COVALENT_API_KEY_BACKUP = 'cqt_rQbVJY3vD7GMV9wF4RM8R36vYHRQ';
export const COVALENT_API_KEYS: readonly string[] = [
  COVALENT_API_KEY,
  COVALENT_API_KEY_BACKUP,
];

/**
 * Fetch a Covalent URL built from an API key, trying every configured key in
 * order until one returns usable JSON. Returns null when all keys fail.
 */
export async function covalentFetch<T = any>(buildUrl: (key: string) => string): Promise<T | null> {
  for (const key of COVALENT_API_KEYS) {
    if (!key) continue;
    try {
      const res = await fetch(buildUrl(key));
      if (!res.ok) continue;
      const data = await res.json();
      if (data?.error) continue;
      return data as T;
    } catch {
      // try next key
    }
  }
  return null;
}

// -----------------------------
// Solana endpoints (with failover)
// -----------------------------
export const SOLANA_QUICKNODE_RPC =
  'https://virulent-hidden-crater.solana-mainnet.quiknode.pro/577be1751b4655c54650004916c5cdec502d3f5f/';
export const SOLANA_QUICKNODE_WSS =
  'wss://virulent-hidden-crater.solana-mainnet.quiknode.pro/577be1751b4655c54650004916c5cdec502d3f5f/';

// Backup QuickNode Solana endpoint
export const SOLANA_QUICKNODE_RPC_BACKUP =
  'https://weathered-light-model.solana-mainnet.quiknode.pro/011b0a292145c53896e52bbbb68b39f697b0599b';
export const SOLANA_QUICKNODE_WSS_BACKUP =
  'wss://weathered-light-model.solana-mainnet.quiknode.pro/011b0a292145c53896e52bbbb68b39f697b0599b';

export const SOLANA_ALCHEMY_RPC = `https://solana-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;

// Ordered list: primary first, backups after. All failover helpers iterate this
// array so callers automatically fall through when the primary is down.
export const SOLANA_RPCS: readonly string[] = [
  SOLANA_QUICKNODE_RPC,
  SOLANA_QUICKNODE_RPC_BACKUP,
  SOLANA_ALCHEMY_RPC,
];

export const SOLANA_WSS_ENDPOINTS: readonly string[] = [
  SOLANA_QUICKNODE_WSS,
  SOLANA_QUICKNODE_WSS_BACKUP,
];

export const SOLANA_PRIMARY_RPC = SOLANA_RPCS[0];

// -----------------------------
// EVM endpoints (with failover)
// -----------------------------
export const EVM_QUICKNODE_RPCS: Record<number, string> = {
  1: 'https://serene-greatest-putty.quiknode.pro/2d2b50b444a5e698af652819520cabba1534ab68',
  56: 'https://serene-greatest-putty.bsc.quiknode.pro/2d2b50b444a5e698af652819520cabba1534ab68',
  137: 'https://serene-greatest-putty.matic.quiknode.pro/2d2b50b444a5e698af652819520cabba1534ab68',
  8453: 'https://serene-greatest-putty.base-mainnet.quiknode.pro/2d2b50b444a5e698af652819520cabba1534ab68',
};

// Backup QuickNode EVM endpoints (used when the primary QuickNode fails)
export const EVM_QUICKNODE_RPCS_BACKUP: Record<number, string> = {
  1: 'https://weathered-light-model.ethereum-mainnet.quiknode.pro/011b0a292145c53896e52bbbb68b39f697b0599b',
  56: 'https://weathered-light-model.bsc.quiknode.pro/011b0a292145c53896e52bbbb68b39f697b0599b',
  137: 'https://weathered-light-model.matic.quiknode.pro/011b0a292145c53896e52bbbb68b39f697b0599b',
  8453: 'https://weathered-light-model.base-mainnet.quiknode.pro/011b0a292145c53896e52bbbb68b39f697b0599b',
};

export const EVM_QUICKNODE_WSS_BACKUP: Record<number, string> = {
  1: 'wss://weathered-light-model.ethereum-mainnet.quiknode.pro/011b0a292145c53896e52bbbb68b39f697b0599b',
  56: 'wss://weathered-light-model.bsc.quiknode.pro/011b0a292145c53896e52bbbb68b39f697b0599b',
  137: 'wss://weathered-light-model.matic.quiknode.pro/011b0a292145c53896e52bbbb68b39f697b0599b',
  8453: 'wss://weathered-light-model.base-mainnet.quiknode.pro/011b0a292145c53896e52bbbb68b39f697b0599b',
};

export const EVM_ALCHEMY_RPCS: Record<number, string> = {
  1: `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  56: `https://bnb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  137: `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  8453: `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
};

export const EVM_ALCHEMY_WSS: Record<number, string> = {
  1: `wss://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  56: `wss://bnb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  137: `wss://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  8453: `wss://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
};

export function getEvmRpcs(chainId: number): string[] {
  return [
    EVM_QUICKNODE_RPCS[chainId],
    EVM_QUICKNODE_RPCS_BACKUP[chainId],
    EVM_ALCHEMY_RPCS[chainId],
  ].filter(Boolean) as string[];
}

export function getEvmWss(chainId: number): string[] {
  return [EVM_QUICKNODE_WSS_BACKUP[chainId], EVM_ALCHEMY_WSS[chainId]].filter(Boolean) as string[];
}


// -----------------------------
// Covalent chain names
// -----------------------------
export const COVALENT_CHAIN_NAMES: Record<number, string> = {
  1: 'eth-mainnet',
  56: 'bsc-mainnet',
  137: 'matic-mainnet',
  8453: 'base-mainnet',
};

// -----------------------------
// Failover helpers
// -----------------------------

/** Fire a single JSON-RPC request against Solana, falling through backups. */
export async function solanaRpc<T = any>(method: string, params: unknown[]): Promise<T> {
  let lastErr: unknown;
  for (const url of SOLANA_RPCS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error?.message || 'RPC error');
      return data.result as T;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('All Solana RPC endpoints failed');
}

/** Batched JSON-RPC against Solana, falling through backups on network failure. */
export async function solanaRpcBatch<T = any>(payload: any[]): Promise<T[]> {
  let lastErr: unknown;
  for (const url of SOLANA_RPCS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T[];
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('All Solana RPC endpoints failed');
}

/** Fire an EVM JSON-RPC request for a chain, falling through backups. */
export async function evmRpc<T = any>(chainId: number, method: string, params: unknown[]): Promise<T> {
  const urls = getEvmRpcs(chainId);
  if (urls.length === 0) throw new Error(`No RPC configured for chain ${chainId}`);
  let lastErr: unknown;
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error?.message || 'RPC error');
      return data.result as T;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`All RPC endpoints failed for chain ${chainId}`);
}

/**
 * Run a callback against a Solana Connection, retrying on the next configured
 * endpoint if the primary throws.
 */
export async function withSolanaConnection<T>(
  fn: (connection: Connection) => Promise<T>,
  config: Commitment | ConnectionConfig = 'confirmed',
): Promise<T> {
  let lastErr: unknown;
  for (const url of SOLANA_RPCS) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const connection = new Connection(url, config as any);
      return await fn(connection);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('All Solana RPC endpoints failed');
}
