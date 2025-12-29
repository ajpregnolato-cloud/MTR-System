import { useLogs } from "@/hooks/use-logs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, Info, XCircle } from "lucide-react";

export default function Logs() {
  const { data: logs, isLoading } = useLogs(100);

  const getLevelColor = (level: string) => {
    switch(level) {
      case 'ERROR': return 'text-red-600 bg-red-50 border-red-100';
      case 'WARN': return 'text-amber-600 bg-amber-50 border-amber-100';
      default: return 'text-blue-600 bg-blue-50 border-blue-100';
    }
  };

  const getLevelIcon = (level: string) => {
    switch(level) {
      case 'ERROR': return XCircle;
      case 'WARN': return AlertCircle;
      default: return Info;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold font-display text-slate-900">System Logs</h1>
          <p className="text-slate-500 mt-1">Audit trail of imports, validations, and API interactions.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[600px]">
            <Table>
              <TableHeader className="bg-slate-50 sticky top-0">
                <TableRow>
                  <TableHead className="w-[180px]">Timestamp</TableHead>
                  <TableHead className="w-[100px]">Level</TableHead>
                  <TableHead className="w-[150px]">Category</TableHead>
                  <TableHead>Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={4} className="h-12 animate-pulse bg-slate-100/50" />
                    </TableRow>
                  ))
                ) : logs?.map((log) => {
                  const Icon = getLevelIcon(log.level || 'INFO');
                  return (
                    <TableRow key={log.id} className="hover:bg-slate-50/50">
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {log.timestamp ? format(new Date(log.timestamp), 'dd/MM/yyyy HH:mm:ss') : '-'}
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border",
                          getLevelColor(log.level || 'INFO')
                        )}>
                          <Icon className="w-3 h-3" />
                          {log.level}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium text-xs text-slate-600">
                        {log.category}
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.message}
                        {log.details && (
                          <pre className="mt-1 text-xs text-muted-foreground bg-slate-100 p-2 rounded overflow-x-auto max-w-xl">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
