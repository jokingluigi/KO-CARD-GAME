import { type ReactNode, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Admin from '@/pages/admin';
import Home from '@/pages/home';
import Decks from '@/pages/decks';
import Collection from '@/pages/collection';
import Packs from '@/pages/packs';
import Shop from '@/pages/shop';
import Online from '@/pages/online';
import OnlineQuick from '@/pages/online-quick';
import OnlineFriendly from '@/pages/online-friendly';
import OnlineMatch from '@/pages/online-match';
import DailyQuests from '@/pages/daily-quests';
import Attendance from '@/pages/attendance';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';
import { audioManager } from '@/audio/audio-manager';
import { readStoredBgmMute, readStoredBgmVolume } from '@/audio/audio-settings';
import { musicContextForPath, shouldLoadMainBgm } from '@/audio/music-route';
import { fetchMainContent } from '@/lib/main-content-client';

const queryClient = new QueryClient();

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/admin" component={Admin} />
        <Route path="/admin/packs" component={Admin} />
        <Route path="/admin/shop" component={Admin} />
        <Route path="/admin/prism" component={Admin} />
        <Route path="/admin/skins" component={Admin} />
        <Route path="/admin/card-frames" component={Admin} />
        <Route path="/admin/ai-decks" component={Admin} />
        <Route path="/admin/rewards" component={Admin} />
        <Route path="/admin/notices" component={Admin} />
        <Route path="/ai-match" component={Home} />
        <Route path="/online/match/:matchId" component={OnlineMatch} />
        <Route path="/daily-quests" component={DailyQuests} />
        <Route path="/attendance" component={Attendance} />
        <Route path="/online/quick" component={OnlineQuick} />
        <Route path="/online/friendly" component={OnlineFriendly} />
        <Route path="/online" component={Online} />
        <Route path="/decks" component={Decks} />
        <Route path="/collection" component={Collection} />
        <Route path="/packs" component={Packs} />
        <Route path="/shop" component={Shop} />
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function GlobalAudioBridge() {
  const [location] = useLocation();

  useEffect(() => {
    audioManager.setBgmVolume(readStoredBgmVolume());
    audioManager.setBgmMuted(readStoredBgmMute());
  }, []);

  useEffect(() => {
    audioManager.setMusicContext(musicContextForPath(location));
  }, [location]);

  useEffect(() => {
    if (!shouldLoadMainBgm(location)) return;
    let cancelled = false;
    void fetchMainContent()
      .then((content) => {
        if (cancelled || !content.bgm) return;
        audioManager.playBgm(content.bgm.assetUrl, content.bgm.volume);
      })
      .catch((error) => {
        if (!cancelled) console.warn('메인 BGM을 불러오지 못했습니다.', error);
      });
    return () => {
      cancelled = true;
    };
  }, [location]);

  useEffect(() => {
    const unlock = () => audioManager.unlockAudio();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  return null;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <GlobalAudioBridge />
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
