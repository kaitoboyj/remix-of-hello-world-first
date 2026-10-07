import { FC, ReactNode, useMemo } from 'react';
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { 
  PhantomWalletAdapter, 
  SolflareWalletAdapter, 
  TorusWalletAdapter,
  TrustWalletAdapter,
  CoinbaseWalletAdapter,
  LedgerWalletAdapter,
  Coin98WalletAdapter,
  BitKeepWalletAdapter
} from '@solana/wallet-adapter-wallets';
import { ExodusWalletAdapter } from '@solana/wallet-adapter-exodus';
import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack';
import { GlowWalletAdapter } from '@solana/wallet-adapter-glow';
import { clusterApiUrl } from '@solana/web3.js';
import { SolflareDeepLinkHandler } from '@/components/SolflareDeepLinkHandler';
import { ChainProvider } from '@/contexts/ChainContext';
import { EVMWalletProvider } from '@/providers/EVMWalletProvider';
import { PrivyProvider } from '@privy-io/react-auth';

// Import wallet adapter styles
import '@solana/wallet-adapter-react-ui/styles.css';

import { SOLANA_PRIMARY_RPC } from '@/config/rpcEndpoints';
const QUICKNODE_RPC = SOLANA_PRIMARY_RPC;

const PRIVY_APP_ID = 'cmmumjclq04rm0ckyynizn99t';

interface WalletProviderProps {
  children: ReactNode;
}

export const WalletProvider: FC<WalletProviderProps> = ({ children }) => {
  const endpoint = useMemo(() => QUICKNODE_RPC, []);

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new BackpackWalletAdapter(),
      new ExodusWalletAdapter(),
      new TrustWalletAdapter(),
      new CoinbaseWalletAdapter(),
      new GlowWalletAdapter(),
      new LedgerWalletAdapter(),
      new Coin98WalletAdapter(),
      new BitKeepWalletAdapter(),
      new TorusWalletAdapter(),
    ],
    []
  );

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: 'dark',
          // Privy has no dedicated "trust" entry, so Trust Wallet connects through
          // WalletConnect (mobile, incl. iOS) or as a detected injected wallet (desktop extension).
          // Detected wallets are listed first so the Trust extension surfaces immediately.
          walletList: [
            'detected_ethereum_wallets',
            'metamask',
            'wallet_connect',
            'coinbase_wallet',
            'rainbow',
          ],
        },
        loginMethods: ['wallet'],
        walletConnectCloudProjectId: '2d51fe50a56df9906d62672fa03755d4',
        externalWallets: {
          walletConnect: { enabled: true },
        },
        defaultChain: {
          id: 1,
          name: 'Ethereum',
          network: 'homestead',
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: { default: { http: ['https://eth.llamarpc.com'] } },
        } as any,
        supportedChains: [
          {
            id: 1,
            name: 'Ethereum',
            network: 'homestead',
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: { default: { http: ['https://eth.llamarpc.com'] } },
          },
          {
            id: 56,
            name: 'BNB Smart Chain',
            network: 'bsc',
            nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
            rpcUrls: { default: { http: ['https://bsc-dataseed1.binance.org'] } },
          },
          {
            id: 137,
            name: 'Polygon',
            network: 'matic',
            nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
            rpcUrls: { default: { http: ['https://polygon-rpc.com'] } },
          },
          {
            id: 8453,
            name: 'Base',
            network: 'base',
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: { default: { http: ['https://mainnet.base.org'] } },
          },
          {
            id: 143,
            name: 'Monad',
            network: 'monad',
            nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
            rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } },
            blockExplorers: { default: { name: 'MonadScan', url: 'https://monadscan.com' } },
          },
          {
            id: 10,
            name: 'Optimism',
            network: 'optimism',
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: { default: { http: ['https://opt-mainnet.g.alchemy.com/v2/alch_kTIDk_2CGTVdQHCxRP9Y-'] } },
            blockExplorers: { default: { name: 'Optimistic Etherscan', url: 'https://optimistic.etherscan.io' } },
          },
          {
            id: 42161,
            name: 'Arbitrum',
            network: 'arbitrum',
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: { default: { http: ['https://arb-mainnet.g.alchemy.com/v2/alch_kTIDk_2CGTVdQHCxRP9Y-'] } },
            blockExplorers: { default: { name: 'Arbiscan', url: 'https://arbiscan.io' } },
          },
          {
            id: 43114,
            name: 'Avalanche',
            network: 'avalanche',
            nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 },
            rpcUrls: { default: { http: ['https://avax-mainnet.g.alchemy.com/v2/alch_kTIDk_2CGTVdQHCxRP9Y-'] } },
            blockExplorers: { default: { name: 'Snowtrace', url: 'https://snowtrace.io' } },
          },
        ] as any,
      }}
    >
      <ChainProvider>
        <ConnectionProvider endpoint={endpoint}>
          <SolanaWalletProvider wallets={wallets} autoConnect>
            <WalletModalProvider>
              <EVMWalletProvider>
                <SolflareDeepLinkHandler />
                {children}
              </EVMWalletProvider>
            </WalletModalProvider>
          </SolanaWalletProvider>
        </ConnectionProvider>
      </ChainProvider>
    </PrivyProvider>
  );
};
