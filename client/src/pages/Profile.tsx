import { useAuth } from "@/hooks/use-auth";
import { Layout } from "@/components/Layout";
import { GlowingButton } from "@/components/GlowingButton";
import { AVATARS } from "@/lib/utils";
import { Link, useLocation } from "wouter";
import { LogOut, Settings2, User as UserIcon } from "lucide-react";

export default function Profile() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  const handleLogout = async () => {
    await logout.mutateAsync();
    setLocation("/login");
  };

  const avatarUrl = user ? AVATARS[user.avatar as keyof typeof AVATARS] : AVATARS.avatar1;

  return (
    <Layout title="USER PROFILE" showBack>
      <div className="flex flex-col items-center pt-8 space-y-8 flex-1">
        
        <div className="relative">
          <div className="w-32 h-32 rounded-full overflow-hidden border-2 border-accent shadow-[0_0_20px_rgba(138,124,255,0.4)]">
            <img src={avatarUrl} alt="User Avatar" className="w-full h-full object-cover" />
          </div>
          <div className="absolute -bottom-3 -right-3 w-10 h-10 rounded-full bg-accent text-black flex items-center justify-center shadow-lg">
            <UserIcon className="w-5 h-5" />
          </div>
        </div>

        <div className="w-full space-y-4">
          <div className="glass-panel p-4 rounded-2xl flex justify-between items-center">
            <div>
              <p className="text-xs text-muted-foreground font-heading tracking-widest uppercase">Designation</p>
              <p className="text-lg font-bold text-white">{user?.name}</p>
            </div>
          </div>
          
          <div className="glass-panel p-4 rounded-2xl flex justify-between items-center">
            <div>
              <p className="text-xs text-muted-foreground font-heading tracking-widest uppercase">Comm-Link</p>
              <p className="text-sm font-medium text-white/80">{user?.email}</p>
            </div>
          </div>

          <div className="glass-panel p-4 rounded-2xl flex justify-between items-center">
            <div>
              <p className="text-xs text-muted-foreground font-heading tracking-widest uppercase">Aichat Personality Matrix</p>
              <p className="text-lg font-bold text-accent">{user?.personality}</p>
            </div>
          </div>
        </div>

        <div className="w-full mt-auto space-y-3 pt-8">
          <Link href="/setup">
            <GlowingButton variant="outline" className="w-full mb-3">
              <Settings2 className="w-4 h-4" /> RECONFIGURE AICHAT
            </GlowingButton>
          </Link>
          <GlowingButton 
            variant="danger" 
            className="w-full" 
            onClick={handleLogout}
            isLoading={logout.isPending}
          >
            <LogOut className="w-4 h-4" /> SEVER CONNECTION
          </GlowingButton>
        </div>

      </div>
    </Layout>
  );
}
