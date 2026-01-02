import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Save, CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { useState, useEffect } from "react";

type SinirConfigForm = {
  cnpj: string;
  usuario: string;
  senha: string;
  unidade: string;
  token: string;
  responsavelNome: string;
};

type SinirConfigResponse = {
  cnpj: string;
  usuario: string;
  senha: string;
  unidade: string;
  token: string;
  responsavelNome: string;
  hasPassword: boolean;
  hasToken: boolean;
  updatedAt: string | null;
};

type IemaConfigForm = {
  pessoaCodigo: number | null;
  pessoaCnpj: string;
  usuarioCpf: string;
  senha: string;
  ambiente: "homologacao" | "producao";
  responsavelNome: string;
};

type IemaConfigResponse = {
  pessoaCodigo: number | null;
  pessoaCnpj: string;
  usuarioCpf: string;
  senha: string;
  ambiente: string;
  responsavelNome: string;
  hasPassword: boolean;
  hasToken: boolean;
  updatedAt: string | null;
};

export default function Config() {
  const { toast } = useToast();
  const [showSinirPassword, setShowSinirPassword] = useState(false);
  const [showSinirToken, setShowSinirToken] = useState(false);
  const [showIemaPassword, setShowIemaPassword] = useState(false);

  const { data: sinirConfig, isLoading: sinirLoading } = useQuery<SinirConfigResponse>({
    queryKey: ["/api/config"],
  });

  const { data: iemaConfig, isLoading: iemaLoading } = useQuery<IemaConfigResponse>({
    queryKey: ["/api/iema/config"],
  });

  const sinirForm = useForm<SinirConfigForm>({
    defaultValues: {
      cnpj: "",
      usuario: "",
      senha: "",
      unidade: "",
      token: "",
      responsavelNome: "",
    },
  });

  const iemaForm = useForm<IemaConfigForm>({
    defaultValues: {
      pessoaCodigo: null,
      pessoaCnpj: "",
      usuarioCpf: "",
      senha: "",
      ambiente: "producao",
      responsavelNome: "",
    },
  });

  useEffect(() => {
    if (sinirConfig) {
      sinirForm.reset({
        cnpj: sinirConfig.cnpj || "",
        usuario: sinirConfig.usuario || "",
        senha: sinirConfig.senha || "",
        unidade: sinirConfig.unidade || "",
        token: sinirConfig.token || "",
        responsavelNome: sinirConfig.responsavelNome || "",
      });
    }
  }, [sinirConfig]);

  useEffect(() => {
    if (iemaConfig) {
      iemaForm.reset({
        pessoaCodigo: iemaConfig.pessoaCodigo || null,
        pessoaCnpj: iemaConfig.pessoaCnpj || "",
        usuarioCpf: iemaConfig.usuarioCpf || "",
        senha: iemaConfig.senha || "",
        ambiente: (iemaConfig.ambiente as "homologacao" | "producao") || "producao",
        responsavelNome: iemaConfig.responsavelNome || "",
      });
    }
  }, [iemaConfig]);

  const saveSinirMutation = useMutation({
    mutationFn: async (data: SinirConfigForm) => {
      return apiRequest("POST", "/api/config", data);
    },
    onSuccess: () => {
      toast({
        title: "Configuração SINIR salva",
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

  const saveIemaMutation = useMutation({
    mutationFn: async (data: IemaConfigForm) => {
      return apiRequest("POST", "/api/iema/config", data);
    },
    onSuccess: () => {
      toast({
        title: "Configuração IEMA salva",
        description: "As credenciais foram atualizadas com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/iema/config"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const testSinirMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/sinir/test");
      return response.json();
    },
    onSuccess: (result) => {
      toast({
        title: result.success ? "Conexão SINIR OK" : "Falha na conexão SINIR",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
    },
  });

  const testIemaMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/iema/test", { method: "POST" });
      return response.json();
    },
    onSuccess: (result) => {
      toast({
        title: result.success ? "Conexão IEMA OK" : "Falha na conexão IEMA",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
    },
  });

  if (sinirLoading || iemaLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" data-testid="text-config-title">Configurações</h1>
        <p className="text-muted-foreground">
          Configure as credenciais para conexão com a API SINIR
        </p>
      </div>

      <Tabs defaultValue="sinir" className="space-y-4">
        {/* IEMA oculto temporariamente - mostrar apenas SINIR */}
        <TabsList className="grid w-full grid-cols-1" data-testid="tabs-platform">
          <TabsTrigger value="sinir" data-testid="tab-sinir">SINIR (Nacional)</TabsTrigger>
          {/* <TabsTrigger value="iema" data-testid="tab-iema">IEMA (Espírito Santo)</TabsTrigger> */}
        </TabsList>

        <TabsContent value="sinir">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Credenciais SINIR
                {sinirConfig?.hasPassword && sinirConfig?.hasToken ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-yellow-500" />
                )}
              </CardTitle>
              <CardDescription>
                Insira os dados de acesso fornecidos pelo SINIR. 
                {sinirConfig?.updatedAt && (
                  <span className="block mt-1 text-xs">
                    Última atualização: {new Date(sinirConfig.updatedAt).toLocaleString("pt-BR")}
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={sinirForm.handleSubmit((data) => saveSinirMutation.mutate(data))}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="sinir-cnpj">CNPJ</Label>
                  <Input
                    id="sinir-cnpj"
                    placeholder="00.000.000/0000-00"
                    {...sinirForm.register("cnpj")}
                    data-testid="input-sinir-cnpj"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="sinir-usuario">Usuário (CPF)</Label>
                    <Input
                      id="sinir-usuario"
                      placeholder="000.000.000-00"
                      {...sinirForm.register("usuario")}
                      data-testid="input-sinir-usuario"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="sinir-unidade">Unidade</Label>
                    <Input
                      id="sinir-unidade"
                      placeholder="Código da unidade"
                      {...sinirForm.register("unidade")}
                      data-testid="input-sinir-unidade"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sinir-senha">Senha</Label>
                  <div className="relative">
                    <Input
                      id="sinir-senha"
                      type={showSinirPassword ? "text" : "password"}
                      placeholder={sinirConfig?.hasPassword ? "Senha configurada" : "Digite a senha"}
                      {...sinirForm.register("senha")}
                      data-testid="input-sinir-senha"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0"
                      onClick={() => setShowSinirPassword(!showSinirPassword)}
                    >
                      {showSinirPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                  {sinirConfig?.hasPassword && (
                    <p className="text-xs text-muted-foreground">
                      Senha já configurada. Deixe em branco para manter a atual.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sinir-token">Token JWT</Label>
                  <div className="relative">
                    <Input
                      id="sinir-token"
                      type={showSinirToken ? "text" : "password"}
                      placeholder={sinirConfig?.hasToken ? "Token configurado..." : "Cole o token JWT"}
                      {...sinirForm.register("token")}
                      data-testid="input-sinir-token"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0"
                      onClick={() => setShowSinirToken(!showSinirToken)}
                    >
                      {showSinirToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    O token JWT pode ser gerado manualmente ou pela API de autenticação.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sinir-responsavel">Nome do Responsável pelo Recebimento</Label>
                  <Input
                    id="sinir-responsavel"
                    placeholder="Ex: Antonio José Pregnolato"
                    {...sinirForm.register("responsavelNome")}
                    data-testid="input-sinir-responsavel"
                  />
                  <p className="text-xs text-muted-foreground">
                    Nome exatamente como cadastrado no SINIR (com acentos). Será usado como padrão nos envios.
                  </p>
                </div>

                <div className="flex items-center gap-3 pt-4">
                  <Button
                    type="submit"
                    disabled={saveSinirMutation.isPending}
                    data-testid="button-sinir-save"
                  >
                    {saveSinirMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Salvar
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => testSinirMutation.mutate()}
                    disabled={testSinirMutation.isPending}
                    data-testid="button-sinir-test"
                  >
                    {testSinirMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : null}
                    Testar Conexão
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="iema">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Credenciais IEMA
                {iemaConfig?.hasPassword ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-yellow-500" />
                )}
              </CardTitle>
              <CardDescription>
                Insira os dados de acesso fornecidos pelo IEMA (Espírito Santo). 
                {iemaConfig?.updatedAt && (
                  <span className="block mt-1 text-xs">
                    Última atualização: {new Date(iemaConfig.updatedAt).toLocaleString("pt-BR")}
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={iemaForm.handleSubmit((data) => {
                  const cleanData = {
                    ...data,
                    pessoaCodigo: isNaN(data.pessoaCodigo as number) ? null : data.pessoaCodigo,
                  };
                  saveIemaMutation.mutate(cleanData);
                })}
                className="space-y-4"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="iema-pessoaCodigo">Código Pessoa</Label>
                    <Input
                      id="iema-pessoaCodigo"
                      type="number"
                      placeholder="Código numérico"
                      {...iemaForm.register("pessoaCodigo", { valueAsNumber: true })}
                      data-testid="input-iema-pessoaCodigo"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="iema-pessoaCnpj">CNPJ Pessoa</Label>
                    <Input
                      id="iema-pessoaCnpj"
                      placeholder="00.000.000/0000-00"
                      {...iemaForm.register("pessoaCnpj")}
                      data-testid="input-iema-pessoaCnpj"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="iema-usuarioCpf">CPF do Usuário</Label>
                  <Input
                    id="iema-usuarioCpf"
                    placeholder="000.000.000-00"
                    {...iemaForm.register("usuarioCpf")}
                    data-testid="input-iema-usuarioCpf"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="iema-senha">Senha</Label>
                  <div className="relative">
                    <Input
                      id="iema-senha"
                      type={showIemaPassword ? "text" : "password"}
                      placeholder={iemaConfig?.hasPassword ? "Senha configurada" : "Digite a senha"}
                      {...iemaForm.register("senha")}
                      data-testid="input-iema-senha"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0"
                      onClick={() => setShowIemaPassword(!showIemaPassword)}
                    >
                      {showIemaPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                  {iemaConfig?.hasPassword && (
                    <p className="text-xs text-muted-foreground">
                      Senha já configurada. Deixe em branco para manter a atual.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="iema-ambiente">Ambiente</Label>
                  <Select
                    value={iemaForm.watch("ambiente")}
                    onValueChange={(v) => iemaForm.setValue("ambiente", v as "homologacao" | "producao")}
                  >
                    <SelectTrigger data-testid="select-iema-ambiente">
                      <SelectValue placeholder="Selecione o ambiente" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="producao">Produção</SelectItem>
                      <SelectItem value="homologacao">Homologação</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Use "Homologação" para testes e "Produção" para envio real.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="iema-responsavel">Nome do Responsável pelo Recebimento</Label>
                  <Input
                    id="iema-responsavel"
                    placeholder="Ex: Antonio José Pregnolato"
                    {...iemaForm.register("responsavelNome")}
                    data-testid="input-iema-responsavel"
                  />
                  <p className="text-xs text-muted-foreground">
                    Nome exatamente como cadastrado no IEMA (com acentos). Será usado como padrão nos envios.
                  </p>
                </div>

                <div className="flex items-center gap-3 pt-4">
                  <Button
                    type="submit"
                    disabled={saveIemaMutation.isPending}
                    data-testid="button-iema-save"
                  >
                    {saveIemaMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Salvar
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => testIemaMutation.mutate()}
                    disabled={testIemaMutation.isPending}
                    data-testid="button-iema-test"
                  >
                    {testIemaMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : null}
                    Testar Conexão
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
