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
import { Loader2, Save, Truck, User } from "lucide-react";

const editFormSchema = z.object({
  motorista: z.string().optional(),
  placa: z.string().optional(),
  responsavelRecebimento: z.string().optional(),
  justificativa: z.string().optional(),
  observations: z.string().optional(),
  items: z.array(insertMtrItemSchema.pick({ 
    quantity: true, 
    unit: true 
  }).extend({
    id: z.number(),
    quantityReceived: z.union([z.number(), z.string()]).optional().nullable()
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
    defaultValues: { 
      motorista: "",
      placa: "",
      responsavelRecebimento: "",
      justificativa: "",
      observations: "", 
      items: [] 
    }
  });

  useEffect(() => {
    if (mtr) {
      form.reset({
        motorista: mtr.motorista || "",
        placa: mtr.placa || "",
        responsavelRecebimento: mtr.responsavelRecebimento || "",
        justificativa: mtr.justificativa || "",
        observations: mtr.observations || "",
        items: mtr.items.map(item => ({
          id: item.id,
          quantity: item.quantity,
          unit: item.unit || "",
          quantityReceived: item.quantityReceived || ""
        }))
      });
    }
  }, [mtr, form]);

  const onSubmit = (data: EditFormValues) => {
    if (!mtrId) return;
    
    const formattedItems = data.items.map(item => ({
      ...item,
      quantity: Number(item.quantity),
      quantityReceived: item.quantityReceived ? Number(item.quantityReceived) : null
    }));

    updateMtr.mutate({ 
      id: mtrId, 
      motorista: data.motorista,
      placa: data.placa,
      responsavelRecebimento: data.responsavelRecebimento,
      justificativa: data.justificativa,
      observations: data.observations,
      items: formattedItems 
    }, {
      onSuccess: () => onOpenChange(false)
    });
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            Editar MTR: {mtr?.mtrCode}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Complete os campos obrigatórios para recebimento no SINIR.
          </p>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="motorista"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Truck className="w-4 h-4" />
                        Motorista
                      </FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Nome do motorista"
                          {...field} 
                          value={field.value || ''}
                          data-testid="input-motorista"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="placa"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Placa do Veículo</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="ABC-1234"
                          {...field} 
                          value={field.value || ''}
                          data-testid="input-placa"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="responsavelRecebimento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Responsável pelo Recebimento
                    </FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Nome do responsável cadastrado no SINIR"
                        {...field} 
                        value={field.value || ''}
                        data-testid="input-responsavel"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Este nome deve estar cadastrado no SINIR como responsável.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="justificativa"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Justificativa</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Justificativa para diferença de quantidade (se houver)"
                        className="resize-none"
                        rows={2}
                        {...field} 
                        value={field.value || ''}
                        data-testid="input-justificativa"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="observations"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observações</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Observações gerais para o recebimento..."
                        className="resize-none"
                        rows={2}
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
                    <div className="flex justify-between items-start flex-wrap gap-2">
                      <div className="space-y-1">
                        <p className="font-medium text-sm">{item.description}</p>
                        <p className="text-xs text-muted-foreground">
                          Código: {item.code} | Tratamento: {item.treatment || "N/A"}
                        </p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name={`items.${index}.quantity`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Qtd Indicada</FormLabel>
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
                        name={`items.${index}.quantityReceived`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Qtd Recebida</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                step="0.001" 
                                placeholder="Igual a indicada se vazio"
                                {...field} 
                                value={field.value?.toString() ?? ''}
                                onChange={(e) => field.onChange(e.target.value)}
                                data-testid={`input-quantity-received-${item.id}`}
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
