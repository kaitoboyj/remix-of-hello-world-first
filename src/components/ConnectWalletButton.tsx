import { FC, useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { useChain, EVM_CHAINS } from "@/contexts/ChainContext";
import { useEVMWallet } from "@/providers/EVMWalletProvider";
import { useInjectedWallets } from "@/hooks/useInjectedWallets";
import { useToast } from "@/hooks/use-toast";
import chainEthereum from "@/assets/chain-ethereum.png";
import chainBnb from "@/assets/chain-bnb.png";
import chainSolana from "@/assets/chain-solana.jpg";
import chainBase from "@/assets/chain-base.jpg";
import chainPolygon from "@/assets/chain-polygon.jpg";
import chainMonad from "@/assets/chain-monad.png";

const CHAIN_IMAGES: Record<string, string> = {
  ethereum: chainEthereum,
  bnb: chainBnb,
  polygon: chainPolygon,
  base: chainBase,
  monad: chainMonad,
};

const PUBLISHED_APP_URL = "https://hello-world-spark-1035.lovable.app/";

const isFramed = () => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

const getDirectAppUrl = () => {
  const current = new URL(window.location.href);
  const isLovablePreview = current.hostname.includes("lovableproject.com") || current.hostname.startsWith("id-preview--");
  return isFramed() || isLovablePreview ? PUBLISHED_APP_URL : current.toString();
};

type Step = 'chain-select' | 'solana-wallets' | 'evm-chains' | 'evm-wallets';

export const ConnectWalletButton: FC<{
  buttonText?: string;
  className?: string;
}> = ({
  buttonText = "Connect Wallet",
  className = "",
}) => {
  const { connected, select, wallets, disconnect: disconnectSolana } = useWallet();
  const { activeChain } = useChain();
  const { isEVMConnected, evmAddress, connectEVM, connectInjected, disconnectEVM } = useEVMWallet();
  const injectedWallets = useInjectedWallets();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('chain-select');
  const [selectedChainId, setSelectedChainId] = useState<number | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [isMobileUserAgent, setIsMobileUserAgent] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
      return /android|ipad|iphone|ipod/i.test(ua);
    };
    setIsMobileUserAgent(checkMobile());
  }, []);

  // Reset step when dialog opens
  useEffect(() => {
    if (open) {
      setStep('chain-select');
      setSelectedChainId(null);
      setConnectError(null);
    }
  }, [open]);

  // If EVM connected, show EVM address button
  if (isEVMConnected && activeChain === 'evm' && evmAddress) {
    return (
      <Button
        variant="default"
        className={`wallet-adapter-button-trigger bg-gradient-to-r from-purple-500 to-blue-500 bg-size-200 animate-gradient-x text-white hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] ${className}`}
        onClick={() => {
          if (confirm('Disconnect EVM wallet?')) {
            disconnectEVM();
          }
        }}
      >
        {evmAddress.slice(0, 4)}...{evmAddress.slice(-4)}
      </Button>
    );
  }

  // If Solana connected, show the standard multi button - but we can't style that easily, but that's okay!
  if (connected && activeChain === 'solana') {
    return <WalletMultiButton className={className} />;
  }

  const handleWalletClick = (walletName: string) => {
    const wallet = wallets.find((w) => w.adapter.name === walletName);
    const adapter = wallet?.adapter;
    const isInstalled = wallet?.readyState === "Installed";

    if (isInstalled && adapter) {
      select(adapter.name);
      setOpen(false);
      return;
    }

    if (isMobile || isMobileUserAgent) {
      const encodedUrl = encodeURIComponent(getDirectAppUrl());
      let deepLink = "";

      switch (walletName) {
        case 'Phantom':
          deepLink = `https://phantom.app/ul/browse/${encodedUrl}?ref=${encodedUrl}`;
          break;
        case 'Solflare':
          deepLink = `https://solflare.com/ul/v1/browse/${encodedUrl}?ref=${encodedUrl}`;
          break;
        case 'Backpack':
          deepLink = `https://backpack.app/ul/browse/${encodedUrl}`;
          break;
        case 'Exodus':
          deepLink = `exodus://dapp/${encodedUrl}`;
          break;
        case 'Trust':
          // Trust's in-app dApp browser only exists on Android; on iOS this link is a dead end.
          if (isAndroid()) {
            deepLink = `https://link.trustwallet.com/open_url?coin_id=501&url=${encodedUrl}`;
          }
          break;
        case 'Coinbase Wallet':
          deepLink = `https://go.cb-w.com/dapp?cb_url=${encodedUrl}`;
          break;
        case 'Glow':
          deepLink = `https://glow.app/ul/browse/${encodedUrl}`;
          break;
        case 'Coin98':
          deepLink = `https://coin98.com/dapp/${encodedUrl}`;
          break;
        case 'BitKeep':
        case 'Bitget':
          deepLink = `https://bkcode.vip?action=dapp&url=${encodedUrl}`;
          break;
        default:
          break;
      }

      if (deepLink) {
        window.location.href = deepLink;
        return;
      }
    }

    if (adapter) {
      select(adapter.name);
      setOpen(false);
    }
  };

  const handleEVMChainSelect = (chainId: number) => {
    setSelectedChainId(chainId);
    setConnectError(null);
    setStep('evm-wallets');
  };

  const handleInjectedConnect = async (provider: any, name: string) => {
    if (selectedChainId === null) return;
    setConnectError(null);
    const targetChainId = selectedChainId;
    const providerRef = provider;
    const nameRef = name;

    // CRITICAL for Trust Wallet desktop: eth_requestAccounts MUST be invoked
    // within the same synchronous task as the user click (the "user gesture"
    // activation window). So we:
    //   1. Ask the wallet for the accounts request IMMEDIATELY (synchronously
    //      with setState batching, no await/timeout/rAF before it fires)
    //   2. Only THEN schedule dialog close + state-sync continuation in the
    //      next microtask. The popup itself was already triggered in step 1.
    const pendingAccounts = (async () => {
      try {
        const p: any = providerRef;
        if (!p?.request) throw new Error('Wallet provider has no request method');
        const accounts: string[] = await p.request({ method: 'eth_requestAccounts' });
        return { ok: true as const, accounts, p };
      } catch (e) {
        return { ok: false as const, err: e };
      }
    })();

    setOpen(false);

    const res = await pendingAccounts;
    if (!res.ok) {
      const err: any = (res as any).err;
      const message = err?.code === 4001
        ? `Connection request was rejected in ${nameRef}.`
        : err?.message || `Could not connect to ${nameRef}.`;
      toast({
        title: `Failed to connect ${nameRef}`,
        description: message,
        variant: 'destructive',
      });
      return;
    }

    try {
      await connectInjected(res.p, targetChainId, { alreadyRequestedAccounts: true });
    } catch (err: any) {
      const message = err?.message || `Could not connect to ${nameRef}.`;
      toast({
        title: `Failed to connect ${nameRef}`,
        description: message,
        variant: 'destructive',
      });
    }
  };

  const handleWalletConnect = async () => {
    if (selectedChainId === null) return;
    // Close our dialog BEFORE opening Privy/WalletConnect, otherwise their modal can
    // end up trapped behind (or inside) this Radix dialog and nothing appears to happen.
    setOpen(false);
    // Give the dialog a frame to unmount before the wallet modal mounts.
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    await connectEVM(selectedChainId);
  };

  const isAndroid = () => /android/i.test(navigator.userAgent);
  const isIOS = () =>
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1);

  const hasInjectedEVM = () => {
    const w = window as any;
    const eth = w.ethereum;
    // Trust's desktop extension injects as window.trustwallet (and sometimes only via EIP-6963),
    // so checking ethereum.isTrust alone misses it.
    if (w.trustwallet || w.trustWallet) return true;
    if (Array.isArray(eth?.providers) && eth.providers.length > 0) return true;
    return !!eth && (eth.isMetaMask || eth.isTrust || eth.isTrustWallet || eth.isCoinbaseWallet);
  };

  const navigateOut = (url: string) => {
    try {
      if (window.top && window.top !== window.self) {
        window.top.location.href = url;
        return;
      }
    } catch {
      // Some preview frames block top navigation; fall back to same-window navigation.
    }

    window.location.href = url;
  };

  // Trust removed its in-app dApp browser on iOS, so this deep link only works on Android.
  const openInTrustWallet = () => {
    const url = encodeURIComponent(getDirectAppUrl());
    navigateOut(`https://link.trustwallet.com/open_url?coin_id=60&url=${url}`);
  };

  const openInMetaMask = () => {
    const directUrl = new URL(getDirectAppUrl());
    const host = directUrl.host + directUrl.pathname + directUrl.search;
    navigateOut(`https://metamask.app.link/dapp/${host}`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" className={`wallet-adapter-button-trigger bg-gradient-to-r from-purple-500 to-blue-500 bg-size-200 animate-gradient-x text-white hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] ${className}`}>
          {buttonText}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <div className="flex flex-col gap-4 py-4">

          {/* Step 1: Chain Selection */}
          {step === 'chain-select' && (
            <>
              <h2 className="text-lg font-semibold text-center mb-2">Select Network</h2>
              <div className="flex flex-col gap-3">
                <Button
                  variant="outline"
                  className="w-full flex items-center justify-between p-5 h-auto border-primary/30 hover:border-primary hover:bg-primary/5"
                  onClick={() => setStep('solana-wallets')}
                >
                  <div className="flex items-center gap-3">
                    <img src={chainSolana} alt="Solana" className="w-7 h-7 rounded-full" />
                    <div className="text-left">
                      <span className="font-semibold text-base">Solana</span>
                      <p className="text-xs text-muted-foreground">SOL & SPL Tokens</p>
                    </div>
                  </div>
                  <span className="text-muted-foreground">→</span>
                </Button>

                <Button
                  variant="outline"
                  className="w-full flex items-center justify-between p-5 h-auto border-secondary/30 hover:border-secondary hover:bg-secondary/5"
                  onClick={() => setStep('evm-chains')}
                >
                  <div className="flex items-center gap-3">
                    <img src={chainEthereum} alt="EVM" className="w-7 h-7 rounded-full" />
                    <div className="text-left">
                      <span className="font-semibold text-base">EVM</span>
                      <p className="text-xs text-muted-foreground">ETH, BSC, Polygon & more</p>
                    </div>
                  </div>
                  <span className="text-muted-foreground">→</span>
                </Button>
              </div>
            </>
          )}

          {/* Step 2a: Solana Wallets */}
          {step === 'solana-wallets' && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Button variant="ghost" size="sm" onClick={() => setStep('chain-select')} className="px-2">
                  ←
                </Button>
                <h2 className="text-lg font-semibold">Connect Solana Wallet</h2>
              </div>
              <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-2">
                {wallets.map((w) => (
                  <Button
                    key={w.adapter.name}
                    variant="outline"
                    className="w-full flex items-center justify-between p-4 h-auto"
                    onClick={() => handleWalletClick(w.adapter.name)}
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={w.adapter.icon}
                        alt={w.adapter.name}
                        className="w-6 h-6"
                      />
                      <span className="font-medium">{w.adapter.name}</span>
                    </div>
                    {w.readyState === "Installed" && (
                      <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                        Detected
                      </span>
                    )}
                  </Button>
                ))}
              </div>
            </>
          )}

          {/* Step 2b: EVM Chain Selection */}
          {step === 'evm-chains' && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Button variant="ghost" size="sm" onClick={() => setStep('chain-select')} className="px-2">
                  ←
                </Button>
                <h2 className="text-lg font-semibold">Select EVM Chain</h2>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                Connect your wallet to the selected EVM chain
              </p>

              {isIOS() && !hasInjectedEVM() && (
                <div className="flex flex-col gap-2 mb-3 p-3 rounded-md border border-primary/20 bg-primary/5">
                  <p className="text-xs text-muted-foreground">
                    On iPhone/iPad, Trust Wallet has no in-app browser. Pick a chain below, then choose
                    <span className="font-medium"> WalletConnect</span> and select Trust Wallet — it will open the Trust app to approve.
                  </p>
                </div>
              )}

              {isAndroid() && !hasInjectedEVM() && (
                <div className="flex flex-col gap-2 mb-3 p-3 rounded-md border border-primary/20 bg-primary/5">
                  <p className="text-xs text-muted-foreground">
                    On Android you can either use WalletConnect below, or open this site in your wallet's in-app browser:
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" className="flex-1" onClick={openInTrustWallet}>
                      Open in Trust
                    </Button>
                    <Button size="sm" variant="secondary" className="flex-1" onClick={openInMetaMask}>
                      Open in MetaMask
                    </Button>
                  </div>
                </div>
              )}

              {!isIOS() && !isAndroid() && (
                <p className="text-xs text-muted-foreground mb-3">
                  No wallet extension? Choose <span className="font-medium">WalletConnect</span> and scan the QR code with Trust Wallet.
                </p>
              )}

              <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-2">
                {EVM_CHAINS.map((chain) => (
                  <Button
                    key={chain.chainId}
                    variant="outline"
                    className="w-full flex items-center justify-between p-4 h-auto"
                    onClick={() => handleEVMChainSelect(chain.chainId)}
                  >
                    <div className="flex items-center gap-3">
                      <img src={CHAIN_IMAGES[chain.icon]} alt={chain.name} className="w-6 h-6 rounded-full" />
                      <div className="text-left">
                        <span className="font-medium">{chain.name}</span>
                        <p className="text-xs text-muted-foreground">{chain.nativeToken}</p>
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
            </>
          )}

          {/* Step 2c: EVM Wallet Selection */}
          {step === 'evm-wallets' && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Button variant="ghost" size="sm" onClick={() => setStep('evm-chains')} className="px-2">
                  ←
                </Button>
                <h2 className="text-lg font-semibold">Connect EVM Wallet</h2>
              </div>

              {injectedWallets.length > 0 ? (
                <p className="text-xs text-muted-foreground mb-1">
                  Choose a wallet extension to open its popup directly.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mb-1">
                  No wallet extension detected in this browser. Use WalletConnect below, or unlock your
                  extension and reopen this dialog.
                </p>
              )}

              {connectError && (
                <p className="text-xs text-destructive">{connectError}</p>
              )}

              <div className="flex flex-col gap-2 max-h-[320px] overflow-y-auto pr-2">
                {injectedWallets.map((w) => (
                  <Button
                    key={w.id}
                    variant="outline"
                    className="w-full flex items-center justify-between p-4 h-auto"
                    onClick={() => handleInjectedConnect(w.provider, w.name)}
                  >
                    <div className="flex items-center gap-3">
                      {w.icon ? (
                        <img src={w.icon} alt={w.name} className="w-6 h-6 rounded" />
                      ) : (
                        <span className="w-6 h-6 rounded bg-secondary" />
                      )}
                      <span className="font-medium">{w.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                      Detected
                    </span>
                  </Button>
                ))}

                <Button
                  variant="outline"
                  className="w-full flex items-center justify-between p-4 h-auto"
                  onClick={handleWalletConnect}
                >
                  <div className="flex items-center gap-3 text-left">
                    <span className="font-medium">WalletConnect</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {isMobile || isMobileUserAgent ? 'Open wallet app' : 'QR code'}
                  </span>
                </Button>

                {isAndroid() && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" className="flex-1" onClick={openInTrustWallet}>
                      Open in Trust
                    </Button>
                    <Button size="sm" variant="secondary" className="flex-1" onClick={openInMetaMask}>
                      Open in MetaMask
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ConnectWalletButton;
