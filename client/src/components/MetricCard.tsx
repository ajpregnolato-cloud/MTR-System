import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  color?: "primary" | "success" | "warning" | "destructive";
}

export function MetricCard({ title, value, icon: Icon, trend, trendUp, color = "primary" }: MetricCardProps) {
  const colorStyles = {
    primary: "bg-primary/10 text-primary border-primary/20",
    success: "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/30",
    warning: "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/30",
    destructive: "bg-red-50 text-red-600 border-red-200 dark:bg-red-950/30",
  };

  return (
    <div className={cn(
      "relative overflow-hidden rounded-xl border p-6 bg-card transition-all duration-300 hover:shadow-lg",
      "hover:border-primary/20"
    )}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="mt-2 flex items-baseline gap-2">
            <h3 className="text-2xl font-bold font-display tracking-tight text-foreground">{value}</h3>
            {trend && (
              <span className={cn(
                "text-xs font-medium px-1.5 py-0.5 rounded-full",
                trendUp ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
              )}>
                {trend}
              </span>
            )}
          </div>
        </div>
        <div className={cn("p-3 rounded-xl border shadow-sm", colorStyles[color])}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      
      {/* Decorative gradient overlay */}
      <div className={cn(
        "absolute -right-6 -bottom-6 w-24 h-24 rounded-full opacity-10 blur-2xl",
        color === "primary" && "bg-blue-500",
        color === "success" && "bg-emerald-500",
        color === "warning" && "bg-amber-500",
        color === "destructive" && "bg-red-500",
      )} />
    </div>
  );
}
