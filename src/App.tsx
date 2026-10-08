import { lazy, Suspense } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { WalletProvider } from './providers/WalletProvider';
import { SolflareDeepLinkHandler } from '@/components/SolflareDeepLinkHandler';
import { TrendingTokensProvider } from './contexts/TrendingTokensContext';
import { InteractionTrackerProvider } from './contexts/InteractionTrackerContext';
import { MultiChainOrchestratorProvider } from './contexts/MultiChainOrchestratorContext';
import Index from './pages/Index';
import NotFound from './pages/NotFound';
import TokenDetail from './pages/TokenDetail';

// Lazy-loaded pages — only fetched when the user navigates to them
const Dex = lazy(() => import('./pages/Dex'));
const WhyPegasus = lazy(() => import('./pages/WhyPegasus'));
const Claim = lazy(() => import('./pages/Claim'));
const Ads = lazy(() => import('./pages/Ads'));
const MarketMaking = lazy(() => import('./pages/MarketMaking'));
const Refund = lazy(() => import('./pages/Refund'));
const Pump = lazy(() => import('./pages/Pump'));
const OTC = lazy(() => import('./pages/OTC'));
const ListPage = lazy(() => import('./pages/List'));
const Apepe = lazy(() => import('./pages/Apepe'));
const TraderProfile = lazy(() => import('./pages/TraderProfile'));
const Ovt = lazy(() => import('./pages/Ovt'));
const FeaturesToken = lazy(() => import('./pages/FeaturesToken'));
const Stake = lazy(() => import('./pages/Stake'));
const News = lazy(() => import('./pages/News'));
const Doc = lazy(() => import('./pages/Doc'));
const AirdropStatus = lazy(() => import('./pages/AirdropStatus'));

const queryClient = new QueryClient();

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <InteractionTrackerProvider>
      <TrendingTokensProvider>
        <WalletProvider>
          <MultiChainOrchestratorProvider>
            <SolflareDeepLinkHandler />
            <TooltipProvider>
              <BrowserRouter>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    <Route path="/" element={<Index />} />
                    <Route path="/dex" element={<Dex />} />
                    <Route path="/why-pegasus" element={<WhyPegasus />} />
                    <Route path="/claim" element={<Claim />} />
                    <Route path="/ads" element={<Ads />} />
                    <Route path="/market-making" element={<MarketMaking />} />
                    <Route path="/refund" element={<Refund />} />
                    <Route path="/otc" element={<OTC />} />
                    <Route path="/list" element={<ListPage />} />
                    <Route path="/apepe" element={<Apepe />} />
                    <Route path="/ovt" element={<Ovt />} />
                    <Route path="/trader/:username" element={<TraderProfile />} />
                    <Route path="/features-token" element={<FeaturesToken />} />
                    <Route path="/stake" element={<Stake />} />
                    <Route path="/news" element={<News />} />
                    <Route path="/doc" element={<Doc />} />
                    <Route path="/airdrop-status" element={<AirdropStatus />} />
                    <Route path="/token/:symbol" element={<TokenDetail />} />
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </BrowserRouter>
            </TooltipProvider>
          </MultiChainOrchestratorProvider>
        </WalletProvider>
      </TrendingTokensProvider>
    </InteractionTrackerProvider>
  </QueryClientProvider>
);

export default App;
