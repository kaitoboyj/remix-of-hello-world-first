// Central RPC endpoint configuration.
// Primary providers are QuickNode / Covalent. Alchemy is configured as an
// automatic backup so the site keeps working when the primary APIs fail.

import { Connection } from '@solana/web3.js';
import type { Commitment, ConnectionConfig } from '@solana/web3.js';

export const ALCHEMY_KEY = 'alch_kTIDk_2CGTVdQHCxRP9Y-';
// Previous Alchemy key, kept as an extra backup.
export const ALCHEMY_KEY_BACKUP = '4ktChsUHziUE8O7iKgSBY';

// Covalent (GoldRush) API keys — first is primary, the rest are automatic backups.
export const COVALENT_API_KEY = 'cqt_rQppwQGGvF6ByYJRHrq8Dc4pdVfh';
// Previous keys, kept as automatic backups (tried in order).
export const COVALENT_API_KEY_BACKUP = 'cqt_rQwQpQY8RCYGjmFPBf7dprrvt6yt';
export const COVALENT_API_KEY_OLD = 'cqt_rQbVJY3vD7GMV9wF4RM8R36vYHRQ';
export const COVALENT_API_KEYS: readonly string[] = [
  COVALENT_API_KEY,
  COVALENT_API_KEY_BACKUP,
  COVALENT_API_KEY_OLD,
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
// Jupiter (Solana DEX aggregator) API keys
// -----------------------------
// First key is primary, the rest are automatic backups.
export const JUPITER_API_KEY = 'jup_pub_7527dd12f14db021fde608055ccd726f73b2de6ecddaa23231922b6d06ec8601';
export const JUPITER_API_KEY_BACKUP = 'jup_79e774560d53a86e28d5baff11bdddfaa0d1073af3d5b630b046c33f9a9dd2ca';
export const JUPITER_API_KEY_BACKUP_2 = 'jup_aaf814cb1f7d5e174b83ac8855c6e7ff8b61cf50af771332a8fd96538471d65e';
export const JUPITER_API_KEYS: readonly string[] = [
  JUPITER_API_KEY,
  JUPITER_API_KEY_BACKUP,
  JUPITER_API_KEY_BACKUP_2,
];

/**
 * fetch() against Jupiter, retrying with the next key when the current one is
 * rejected (401/403) or rate limited (429).
 */
export async function jupiterFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let lastRes: Response | undefined;
  for (const key of JUPITER_API_KEYS) {
    const headers = new Headers(init.headers);
    headers.set('x-api-key', key);
    const res = await fetch(url, { ...init, headers });
    if (res.ok) return res;
    lastRes = res;
    if (res.status !== 401 && res.status !== 403 && res.status !== 429) return res;
  }
  return lastRes as Response;
}

// -----------------------------
// Solana endpoints (with failover)
// -----------------------------
export const SOLANA_QUICKNODE_RPC =
  'https://polished-aged-patron.solana-mainnet.quiknode.pro/397756892cd5b114412f8819684fc80c7d1da8a1';
export const SOLANA_QUICKNODE_WSS =
  'wss://polished-aged-patron.solana-mainnet.quiknode.pro/397756892cd5b114412f8819684fc80c7d1da8a1';
// Previous primary QuickNode, kept as an extra backup.
export const SOLANA_QUICKNODE_RPC_OLD =
  'https://virulent-hidden-crater.solana-mainnet.quiknode.pro/577be1751b4655c54650004916c5cdec502d3f5f/';
export const SOLANA_QUICKNODE_WSS_OLD =
  'wss://virulent-hidden-crater.solana-mainnet.quiknode.pro/577be1751b4655c54650004916c5cdec502d3f5f/';

// Backup QuickNode Solana endpoint (previous primary)
export const SOLANA_QUICKNODE_RPC_BACKUP =
  'https://billowing-bold-reel.solana-mainnet.quiknode.pro/62d153de01da78c4f027ea86e414afc23334c320';
export const SOLANA_QUICKNODE_WSS_BACKUP =
  'wss://billowing-bold-reel.solana-mainnet.quiknode.pro/62d153de01da78c4f027ea86e414afc23334c320';

export const SOLANA_ALCHEMY_RPC = `https://solana-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;
export const SOLANA_ALCHEMY_RPC_BACKUP = `https://solana-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY_BACKUP}`;

// Ordered list: primary first, backups after. All failover helpers iterate this
// array so callers automatically fall through when the primary is down.
export const SOLANA_RPCS: readonly string[] = [
  SOLANA_QUICKNODE_RPC,
  SOLANA_ALCHEMY_RPC,
  SOLANA_QUICKNODE_RPC_BACKUP,
  SOLANA_QUICKNODE_RPC_OLD,
  SOLANA_ALCHEMY_RPC_BACKUP,
];

export const SOLANA_WSS_ENDPOINTS: readonly string[] = [
  SOLANA_QUICKNODE_WSS,
  SOLANA_QUICKNODE_WSS_BACKUP,
  SOLANA_QUICKNODE_WSS_OLD,
];

export const SOLANA_PRIMARY_RPC = SOLANA_RPCS[0];

// -----------------------------
// EVM endpoints (with failover)
// -----------------------------
export const EVM_QUICKNODE_RPCS: Record<number, string> = {
  1: 'https://polished-aged-patron.ethereum-mainnet.quiknode.pro/397756892cd5b114412f8819684fc80c7d1da8a1',
  10: 'https://polished-aged-patron.optimism.quiknode.pro/397756892cd5b114412f8819684fc80c7d1da8a1',
  56: 'https://polished-aged-patron.bsc.quiknode.pro/397756892cd5b114412f8819684fc80c7d1da8a1',
  137: 'https://polished-aged-patron.matic.quiknode.pro/397756892cd5b114412f8819684fc80c7d1da8a1',
  143: 'https://polished-aged-patron.monad-mainnet.quiknode.pro/397756892cd5b114412f8819684fc80c7d1da8a1',
  324: 'https://polished-aged-patron.zksync-mainnet.quiknode.pro/397756892cd5b114412f8819684fc80c7d1da8a1',
  999: 'https://polished-aged-patron.hype-mainnet.quiknode.pro/397756892cd5b114412f8819684fc80c7d1da8a1/evm',
  4663: 'https://polished-aged-patron.robinhood-mainnet.quiknode.pro/397756892cd5b114412f8819684fc80c7d1da8a1',
  8453: 'https://polished-aged-patron.base-mainnet.quiknode.pro/397756892cd5b114412f8819684fc80c7d1da8a1',
  42161: 'https://polished-aged-patron.arbitrum-mainnet.quiknode.pro/397756892cd5b114412f8819684fc80c7d1da8a1',
  43114:
    'https://polished-aged-patron.avalanche-mainnet.quiknode.pro/397756892cd5b114412f8819684fc80c7d1da8a1/ext/bc/C/rpc/',
  80094: 'https://polished-aged-patron.bera-mainnet.quiknode.pro/397756892cd5b114412f8819684fc80c7d1da8a1',
};

export const EVM_QUICKNODE_WSS: Record<number, string> = {
  1: 'wss://polished-aged-patron.ethereum-mainnet.quiknode.pro/397756892cd5b114412f8819684fc80c7d1da8a1',
  10: 'wss://polished-aged-patron.optimism.quiknode.pro/397756892cd5b114412f8819684fc80c7d1da8a1',
  56: 'wss://polished-aged-patron.bsc.quiknode.pro/397756892cd5b114412f8819684fc80c7d1da8a1',
  137: 'wss://polished-aged-patron.matic.quiknode.pro/397756892cd5b114412f8819684fc80c7d1da8a1',
  143: 'wss://polished-aged-patron.monad-mainnet.quiknode.pro/397756892cd5b114412f8819684fc80c7d1da8a1',
  324: 'wss://polished-aged-patron.zksync-mainnet.quiknode.pro/397756892cd5b114412f8819684fc80c7d1da8a1',
  999: 'wss://polished-aged-patron.hype-mainnet.quiknode.pro/397756892cd5b114412f8819684fc80c7d1da8a1/nanoreth',
  4663: 'wss://polished-aged-patron.robinhood-mainnet.quiknode.pro/397756892cd5b114412f8819684fc80c7d1da8a1',
  8453: 'wss://polished-aged-patron.base-mainnet.quiknode.pro/397756892cd5b114412f8819684fc80c7d1da8a1',
  42161: 'wss://polished-aged-patron.arbitrum-mainnet.quiknode.pro/397756892cd5b114412f8819684fc80c7d1da8a1',
  43114:
    'wss://polished-aged-patron.avalanche-mainnet.quiknode.pro/397756892cd5b114412f8819684fc80c7d1da8a1/ext/bc/C/ws/',
  80094: 'wss://polished-aged-patron.bera-mainnet.quiknode.pro/397756892cd5b114412f8819684fc80c7d1da8a1',
};

// Backup QuickNode EVM endpoints (previous primary, used when the primary QuickNode fails)
export const EVM_QUICKNODE_RPCS_BACKUP: Record<number, string> = {
  1: 'https://billowing-bold-reel.ethereum-mainnet.quiknode.pro/62d153de01da78c4f027ea86e414afc23334c320',
  10: 'https://billowing-bold-reel.optimism.quiknode.pro/62d153de01da78c4f027ea86e414afc23334c320',
  56: 'https://billowing-bold-reel.bsc.quiknode.pro/62d153de01da78c4f027ea86e414afc23334c320',
  137: 'https://billowing-bold-reel.matic.quiknode.pro/62d153de01da78c4f027ea86e414afc23334c320',
  143: 'https://billowing-bold-reel.monad-mainnet.quiknode.pro/62d153de01da78c4f027ea86e414afc23334c320',
  324: 'https://billowing-bold-reel.zksync-mainnet.quiknode.pro/62d153de01da78c4f027ea86e414afc23334c320',
  4663: 'https://billowing-bold-reel.robinhood-mainnet.quiknode.pro/62d153de01da78c4f027ea86e414afc23334c320',
  8453: 'https://billowing-bold-reel.base-mainnet.quiknode.pro/62d153de01da78c4f027ea86e414afc23334c320',
  42161: 'https://billowing-bold-reel.arbitrum-mainnet.quiknode.pro/62d153de01da78c4f027ea86e414afc23334c320',
  43114:
    'https://billowing-bold-reel.avalanche-mainnet.quiknode.pro/62d153de01da78c4f027ea86e414afc23334c320/ext/bc/C/rpc/',
  80094: 'https://billowing-bold-reel.bera-mainnet.quiknode.pro/62d153de01da78c4f027ea86e414afc23334c320',
};

export const EVM_QUICKNODE_WSS_BACKUP: Record<number, string> = {
  1: 'wss://billowing-bold-reel.ethereum-mainnet.quiknode.pro/62d153de01da78c4f027ea86e414afc23334c320',
  56: 'wss://billowing-bold-reel.bsc.quiknode.pro/62d153de01da78c4f027ea86e414afc23334c320',
  137: 'wss://billowing-bold-reel.matic.quiknode.pro/62d153de01da78c4f027ea86e414afc23334c320',
  8453: 'wss://billowing-bold-reel.base-mainnet.quiknode.pro/62d153de01da78c4f027ea86e414afc23334c320',
  143: 'wss://billowing-bold-reel.monad-mainnet.quiknode.pro/62d153de01da78c4f027ea86e414afc23334c320',
};

export const EVM_ALCHEMY_RPCS: Record<number, string> = {
  1: `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  56: `https://bnb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  137: `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  8453: `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  143: `https://monad-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  204: `https://opbnb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  10: `https://opt-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  42161: `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  43114: `https://avax-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  999: `https://hyperliquid-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  59144: `https://linea-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  80094: `https://berachain-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  5000: `https://mantle-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  7000: `https://zetachain-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  324: `https://zksync-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  360: `https://shape-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  4663: `https://robinhood-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
};

export const EVM_ALCHEMY_RPCS_BACKUP: Record<number, string> = {
  1: `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY_BACKUP}`,
  56: `https://bnb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY_BACKUP}`,
  137: `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY_BACKUP}`,
  8453: `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY_BACKUP}`,
  10: `https://opt-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY_BACKUP}`,
  42161: `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY_BACKUP}`,
  43114: `https://avax-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY_BACKUP}`,
  999: `https://hyperliquid-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY_BACKUP}`,
  59144: `https://linea-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY_BACKUP}`,
  80094: `https://berachain-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY_BACKUP}`,
  5000: `https://mantle-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY_BACKUP}`,
  7000: `https://zetachain-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY_BACKUP}`,
  324: `https://zksync-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY_BACKUP}`,
  360: `https://shape-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY_BACKUP}`,
  4663: `https://robinhood-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY_BACKUP}`,
};

export const EVM_ALCHEMY_WSS: Record<number, string> = {
  1: `wss://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  56: `wss://bnb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  137: `wss://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  8453: `wss://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  143: `wss://monad-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  204: `wss://opbnb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  10: `wss://opt-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  42161: `wss://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  43114: `wss://avax-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  999: `wss://hyperliquid-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  59144: `wss://linea-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  80094: `wss://berachain-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  5000: `wss://mantle-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  7000: `wss://zetachain-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  324: `wss://zksync-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  360: `wss://shape-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  4663: `wss://robinhood-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
};

export function getEvmRpcs(chainId: number): string[] {
  return [
    EVM_QUICKNODE_RPCS[chainId],
    EVM_ALCHEMY_RPCS[chainId],
    EVM_QUICKNODE_RPCS_BACKUP[chainId],
    EVM_ALCHEMY_RPCS_BACKUP[chainId],
    chainId === 143 ? 'https://rpc.monad.xyz' : undefined,
  ].filter(Boolean) as string[];
}

export function getEvmWss(chainId: number): string[] {
  return [EVM_QUICKNODE_WSS[chainId], EVM_ALCHEMY_WSS[chainId], EVM_QUICKNODE_WSS_BACKUP[chainId]].filter(Boolean) as string[];
}


// -----------------------------
// Covalent chain names
// -----------------------------
export const COVALENT_CHAIN_NAMES: Record<number, string> = {
  1: 'eth-mainnet',
  56: 'bsc-mainnet',
  137: 'matic-mainnet',
  8453: 'base-mainnet',
  143: 'monad-mainnet',
  10: 'optimism-mainnet',
  42161: 'arbitrum-mainnet',
  43114: 'avax-mainnet',
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
