import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertMtrItemSchema } from "@shared/schema";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useUpdateMtr, useMtr } from "@/hooks/use-mtrs";
import { Loader2, Save } from "lucide-react";

const editFormSchema = z.object({
  observations: z.string().optional(),
  items: z.array(insertMtrItemSchema.pick({ 
    quantity: true, 
    unit: true 
  }).extend({
    id: z.number()
  }))
});

type EditFormValues = z.infer<typeof editFormSchema>;

interface MtrEditDialogProps {
  mtrId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MtrEditDialog({ mtrId, open, onOpenChange }: MtrEditDialogProps) {
  const { data: mtr, isLoading } = useMtr(mtrId);
  const updateMtr = useUpdateMtr();

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editFormSchema),
    defaultValues: { observations: "", items: [] }
  });

  useEffect(() => {
    if (mtr) {
      form.reset({
        observations: mtr.observations || "",
        items: mtr.items.map(item => ({
          id: item.id,
          quantity: item.quantity,
          unit: item.unit || ""
        }))
      });
    }
  }, [mtr, form]);

  const onSubmit = (data: EditFormValues) => {
    if (!mtrId) return;
    
    const formattedItems = data.items.map(item => ({
      ...item,
      quantity: Number(item.quantity)
    }));

    updateMtr.mutate({ 
      id: mtrId, 
      observations: data.observations,
      items: formattedItems 
    }, {
      onSuccess: () => onOpenChange(false)
    });
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            Editar MTR: {mtr?.mtrCode}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Atualize as quantidades e unidades dos itens de resíduo.
          </p>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="observations"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observações (enviado ao SINIR)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Digite as observações que serão enviadas junto com o recebimento do MTR..."
                        className="resize-none"
                        rows={3}
                        {...field} 
                        value={field.value || ''}
                        data-testid="input-observations"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-4">
                <p className="text-sm font-medium text-muted-foreground">Itens de Resíduo</p>
                {mtr?.items.map((item, index) => (
                  <div key={item.id} className="p-4 rounded-lg border bg-muted/20 space-y-3">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <p className="font-medium text-sm">{item.description}</p>
                        <p className="text-xs text-muted-foreground">Código: {item.code}</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name={`items.${index}.quantity`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Quantidade</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                step="0.001" 
                                {...field} 
                                value={field.value?.toString() ?? ''}
                                data-testid={`input-quantity-${item.id}`}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name={`items.${index}.unit`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Unidade</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ''} data-testid={`input-unit-${item.id}`} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" type="button" onClick={() => onOpenChange(false)} data-testid="button-cancel-edit">
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={updateMtr.isPending}
                  className="bg-primary hover:bg-primary/90 text-white"
                  data-testid="button-save-mtr"
                >
                  {updateMtr.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Save className="mr-2 h-4 w-4" />
                  Salvar Alterações
                </Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
