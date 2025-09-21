import { Switch, Route, Router as WouterRouter } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import NotFound from "@/pages/not-found";
import Startup from "@/pages/startup";
import Setup from "@/pages/setup";
import Coaching from "@/pages/coaching";
import Results from "@/pages/results";

function Routes() {
  return (
    <Switch>
      <Route path="/" component={Startup} />
      <Route path="/setup" component={Setup} />
      <Route path="/coaching/:sessionId" component={Coaching} />
      <Route path="/results/:sessionId" component={Results} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        {/* Hash routing makes it work in a WebView (file://) */}
        <WouterRouter hook={useHashLocation}>
          <Routes />
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
