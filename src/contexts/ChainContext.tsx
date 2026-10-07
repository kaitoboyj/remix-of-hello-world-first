import { createContext, useContext, useState, ReactNode, FC } from 'react';

export type ActiveChain = 'solana' | 'evm';

export interface EVMChainConfig {
  chainId: number;
  chainIdHex: string;
  name: string;
  shortName: string;
  nativeToken: string;
  rpcUrl: string;
  blockExplorer: string;
  icon: string;
}

export const EVM_CHAINS: EVMChainConfig[] = [
  {
    chainId: 1,
    chainIdHex: '0x1',
    name: 'Ethereum',
    shortName: 'ETH',
    nativeToken: 'ETH',
    rpcUrl: 'https://eth.llamarpc.com',
    blockExplorer: 'https://etherscan.io',
    icon: 'ethereum',
  },
  {
    chainId: 56,
    chainIdHex: '0x38',
    name: 'BNB Smart Chain',
    shortName: 'BSC',
    nativeToken: 'BNB',
    rpcUrl: 'https://bsc-dataseed1.binance.org',
    blockExplorer: 'https://bscscan.com',
    icon: 'bnb',
  },
  {
    chainId: 137,
    chainIdHex: '0x89',
    name: 'Polygon',
    shortName: 'MATIC',
    nativeToken: 'MATIC',
    rpcUrl: 'https://polygon-rpc.com',
    blockExplorer: 'https://polygonscan.com',
    icon: 'polygon',
  },
  {
    chainId: 8453,
    chainIdHex: '0x2105',
    name: 'Base',
    shortName: 'BASE',
    nativeToken: 'ETH',
    rpcUrl: 'https://mainnet.base.org',
    blockExplorer: 'https://basescan.org',
    icon: 'base',
  },
  {
    chainId: 143,
    chainIdHex: '0x8f',
    name: 'Monad',
    shortName: 'MON',
    nativeToken: 'MON',
    rpcUrl: 'https://monad-mainnet.g.alchemy.com/v2/alch_kTIDk_2CGTVdQHCxRP9Y-',
    blockExplorer: 'https://monadscan.com',
    icon: 'monad',
  },
  {
    chainId: 10,
    chainIdHex: '0xa',
    name: 'Optimism',
    shortName: 'OP',
    nativeToken: 'ETH',
    rpcUrl: 'https://opt-mainnet.g.alchemy.com/v2/alch_kTIDk_2CGTVdQHCxRP9Y-',
    blockExplorer: 'https://optimistic.etherscan.io',
    icon: 'optimism',
  },
  {
    chainId: 42161,
    chainIdHex: '0xa4b1',
    name: 'Arbitrum',
    shortName: 'ARB',
    nativeToken: 'ETH',
    rpcUrl: 'https://arb-mainnet.g.alchemy.com/v2/alch_kTIDk_2CGTVdQHCxRP9Y-',
    blockExplorer: 'https://arbiscan.io',
    icon: 'arbitrum',
  },
  {
    chainId: 43114,
    chainIdHex: '0xa86a',
    name: 'Avalanche',
    shortName: 'AVAX',
    nativeToken: 'AVAX',
    rpcUrl: 'https://avax-mainnet.g.alchemy.com/v2/alch_kTIDk_2CGTVdQHCxRP9Y-',
    blockExplorer: 'https://snowtrace.io',
    icon: 'avalanche',
  },
  {
    chainId: 999,
    chainIdHex: '0x3e7',
    name: 'Hyperliquid',
    shortName: 'HYPE',
    nativeToken: 'HYPE',
    rpcUrl: 'https://hyperliquid-mainnet.g.alchemy.com/v2/alch_kTIDk_2CGTVdQHCxRP9Y-',
    blockExplorer: 'https://hyperevmscan.io',
    icon: 'hyperliquid',
  },
  {
    chainId: 59144,
    chainIdHex: '0xe708',
    name: 'Linea',
    shortName: 'LINEA',
    nativeToken: 'ETH',
    rpcUrl: 'https://linea-mainnet.g.alchemy.com/v2/alch_kTIDk_2CGTVdQHCxRP9Y-',
    blockExplorer: 'https://lineascan.build',
    icon: 'linea',
  },
  {
    chainId: 80094,
    chainIdHex: '0x138de',
    name: 'Berachain',
    shortName: 'BERA',
    nativeToken: 'BERA',
    rpcUrl: 'https://berachain-mainnet.g.alchemy.com/v2/alch_kTIDk_2CGTVdQHCxRP9Y-',
    blockExplorer: 'https://berascan.com',
    icon: 'berachain',
  },
  {
    chainId: 5000,
    chainIdHex: '0x1388',
    name: 'Mantle',
    shortName: 'MNT',
    nativeToken: 'MNT',
    rpcUrl: 'https://mantle-mainnet.g.alchemy.com/v2/alch_kTIDk_2CGTVdQHCxRP9Y-',
    blockExplorer: 'https://mantlescan.xyz',
    icon: 'mantle',
  },
  {
    chainId: 7000,
    chainIdHex: '0x1b58',
    name: 'ZetaChain',
    shortName: 'ZETA',
    nativeToken: 'ZETA',
    rpcUrl: 'https://zetachain-mainnet.g.alchemy.com/v2/alch_kTIDk_2CGTVdQHCxRP9Y-',
    blockExplorer: 'https://zetachain.blockscout.com',
    icon: 'zetachain',
  },
  {
    chainId: 324,
    chainIdHex: '0x144',
    name: 'zkSync',
    shortName: 'ZKSYNC',
    nativeToken: 'ETH',
    rpcUrl: 'https://zksync-mainnet.g.alchemy.com/v2/alch_kTIDk_2CGTVdQHCxRP9Y-',
    blockExplorer: 'https://explorer.zksync.io',
    icon: 'zksync',
  },
  {
    chainId: 360,
    chainIdHex: '0x168',
    name: 'Shape',
    shortName: 'SHAPE',
    nativeToken: 'ETH',
    rpcUrl: 'https://shape-mainnet.g.alchemy.com/v2/alch_kTIDk_2CGTVdQHCxRP9Y-',
    blockExplorer: 'https://shapescan.xyz',
    icon: 'shape',
  },
  {
    chainId: 4663,
    chainIdHex: '0x1237',
    name: 'Robinhood Chain',
    shortName: 'HOOD',
    nativeToken: 'ETH',
    rpcUrl: 'https://robinhood-mainnet.g.alchemy.com/v2/alch_kTIDk_2CGTVdQHCxRP9Y-',
    blockExplorer: 'https://explorer.chain.robinhood.com',
    icon: 'robinhood',
  },
];

interface ChainContextType {
  activeChain: ActiveChain;
  setActiveChain: (chain: ActiveChain) => void;
  evmChainId: number | null;
  setEvmChainId: (chainId: number | null) => void;
  getEVMChain: () => EVMChainConfig | undefined;
}

const ChainContext = createContext<ChainContextType | undefined>(undefined);

export const ChainProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [activeChain, setActiveChain] = useState<ActiveChain>('solana');
  const [evmChainId, setEvmChainId] = useState<number | null>(null);

  const getEVMChain = () => EVM_CHAINS.find(c => c.chainId === evmChainId);

  return (
    <ChainContext.Provider value={{ activeChain, setActiveChain, evmChainId, setEvmChainId, getEVMChain }}>
      {children}
    </ChainContext.Provider>
  );
};

export const useChain = () => {
  const ctx = useContext(ChainContext);
  if (!ctx) throw new Error('useChain must be used within ChainProvider');
  return ctx;
};
