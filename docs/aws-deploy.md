# Deploy na AWS (ECS Fargate + RDS)

Este projeto já está pronto para rodar em container e subir na AWS com **ECS Fargate**.

## 1) Pré-requisitos

- Conta AWS
- AWS CLI configurado
- Docker instalado
- Banco PostgreSQL (recomendado: Amazon RDS PostgreSQL)

## 2) Variáveis de ambiente necessárias

No container, configure:

- `NODE_ENV=production`
- `PORT=5000`
- `DATABASE_URL` (obrigatório)
- `SINIR_CNPJ`
- `SINIR_PASSWORD`
- `SINIR_USER`
- `SINIR_TOKEN` (opcional, mas recomendado)

> Dica: use **AWS Secrets Manager** para guardar credenciais e injete no Task Definition do ECS.

## 3) Build e push da imagem para ECR

Substitua `REGION`, `ACCOUNT_ID` e `REPOSITORY`:

```bash
aws ecr create-repository --repository-name REPOSITORY --region REGION

aws ecr get-login-password --region REGION | docker login --username AWS --password-stdin ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com

docker build -t REPOSITORY:latest .
docker tag REPOSITORY:latest ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/REPOSITORY:latest
docker push ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/REPOSITORY:latest
```

## 4) ECS Fargate

1. Crie um cluster ECS (Fargate).
2. Crie uma **Task Definition** com:
   - Porta do container: `5000`
   - CPU/Memória conforme carga (ex.: 0.5 vCPU / 1GB)
   - Variáveis de ambiente e secrets
   - Health check de container (opcional), endpoint: `/healthz`
3. Crie um **Service** com Application Load Balancer (ALB).
4. No Target Group do ALB, configure health check para `GET /healthz`.

## 5) Banco de dados (RDS)

- Crie PostgreSQL no RDS.
- Libere acesso da Security Group do ECS para o banco.
- Monte a `DATABASE_URL`, por exemplo:

```text
postgresql://USER:PASSWORD@HOST:5432/DATABASE
```

- Rode o schema com:

```bash
npm run db:push
```

> Você pode rodar esse comando em um job único (CI/CD) ou em uma task administrativa no ECS.

## 6) Observabilidade

- Ative logs do ECS para CloudWatch.
- Crie alarmes para 5xx no ALB, uso de CPU/memória e falha de health check.

## 7) Fluxo recomendado de deploy

1. Push no repositório
2. CI faz build da imagem
3. Push para ECR
4. Atualiza Task Definition
5. ECS faz rolling update

---

## Endpoint de health check

O serviço expõe `GET /healthz` retornando:

```json
{ "status": "ok" }
```
