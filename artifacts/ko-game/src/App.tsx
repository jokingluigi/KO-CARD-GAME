import { type ReactNode } from 'react';
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
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

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
        <Route path="/ai-match" component={Home} />
        <Route path="/online/match/:matchId" component={OnlineMatch} />
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

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
