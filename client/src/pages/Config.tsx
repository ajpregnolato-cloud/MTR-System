import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Save, CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { useState } from "react";

type ConfigForm = {
  cnpj: string;
  usuario: string;
  senha: string;
  unidade: string;
  token: string;
};

type ConfigResponse = {
  cnpj: string;
  usuario: string;
  senha: string;
  unidade: string;
  token: string;
  hasPassword: boolean;
  hasToken: boolean;
  updatedAt: string | null;
};

export default function Config() {
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const { data: config, isLoading } = useQuery<ConfigResponse>({
    queryKey: ["/api/config"],
  });

  const form = useForm<ConfigForm>({
    defaultValues: {
      cnpj: "",
      usuario: "",
      senha: "",
      unidade: "",
      token: "",
    },
  });

  const { reset } = form;

  const saveMutation = useMutation({
    mutationFn: async (data: ConfigForm) => {
      return apiRequest("POST", "/api/config", data);
    },
    onSuccess: () => {
      toast({
        title: "Configuração salva",
        description: "As credenciais foram atualizadas com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/config"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/sinir/test");
      return response.json();
    },
    onSuccess: (result) => {
      if (result.success) {
        toast({
          title: "Conexão OK",
          description: result.message,
        });
      } else {
        toast({
          title: "Falha na conexão",
          description: result.message,
          variant: "destructive",
        });
      }
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const defaultValues = {
    cnpj: config?.cnpj || "",
    usuario: config?.usuario || "",
    senha: config?.senha || "",
    unidade: config?.unidade || "",
    token: config?.token || "",
  };

  if (form.getValues("cnpj") === "" && config?.cnpj) {
    reset(defaultValues);
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" data-testid="text-config-title">Configurações</h1>
        <p className="text-muted-foreground">
          Configure as credenciais para conexão com a API do SINIR
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Credenciais SINIR
            {config?.hasPassword && config?.hasToken && (
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            )}
            {(!config?.hasPassword || !config?.hasToken) && (
              <AlertCircle className="w-5 h-5 text-yellow-500" />
            )}
          </CardTitle>
          <CardDescription>
            Insira os dados de acesso fornecidos pelo SINIR. 
            {config?.updatedAt && (
              <span className="block mt-1 text-xs">
                Última atualização: {new Date(config.updatedAt).toLocaleString("pt-BR")}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={form.handleSubmit((data) => saveMutation.mutate(data))}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="cnpj">CNPJ</Label>
              <Input
                id="cnpj"
                placeholder="00.000.000/0000-00"
                {...form.register("cnpj")}
                data-testid="input-config-cnpj"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="usuario">Usuário (CPF)</Label>
                <Input
                  id="usuario"
                  placeholder="000.000.000-00"
                  {...form.register("usuario")}
                  data-testid="input-config-usuario"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="unidade">Unidade</Label>
                <Input
                  id="unidade"
                  placeholder="Código da unidade"
                  {...form.register("unidade")}
                  data-testid="input-config-unidade"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="senha">Senha</Label>
              <div className="relative">
                <Input
                  id="senha"
                  type={showPassword ? "text" : "password"}
                  placeholder={config?.hasPassword ? "••••••••" : "Digite a senha"}
                  {...form.register("senha")}
                  data-testid="input-config-senha"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              {config?.hasPassword && (
                <p className="text-xs text-muted-foreground">
                  Senha já configurada. Deixe em branco para manter a atual.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="token">Token JWT</Label>
              <div className="relative">
                <Input
                  id="token"
                  type={showToken ? "text" : "password"}
                  placeholder={config?.hasToken ? "Token configurado..." : "Cole o token JWT"}
                  {...form.register("token")}
                  data-testid="input-config-token"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0"
                  onClick={() => setShowToken(!showToken)}
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                O token JWT pode ser gerado manualmente ou pela API de autenticação.
                Deixe em branco para manter o atual.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-4">
              <Button
                type="submit"
                disabled={saveMutation.isPending}
                data-testid="button-config-save"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Salvar Configuração
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending}
                data-testid="button-config-test"
              >
                {testMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                Testar Conexão
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
