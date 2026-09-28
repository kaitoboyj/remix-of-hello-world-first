import { useEffect, useState } from 'react';

export interface InjectedWallet {
  /** Stable identifier (rdns when available) */
  id: string;
  name: string;
  icon?: string;
  provider: any;
}

interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

interface EIP6963AnnounceEvent extends CustomEvent {
  detail: {
    info: EIP6963ProviderInfo;
    provider: any;
  };
}

const nameFromFlags = (p: any, rdnsHint?: string): string | null => {
  if (!p) return null;
  if (rdnsHint) {
    const r = rdnsHint.toLowerCase();
    if (r.includes('trustwallet') || r.includes('trust')) return 'Trust Wallet';
    if (r.includes('coinbase') || r === 'com.coinbase.wallet') return 'Coinbase Wallet';
    if (r.includes('metamask') || r === 'io.metamask') return 'MetaMask';
    if (r.includes('rabby')) return 'Rabby';
    if (r.includes('brave')) return 'Brave Wallet';
    if (r.includes('phantom')) return 'Phantom';
    if (r.includes('okx') || r.includes('okex')) return 'OKX Wallet';
    if (r.includes('bitkeep') || r.includes('bitget')) return 'Bitget Wallet';
  }
  if (p.isTrust || p.isTrustWallet) return 'Trust Wallet';
  if (p.isCoinbaseWallet) return 'Coinbase Wallet';
  if (p.isRabby) return 'Rabby';
  if (p.isBraveWallet) return 'Brave Wallet';
  if (p.isPhantom) return 'Phantom';
  if (p.isOkxWallet || p.isOKExWallet) return 'OKX Wallet';
  if (p.isBitKeep) return 'Bitget Wallet';
  if (p.isMetaMask) return 'MetaMask';
  return null;
};

type WalletMap = Map<string, InjectedWallet>;

const isTrustRdns = (id?: string) => {
  if (!id) return false;
  const r = id.toLowerCase();
  return r.includes('trustwallet') || r === 'com.trustwallet.app' || r === 'app.trustwallet';
};
const isTrustName = (name?: string) => !!name && name.toLowerCase().includes('trust');

const addWallet = (found: WalletMap, wallet: InjectedWallet) => {
  if (!wallet?.provider) return false;
  const key = wallet.id.toLowerCase();
  const existing = found.get(key);
  if (existing) {
    const existingTrust = isTrustRdns(existing.id) || isTrustName(existing.name);
    const newTrust = isTrustRdns(wallet.id) || isTrustName(wallet.name);
    // Prefer EIP-6963-style (has icon) Trust provider over legacy global
    if (newTrust && existingTrust && wallet.icon && !existing.icon) {
      found.set(key, wallet);
      return true;
    }
    if (!wallet.icon) return false;
  }
  found.set(key, wallet);
  return true;
};

const dedupeByName = (list: InjectedWallet[]): InjectedWallet[] => {
  const byName = new Map<string, InjectedWallet>();
  list.forEach((w) => {
    const key = w.name.toLowerCase();
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, w);
      return;
    }
    const existingTrust = isTrustRdns(existing.id) || isTrustName(existing.name);
    const newTrust = isTrustRdns(w.id) || isTrustName(w.name);
    if (newTrust && existingTrust) {
      // For Trust Wallet specifically, prefer entries whose id looks like an EIP-6963 rdns
      // (these use the canonical desktop extension provider). The legacy window.trustwallet
      // global sometimes lacks proper popup activation on desktop builds.
      const newLooksLikeRdns = w.id.includes('.') && !w.id.startsWith('legacy:');
      const existingLooksLikeRdns = existing.id.includes('.') && !existing.id.startsWith('legacy:');
      if (newLooksLikeRdns && !existingLooksLikeRdns) {
        byName.set(key, w);
        return;
      }
      if (w.icon && !existing.icon) {
        byName.set(key, w);
        return;
      }
      return;
    }
    if (!existing.icon && w.icon) byName.set(key, w);
  });
  return Array.from(byName.values());
};

const scanLegacyInternal = (found: WalletMap) => {
  if (typeof window === 'undefined') return;
  const w = window as any;

  const trust = w.trustwallet || w.trustWallet || w.TrustWallet;
  if (trust && typeof trust.request === 'function') {
    addWallet(found, { id: 'legacy:trust', name: 'Trust Wallet', provider: trust });
  }

  const eth = w.ethereum;
  const candidates: any[] = Array.isArray(eth?.providers) ? [...eth.providers] : [];
  if (eth) candidates.push(eth);

  candidates.forEach((p, index) => {
    const name = nameFromFlags(p);
    if (!name) {
      if (p === eth && candidates.length === 1) {
        addWallet(found, { id: 'legacy:injected', name: 'Browser Wallet', provider: p });
      }
      return;
    }
    addWallet(found, {
      id: `legacy:${name}:${index === candidates.length - 1 ? 'main' : index}`,
      name,
      provider: p,
    });
  });
};

const PREMOUNT_BUFFER_KEY = '__eip6963_premount_buffer__';

const getPremountBuffer = (): { wallets: WalletMap; listener: EventListener | null } => {
  if (typeof window === 'undefined') return { wallets: new Map(), listener: null };
  const anyWin = window as any;
  if (!anyWin[PREMOUNT_BUFFER_KEY]) {
    const wallets: WalletMap = new Map();
    const listener: EventListener = (event: Event) => {
      const { info, provider } = (event as EIP6963AnnounceEvent).detail || ({} as any);
      if (!info || !provider) return;
      const normalizedName =
        nameFromFlags(provider, info.rdns) || info.name;
      addWallet(wallets, {
        id: info.rdns || info.name,
        name: normalizedName,
        icon: info.icon,
        provider,
      });
    };
    anyWin[PREMOUNT_BUFFER_KEY] = { wallets, listener };
    window.addEventListener('eip6963:announceProvider', listener);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    scanLegacyInternal(wallets);
  }
  return anyWin[PREMOUNT_BUFFER_KEY];
};

if (typeof window !== 'undefined') {
  getPremountBuffer();
}

/**
 * Detects EVM browser-extension wallets ourselves instead of relying on a third-party
 * modal. Uses EIP-6963 (the modern standard, which is how Trust Wallet's extension
 * announces itself when MetaMask has taken over `window.ethereum`) and falls back to
 * legacy globals for older extensions.
 */
export const useInjectedWallets = (): InjectedWallet[] => {
  const [wallets, setWallets] = useState<InjectedWallet[]>(() => {
    const premount = getPremountBuffer();
    return dedupeByName(Array.from(premount.wallets.values()));
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const premount = getPremountBuffer();
    const found: WalletMap = new Map(premount.wallets);

    const publish = () => setWallets(dedupeByName(Array.from(found.values())));

    const add = (wallet: InjectedWallet) => {
      if (addWallet(found, wallet)) publish();
    };

    const onAnnounce = (event: Event) => {
      const { info, provider } = (event as EIP6963AnnounceEvent).detail || ({} as any);
      if (!info || !provider) return;
      const normalizedName =
        nameFromFlags(provider, info.rdns) || info.name;
      add({
        id: info.rdns || info.name,
        name: normalizedName,
        icon: info.icon,
        provider,
      });
    };

    window.addEventListener('eip6963:announceProvider', onAnnounce as EventListener);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    const scanLegacy = () => {
      const before = found.size;
      scanLegacyInternal(found);
      if (found.size !== before) publish();
    };

    scanLegacy();

    const timers = [150, 500, 1200, 2500, 5000].map((delay) =>
      window.setTimeout(() => {
        window.dispatchEvent(new Event('eip6963:requestProvider'));
        scanLegacy();
      }, delay)
    );

    publish();

    return () => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce as EventListener);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  return wallets;
};
