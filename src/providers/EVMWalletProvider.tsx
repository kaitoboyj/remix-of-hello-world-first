import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode, FC } from 'react';
import { ethers } from 'ethers';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useChain, EVM_CHAINS } from '@/contexts/ChainContext';

interface ConnectInjectedOptions {
  alreadyRequestedAccounts?: boolean;
}

interface EVMWalletContextType {
  evmAddress: string | null;
  evmProvider: ethers.BrowserProvider | null;
  evmSigner: ethers.JsonRpcSigner | null;
  isEVMConnected: boolean;
  connectEVM: (chainId: number) => Promise<void>;
  connectInjected: (provider: any, chainId: number, options?: ConnectInjectedOptions) => Promise<void>;
  disconnectEVM: () => void;
  switchChain: (chainId: number) => Promise<void>;
  getLatest: () => { signer: ethers.JsonRpcSigner | null; provider: ethers.BrowserProvider | null; address: string | null };
}

const EVMWalletContext = createContext<EVMWalletContextType | undefined>(undefined);

/**
 * Bypass Privy's switchChain and call the wallet directly via JSON-RPC.
 * This triggers the native MetaMask/Coinbase "Switch Network" popup.
 */
async function requestChainSwitch(
  ethereumProvider: ethers.Eip1193Provider,
  chainId: number
): Promise<void> {
  const chainConfig = EVM_CHAINS.find((c) => c.chainId === chainId);
  if (!chainConfig) throw new Error(`Unknown chain ID: ${chainId}`);

  try {
    await ethereumProvider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainConfig.chainIdHex }],
    });
  } catch (err: any) {
    // 4902 = chain not added to wallet yet
    if (err?.code === 4902 || err?.data?.originalError?.code === 4902) {
      await ethereumProvider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: chainConfig.chainIdHex,
            chainName: chainConfig.name,
            nativeCurrency: {
              name: chainConfig.nativeToken,
              symbol: chainConfig.nativeToken,
              decimals: 18,
            },
            rpcUrls: [chainConfig.rpcUrl],
            blockExplorerUrls: [chainConfig.blockExplorer],
          },
        ],
      });
    } else {
      throw err;
    }
  }
}

export const EVMWalletProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [evmAddress, setEvmAddress] = useState<string | null>(null);
  const [evmProvider, setEvmProvider] = useState<ethers.BrowserProvider | null>(null);
  const [evmSigner, setEvmSigner] = useState<ethers.JsonRpcSigner | null>(null);
  const { setActiveChain, setEvmChainId } = useChain();
  const pendingChainId = useRef<number | null>(null);
  const injectedProviderRef = useRef<any>(null);
  const injectedCleanupRef = useRef<(() => void) | null>(null);

  const latestSignerRef = useRef<ethers.JsonRpcSigner | null>(null);
  const latestProviderRef = useRef<ethers.BrowserProvider | null>(null);
  const latestAddressRef = useRef<string | null>(null);

  const getLatest = useCallback(() => ({
    signer: latestSignerRef.current,
    provider: latestProviderRef.current,
    address: latestAddressRef.current,
  })), []);

  useEffect(() => { latestSignerRef.current = evmSigner; }, [evmSigner]);
  useEffect(() => { latestProviderRef.current = evmProvider; }, [evmProvider]);
  useEffect(() => { latestAddressRef.current = evmAddress; }, [evmAddress]);


  const { login, logout, authenticated, ready } = usePrivy();
  const { wallets } = useWallets();

  // Sync wallet state from the raw Ethereum provider
  const syncWalletState = useCallback(async (wallet: {
    address: string;
    getEthereumProvider: () => Promise<ethers.Eip1193Provider>;
  }) => {
    const ethereumProvider = await wallet.getEthereumProvider();
    const browserProvider = new ethers.BrowserProvider(ethereumProvider);
    const signer = await browserProvider.getSigner();
    const network = await browserProvider.getNetwork();

    setEvmAddress(wallet.address);
    setEvmProvider(browserProvider);
    setEvmSigner(signer);
    setEvmChainId(Number(network.chainId));
  }, [setEvmChainId]);

  // After Privy login completes, use direct RPC to switch to the pending chain
  useEffect(() => {
    const syncWallet = async () => {
      if (injectedProviderRef.current) return;
      if (!ready || !authenticated || wallets.length === 0) return;

      const evmWallet = wallets.find((wallet) => wallet.walletClientType !== 'solana');
      if (!evmWallet) return;

      try {
        if (pendingChainId.current !== null) {
          const targetChain = pendingChainId.current;
          // Always clear the pending chain: retrying on failure caused switch loops with
          // wallets (e.g. Trust over WalletConnect) that don't support wallet_switchEthereumChain.
          pendingChainId.current = null;

          try {
            // Direct RPC call — triggers the native wallet "Switch Network" popup
            const rawProvider = await evmWallet.getEthereumProvider();
            await requestChainSwitch(rawProvider, targetChain);
          } catch (switchErr: any) {
            // Non-fatal: the wallet stays connected on whatever chain it is currently on.
            console.warn('Chain switch after connect was not completed:', switchErr?.code, switchErr?.message);
          }
        }

        // Sync state from whatever chain the wallet is actually on now
        await syncWalletState(evmWallet);
      } catch (err) {
        console.error('Failed to sync Privy wallet:', err);
      }
    };

    syncWallet();
  }, [ready, authenticated, wallets, syncWalletState]);

  const clearInjected = useCallback(() => {
    injectedCleanupRef.current?.();
    injectedCleanupRef.current = null;
    injectedProviderRef.current = null;
  }, []);

  // Sync state directly from a raw EIP-1193 provider (browser extension path)
  const syncInjectedState = useCallback(async (raw: any) => {
    const browserProvider = new ethers.BrowserProvider(raw);
    const signer = await browserProvider.getSigner();
    const address = await signer.getAddress();
    const network = await browserProvider.getNetwork();

    setEvmAddress(address);
    setEvmProvider(browserProvider);
    setEvmSigner(signer);
    setEvmChainId(Number(network.chainId));
  }, [setEvmChainId]);

  const switchChain = useCallback(async (chainId: number) => {
    if (injectedProviderRef.current) {
      const raw = injectedProviderRef.current;
      await requestChainSwitch(raw, chainId);
      await syncInjectedState(raw);
      return;
    }

    const evmWallet = wallets.find((wallet) => wallet.walletClientType !== 'solana');
    if (!evmWallet) throw new Error('No EVM wallet connected');

    try {
      const rawProvider = await evmWallet.getEthereumProvider();
      await requestChainSwitch(rawProvider, chainId);
      await syncWalletState(evmWallet);
    } catch (err: any) {
      console.error('Chain switch error:', err);
      throw err;
    }
  }, [wallets, syncWalletState, syncInjectedState]);

  /**
   * Connect straight to a specific browser-extension provider (Trust, MetaMask, ...).
   * This triggers the extension's own approval popup — no QR code, no third-party modal.
   *
   * `options.alreadyRequestedAccounts` is used when the caller has already invoked
   * `eth_requestAccounts` within the user-click task (required by wallets such as
   * Trust Wallet desktop that enforce a strict gesture-activation window).
   */
  const connectInjected = useCallback(async (raw: any, chainId: number, options: ConnectInjectedOptions = {}) => {
    if (!raw?.request) throw new Error('This wallet extension is not available');

    setActiveChain('evm');
    pendingChainId.current = null;

    let accounts: string[] | undefined;
    if (options.alreadyRequestedAccounts) {
      try {
        accounts = await raw.request({ method: 'eth_accounts' });
      } catch (_) {
        accounts = undefined;
      }
    }
    if (!accounts || accounts.length === 0) {
      accounts = await raw.request({ method: 'eth_requestAccounts' });
    }
    if (!accounts || accounts.length === 0) throw new Error('No accounts returned by the wallet');

    clearInjected();
    injectedProviderRef.current = raw;

    await syncInjectedState(raw);

    const handleAccountsChanged = (accts: string[]) => {
      if (!accts || accts.length === 0) {
        clearInjected();
        setEvmAddress(null);
        setEvmProvider(null);
        setEvmSigner(null);
        setEvmChainId(null);
        setActiveChain('solana');
        return;
      }
      syncInjectedState(raw).catch((e) => console.error('Wallet sync failed:', e));
    };
    const handleChainChanged = () => {
      syncInjectedState(raw).catch((e) => console.error('Wallet sync failed:', e));
    };

    raw.on?.('accountsChanged', handleAccountsChanged);
    raw.on?.('chainChanged', handleChainChanged);
    injectedCleanupRef.current = () => {
      raw.removeListener?.('accountsChanged', handleAccountsChanged);
      raw.removeListener?.('chainChanged', handleChainChanged);
    };

    // Defer chain switch until next tick so Trust Wallet (and similar) fully settle
    // their internal state after the account-approval popup before we ask them to
    // switch networks. This avoids silent failures on desktop extension builds.
    setTimeout(() => {
      if (injectedProviderRef.current !== raw) return;
      requestChainSwitch(raw, chainId)
        .then(() => syncInjectedState(raw).catch(() => {}))
        .catch((switchErr: any) =>
          console.warn('Chain switch after connect was not completed:', switchErr?.code, switchErr?.message)
        );
    }, 150);
  }, [clearInjected, setActiveChain, setEvmChainId, syncInjectedState]);

  const connectEVM = useCallback(async (chainId: number) => {
    try {
      setActiveChain('evm');
      pendingChainId.current = chainId;

      if (injectedProviderRef.current) {
        await switchChain(chainId);
        pendingChainId.current = null;
        return;
      }

      if (!authenticated) {
        login();
        return;
      }

      // Already authenticated — switch chain directly
      if (wallets.length > 0) {
        await switchChain(chainId);
        pendingChainId.current = null;
      }
    } catch (error: any) {
      console.error('EVM connection error:', error);
    }
  }, [authenticated, login, wallets, switchChain, setActiveChain]);

  const disconnectEVM = useCallback(() => {
    const wasInjected = !!injectedProviderRef.current;
    clearInjected();

    setEvmAddress(null);
    setEvmProvider(null);
    setEvmSigner(null);
    setActiveChain('solana');
    setEvmChainId(null);
    pendingChainId.current = null;

    if (!wasInjected && authenticated) {
      logout();
    }
  }, [authenticated, logout, setActiveChain, setEvmChainId, clearInjected]);

  return (
    <EVMWalletContext.Provider value={{
      evmAddress,
      evmProvider,
      evmSigner,
      isEVMConnected: !!evmAddress,
      connectEVM,
      connectInjected,
      disconnectEVM,
      switchChain,
      getLatest,
    }}>
      {children}
    </EVMWalletContext.Provider>
  );
};

export const useEVMWallet = () => {
  const ctx = useContext(EVMWalletContext);
  if (!ctx) throw new Error('useEVMWallet must be used within EVMWalletProvider');
  return ctx;
};
