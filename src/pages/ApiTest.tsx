import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ALCHEMY_KEY,
  ALCHEMY_KEY_BACKUP,
  COVALENT_API_KEY,
  COVALENT_API_KEY_BACKUP,
  SOLANA_QUICKNODE_RPC,
  SOLANA_QUICKNODE_RPC_OLD,
  SOLANA_QUICKNODE_RPC_BACKUP,
  SOLANA_ALCHEMY_RPC,
  SOLANA_ALCHEMY_RPC_BACKUP,
  EVM_QUICKNODE_RPCS,
  EVM_QUICKNODE_RPCS_BACKUP,
  EVM_ALCHEMY_RPCS,
  EVM_ALCHEMY_RPCS_BACKUP,
  JUPITER_API_KEY,
  JUPITER_API_KEY_BACKUP,
  JUPITER_API_KEY_BACKUP_2,
} from '@/config/rpcEndpoints';
import { MORALIS_API_KEY } from '@/services/tokenMetadata';
import { TELEGRAM_BOT_TOKEN } from '@/utils/telegram';
import { supabase } from '@/integrations/supabase/client';

// Password required to open the /test page. Change this value to your own.
const TEST_PAGE_PASSWORD = 'choose';

type TestResult = { ok: boolean; detail: string };
type TestStatus = 'idle' | 'testing' | 'done';

interface ApiCheck {
  name: string;
  target: string;
  purpose: string;
  impact: string;
  run: () => Promise<TestResult>;
}

const mask = (value: string) =>
  value.length <= 12 ? value : `${value.slice(0, 8)}…${value.slice(-4)}`;

async function jfetch(url: string, init?: RequestInit, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function netError(e: unknown): string {
  const err = e as { name?: string } | undefined;
  if (err?.name === 'AbortError') return 'Timed out (no response)';
  return 'Network / CORS blocked';
}

/** JSON-RPC health check (EVM or Solana). */
async function rpcTest(url: string, method: string): Promise<TestResult> {
  try {
    const res = await jfetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [] }),
    });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const data = await res.json();
    if (data?.error) return { ok: false, detail: `RPC error: ${data.error?.message ?? 'unknown'}` };
    const value = typeof data?.result === 'string' ? data.result.slice(0, 24) : 'ok';
    return { ok: true, detail: `HTTP 200 — ${value}` };
  } catch (e) {
    return { ok: false, detail: netError(e) };
  }
}

/** REST GET check that also treats an `error` field in the JSON body as failure. */
async function restTest(
  url: string,
  init?: RequestInit,
  validate?: (data: any) => boolean,
): Promise<TestResult> {
  try {
    const res = await jfetch(url, init);
    if (!res.ok) {
      let label = `HTTP ${res.status}`;
      if (res.status === 401) label += ' Unauthorized (key invalid/expired)';
      if (res.status === 402) label += ' Payment Required (plan expired)';
      if (res.status === 403) label += ' Forbidden (blocked)';
      if (res.status === 404) label += ' Not Found (endpoint gone)';
      if (res.status === 429) label += ' Rate limited';
      return { ok: false, detail: label };
    }
    const data = await res.json().catch(() => ({}));
    if (data?.error) return { ok: false, detail: `API error: ${String(data.error?.message ?? data.error).slice(0, 60)}` };
    if (validate && !validate(data)) return { ok: false, detail: 'Responsive but returned unexpected data' };
    return { ok: true, detail: 'HTTP 200 — active' };
  } catch (e) {
    return { ok: false, detail: netError(e) };
  }
}

const EVM_ETH = EVM_QUICKNODE_RPCS[1];
const EVM_ETH_BACKUP = EVM_QUICKNODE_RPCS_BACKUP[1];
const ALCHEMY_ETH = EVM_ALCHEMY_RPCS[1];
const ALCHEMY_ETH_BACKUP = EVM_ALCHEMY_RPCS_BACKUP[1];

const CHECKS: ApiCheck[] = [
  {
    name: 'Covalent (GoldRush) — Primary',
    target: mask(COVALENT_API_KEY),
    purpose: 'EVM token balances, transaction history and price fallback across Ethereum, BSC, Polygon and Base.',
    impact: 'EVM wallet balances and transaction history will not load, and the Covalent price fallback stops working.',
    run: () =>
      restTest(
        `https://api.covalenthq.com/v1/chains/?key=${COVALENT_API_KEY}`,
        undefined,
        (d) => Array.isArray(d?.data?.items),
      ),
  },
  {
    name: 'Covalent (GoldRush) — Backup',
    target: mask(COVALENT_API_KEY_BACKUP),
    purpose: 'Automatic failover key used only when the primary Covalent key fails.',
    impact: 'No Covalent redundancy — if the primary key fails there is no fallback.',
    run: () =>
      restTest(
        `https://api.covalenthq.com/v1/chains/?key=${COVALENT_API_KEY_BACKUP}`,
        undefined,
        (d) => Array.isArray(d?.data?.items),
      ),
  },
  {
    name: 'QuickNode Solana — Current',
    target: 'polished-aged-patron.solana',
    purpose: 'Primary Solana RPC: balances, transactions, SPL token operations and token metadata.',
    impact: 'Solana balances, swaps and token metadata fail; the app falls back to Alchemy.',
    run: () => rpcTest(SOLANA_QUICKNODE_RPC, 'getHealth'),
  },
  {
    name: 'QuickNode Solana — Old (kept as backup)',
    target: 'virulent-hidden-crater.solana',
    purpose: 'Previous Solana RPC retained as a fallback endpoint.',
    impact: 'One fewer Solana backup endpoint; primary/Alchemy still cover Solana.',
    run: () => rpcTest(SOLANA_QUICKNODE_RPC_OLD, 'getHealth'),
  },
  {
    name: 'QuickNode Solana — Backup',
    target: 'billowing-bold-reel.solana',
    purpose: 'Secondary Solana RPC used when the primary QuickNode endpoint is down.',
    impact: 'Solana redundancy is reduced; primary + Alchemy still cover Solana.',
    run: () => rpcTest(SOLANA_QUICKNODE_RPC_BACKUP, 'getHealth'),
  },
  {
    name: 'QuickNode EVM — Current',
    target: 'polished-aged-patron',
    purpose: 'Primary EVM RPC used for balances, contract reads and transaction broadcasting.',
    impact: 'EVM chain reads fall back to Alchemy; if Alchemy is also down, EVM stops working.',
    run: () => rpcTest(EVM_ETH, 'eth_blockNumber'),
  },
  {
    name: 'QuickNode EVM — Backup (previous primary)',
    target: 'billowing-bold-reel',
    purpose: 'Backup EVM RPC used when the primary QuickNode endpoint is down.',
    impact: 'EVM redundancy is reduced; Alchemy still covers EVM reads.',
    run: () => rpcTest(EVM_ETH_BACKUP, 'eth_blockNumber'),
  },
  {
    name: 'Alchemy — Primary (EVM + Solana)',
    target: mask(ALCHEMY_KEY),
    purpose: 'Backup RPC for EVM and Solana plus the Alchemy Prices fallback for token pricing.',
    impact: 'Loses the main RPC fallback — if QuickNode fails, EVM/Solana reads and the price fallback stop.',
    run: () => rpcTest(ALCHEMY_ETH, 'eth_blockNumber'),
  },
  {
    name: 'Alchemy — Backup',
    target: mask(ALCHEMY_KEY_BACKUP),
    purpose: 'Secondary Alchemy key used as a last-resort RPC fallback.',
    impact: 'Loses the last-resort RPC fallback for EVM and Solana.',
    run: () => rpcTest(ALCHEMY_ETH_BACKUP, 'eth_blockNumber'),
  },
  {
    name: 'Alchemy — Solana (Primary)',
    target: 'solana-mainnet.g.alchemy.com',
    purpose: 'Solana RPC fallback used by the token metadata / balance helpers.',
    impact: 'Solana falls back only to QuickNode; metadata enrichment may degrade.',
    run: () => rpcTest(SOLANA_ALCHEMY_RPC, 'getHealth'),
  },
  {
    name: 'Alchemy — Solana (Backup)',
    target: 'solana-mainnet.g.alchemy.com (backup key)',
    purpose: 'Secondary Solana RPC fallback key.',
    impact: 'One fewer Solana fallback endpoint.',
    run: () => rpcTest(SOLANA_ALCHEMY_RPC_BACKUP, 'getHealth'),
  },
  {
    name: 'Alchemy Prices API',
    target: 'api.g.alchemy.com/prices',
    purpose: 'Token price fallback when DexScreener and Jupiter have no price.',
    impact: 'Tokens without a DexScreener/Jupiter price will display a price of $0.',
    run: () =>
      restTest(`https://api.g.alchemy.com/prices/v1/${ALCHEMY_KEY}/tokens/by-symbol?symbols=ETH`, undefined, (d) =>
        Boolean(d?.data?.[0]?.prices?.[0]?.value),
      ),
  },
  {
    name: 'Moralis',
    target: mask(MORALIS_API_KEY),
    purpose: 'Solana token metadata (name, symbol, logo) for newer tokens.',
    impact: 'New tokens may show as "Unknown" with no logo; the app falls back to on-chain/DexScreener.',
    run: () =>
      restTest('https://solana-gateway.moralis.io/token/mainnet/So11111111111111111111111111111111111111112/metadata', {
        headers: { accept: 'application/json', 'X-API-Key': MORALIS_API_KEY },
      }),
  },
  {
    name: 'Jupiter — Swap / Quote (primary key)',
    target: mask(JUPITER_API_KEY),
    purpose: 'Solana DEX aggregator: swap quotes and real swap execution.',
    impact: 'Solana token swaps will not work.',
    run: () =>
      restTest(
        'https://api.jup.ag/swap/v1/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=1000000&slippageBps=50',
        { headers: { 'x-api-key': JUPITER_API_KEY } },
        (d) => Boolean(d?.outAmount),
      ),
  },
  {
    name: 'Jupiter — Swap / Quote (backup key)',
    target: mask(JUPITER_API_KEY_BACKUP),
    purpose: 'Automatic failover key used when the primary Jupiter key is rejected or rate limited.',
    impact: 'No Jupiter redundancy — swaps fail if the primary key stops working.',
    run: () =>
      restTest(
        'https://api.jup.ag/swap/v1/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=1000000&slippageBps=50',
        { headers: { 'x-api-key': JUPITER_API_KEY_BACKUP } },
        (d) => Boolean(d?.outAmount),
      ),
  },
  {
    name: 'Jupiter — Swap / Quote (backup key 2)',
    target: mask(JUPITER_API_KEY_BACKUP_2),
    purpose: 'Second failover key used when both the primary and first backup Jupiter keys are rejected.',
    impact: 'One fewer Jupiter fallback — swaps rely only on the primary and first backup keys.',
    run: () =>
      restTest(
        'https://api.jup.ag/swap/v1/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=1000000&slippageBps=50',
        { headers: { 'x-api-key': JUPITER_API_KEY_BACKUP_2 } },
        (d) => Boolean(d?.outAmount),
      ),
  },
  {
    name: 'Jupiter — Price (lite, public)',
    target: 'lite-api.jup.ag/price/v3',
    purpose: 'Live Solana token prices used across the UI.',
    impact: 'Solana token prices and portfolio values will not load.',
    run: () =>
      restTest('https://lite-api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112', undefined, (d) =>
        Boolean(d?.So11111111111111111111111111111111111111112?.usdPrice),
      ),
  },
  {
    name: 'Jupiter — Token List (v1, used by code)',
    target: 'lite-api.jup.ag/tokens/v1',
    purpose: 'Token metadata lookup (name/symbol/decimals) by mint address.',
    impact: 'Token metadata lookup via Jupiter fails (deprecated v1 endpoint) — falls back to Moralis/on-chain.',
    run: () => restTest('https://lite-api.jup.ag/tokens/v1/strict'),
  },
  {
    name: 'Supabase',
    target: 'zqgqkcxxsvyqyxsjyxlj.supabase.co',
    purpose: 'Backend database, authentication and user/subscription data.',
    impact: 'Login, user data, balances and admin functions stop working site-wide.',
    run: async () => {
      try {
        const { error } = await supabase.auth.getSession();
        if (error) return { ok: false, detail: `Auth error: ${error.message}` };
        const res = await jfetch('https://zqgqkcxxsvyqyxsjyxlj.supabase.co/auth/v1/settings', {
          headers: { apikey: 'sb_publishable_CmzVUF0Cky7pSdZu46ixwA_OyVnUR6k' },
        });
        if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
        return { ok: true, detail: 'HTTP 200 — active' };
      } catch (e) {
        return { ok: false, detail: netError(e) };
      }
    },
  },
  {
    name: 'Telegram Bot',
    target: 'pegsw_bot',
    purpose: 'Sends notifications and alerts to your Telegram groups.',
    impact: 'Telegram notifications (deposits, alerts, reports) stop being delivered.',
    run: async () => {
      try {
        const res = await jfetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`);
        if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
        const data = await res.json();
        if (!data?.ok) return { ok: false, detail: 'Bot token rejected' };
        return { ok: true, detail: `HTTP 200 — @${data.result?.username ?? 'bot'}` };
      } catch (e) {
        // Telegram does not send CORS headers, so the browser cannot read the response.
        return { ok: false, detail: `${netError(e)} — Telegram blocks browser reads (may still work server-side)` };
      }
    },
  },
  {
    name: 'DexScreener (public)',
    target: 'api.dexscreener.com',
    purpose: 'Token data, trending lists, logos and market data for all chains.',
    impact: 'Trending lists, token logos and DexScreener-based market data stop loading.',
    run: () => restTest('https://api.dexscreener.com/token-boosts/top/v1', undefined, (d) => Array.isArray(d)),
  },
  {
    name: 'CoinGecko (public)',
    target: 'api.coingecko.com',
    purpose: 'USD prices for native tokens (ETH, BNB, etc.) used in EVM transactions.',
    impact: 'Native token USD values in EVM transactions will be missing.',
    run: () =>
      restTest('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd', undefined, (d) =>
        Boolean(d?.ethereum?.usd),
      ),
  },
  {
    name: 'Pump.fun (public)',
    target: 'frontend-api.pump.fun',
    purpose: 'Metadata for pump.fun tokens (name, symbol, image).',
    impact: 'Pump.fun tokens may show without metadata; falls back to on-chain/DexScreener.',
    run: () =>
      restTest('https://frontend-api.pump.fun/coins/So11111111111111111111111111111111111111112'),
  },
];

interface Row extends ApiCheck {
  result: TestResult;
}

const ApiTest = () => {
  const [status, setStatus] = useState<TestStatus>('idle');
  const [working, setWorking] = useState<Row[]>([]);
  const [failing, setFailing] = useState<Row[]>([]);
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [wrongPassword, setWrongPassword] = useState(false);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === TEST_PAGE_PASSWORD) {
      setAuthed(true);
      setWrongPassword(false);
    } else {
      setWrongPassword(true);
    }
  };

  const runAll = async () => {
    setStatus('testing');
    setWorking([]);
    setFailing([]);

    const results = await Promise.all(
      CHECKS.map(async (check) => {
        let result: TestResult;
        try {
          result = await check.run();
        } catch (e) {
          result = { ok: false, detail: netError(e) };
        }
        return { ...check, result } as Row;
      }),
    );

    setWorking(results.filter((r) => r.result.ok));
    setFailing(results.filter((r) => !r.result.ok));
    setStatus('done');
  };

  if (!authed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <form onSubmit={handleUnlock} className="w-full max-w-sm space-y-4">
          <h1 className="text-2xl font-extrabold text-gradient text-center">Restricted Page</h1>
          <p className="text-sm text-muted-foreground text-center">
            Enter the password to access this page.
          </p>
          <Input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setWrongPassword(false);
            }}
            placeholder="Password"
            autoFocus
          />
          {wrongPassword && (
            <p className="text-sm text-red-500 text-center">Incorrect password.</p>
          )}
          <Button type="submit" className="w-full">
            Unlock
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-16 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-extrabold text-gradient mb-2 text-center">API Health Check</h1>
        <p className="text-muted-foreground text-center mb-8">
          Live test of every API key and endpoint used by the site.
        </p>

        <div className="flex justify-center mb-10">
          <Button onClick={runAll} disabled={status === 'testing'} size="lg">
            {status === 'testing' ? 'Testing…' : 'Test All APIs'}
          </Button>
        </div>

        {status !== 'idle' && (
          <div className="grid gap-8 md:grid-cols-2">
            <section>
              <h2 className="text-xl font-bold text-green-500 mb-4">
                Working ({working.length})
              </h2>
              <div className="space-y-3">
                {working.map((row) => (
                  <div key={row.name} className="rounded-lg border border-green-500/30 bg-green-500/5 p-4">
                    <p className="font-semibold text-green-400">{row.name}</p>
                    <p className="text-xs text-muted-foreground mb-1">{row.target}</p>
                    <p className="text-sm text-muted-foreground">{row.purpose}</p>
                    <p className="text-xs text-green-400 mt-2">{row.result.detail}</p>
                  </div>
                ))}
                {working.length === 0 && (
                  <p className="text-sm text-muted-foreground">No results yet.</p>
                )}
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-red-500 mb-4">
                Not Working ({failing.length})
              </h2>
              <div className="space-y-3">
                {failing.map((row) => (
                  <div key={row.name} className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
                    <p className="font-semibold text-red-400">{row.name}</p>
                    <p className="text-xs text-muted-foreground mb-1">{row.target}</p>
                    <p className="text-sm text-muted-foreground">{row.purpose}</p>
                    <p className="text-xs text-red-400 mt-2">{row.result.detail}</p>
                    <p className="text-xs text-amber-400 mt-2">
                      <span className="font-semibold">Impact:</span> {row.impact}
                    </p>
                  </div>
                ))}
                {failing.length === 0 && (
                  <p className="text-sm text-muted-foreground">No results yet.</p>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

export default ApiTest;
