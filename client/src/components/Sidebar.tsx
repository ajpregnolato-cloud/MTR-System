import { Link, useLocation } from "wouter";
import { LayoutDashboard, FileText, Settings, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { label: "Painel Principal", href: "/", icon: LayoutDashboard },
  { label: "Logs e Auditoria", href: "/logs", icon: FileText },
  { label: "Configurações", href: "/config", icon: Settings },
  { label: "Status da API", href: "/status", icon: ShieldAlert, disabled: true },
];

export function Sidebar() {
  const [location] = useLocation();

  return (
    <div className="w-64 border-r bg-card h-screen flex flex-col sticky top-0">
      <div className="p-6 border-b">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <span className="font-bold text-primary">M</span>
          </div>
          <span className="font-bold text-lg font-display tracking-tight">MTR Receiver</span>
        </div>
      </div>
      
      <nav className="flex-1 p-4 space-y-1">
        {items.map((item) => (
          <Link 
            key={item.href} 
            href={item.disabled ? "#" : item.href}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              location === item.href 
                ? "bg-primary/10 text-primary" 
                : "text-muted-foreground hover:bg-slate-100 hover:text-foreground",
              item.disabled && "opacity-50 cursor-not-allowed hover:bg-transparent hover:text-muted-foreground"
            )}
            data-testid={`link-sidebar-${item.href.replace('/', '') || 'home'}`}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </Link>
        ))}
      </nav>
      
      <div className="p-4 border-t">
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
          <p className="text-xs font-semibold text-slate-900 mb-1">Status do Sistema</p>
          <div className="flex items-center gap-2 text-xs text-emerald-600">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Operacional
          </div>
        </div>
      </div>
    </div>
  );
}
