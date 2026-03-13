import { Switch, Route, Redirect, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";

// Pages
import Splash from "@/pages/Splash";
import Login from "@/pages/Login";
import Setup from "@/pages/Setup";
import Home from "@/pages/Home";
import Chat from "@/pages/Chat";
import Voice from "@/pages/Voice";
import Camera from "@/pages/Camera";
import Profile from "@/pages/Profile";
import NotFound from "@/pages/not-found";

// Auth Guard Component
function ProtectedRoute({ component: Component, ...rest }: any) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <Splash />;
  if (!user) return <Redirect to="/login" />;

  return <Component {...rest} />;
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Splash} />
      <Route path="/login" component={Login} />

      <Route path="/setup">
        {() => <ProtectedRoute component={Setup} />}
      </Route>
      <Route path="/home">
        {() => <ProtectedRoute component={Home} />}
      </Route>

      <Route path="/chat/:id">
        {() => <ProtectedRoute component={Chat} />}
      </Route>
      <Route path="/chat">
        {() => <ProtectedRoute component={Chat} />}
      </Route>
      <Route path="/voice/:id">
        {() => <ProtectedRoute component={Voice} />}
      </Route>
      <Route path="/voice">
        {() => <ProtectedRoute component={Voice} />}
      </Route>
      <Route path="/assist">
        {() => <ProtectedRoute component={Camera} />}
      </Route>
      <Route path="/camera">
        {() => <ProtectedRoute component={Camera} />}
      </Route>
      <Route path="/profile">
        {() => <ProtectedRoute component={Profile} />}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router hook={useHashLocation}>
          <AppRouter />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
