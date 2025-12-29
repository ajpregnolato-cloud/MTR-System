# MTR Receiver

## Overview

MTR Receiver is a Brazilian waste manifest (MTR - Manifesto de Transporte de Resíduos) management system that integrates with SINIR (Sistema Nacional de Informações sobre a Gestão dos Resíduos Sólidos). The application enables importing Excel files containing waste transport manifests, validating them against business rules, and submitting them to the Brazilian government's SINIR API.

The system follows a full-stack TypeScript architecture with a React frontend and Express backend, using PostgreSQL for data persistence.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack Query (React Query) for server state
- **UI Components**: shadcn/ui built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming
- **Form Handling**: React Hook Form with Zod validation
- **Build Tool**: Vite

The frontend is organized under `client/src/` with:
- `pages/` - Route-level components (Dashboard, Logs)
- `components/` - Reusable UI components including shadcn/ui
- `hooks/` - Custom React hooks for data fetching and mutations
- `lib/` - Utilities and query client configuration

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database ORM**: Drizzle ORM with PostgreSQL
- **File Processing**: Multer for file uploads, xlsx for Excel parsing
- **API Design**: RESTful endpoints defined in `shared/routes.ts`

The backend is organized under `server/` with:
- `index.ts` - Express app setup and middleware
- `routes.ts` - API endpoint registration
- `storage.ts` - Database access layer (repository pattern)
- `sinir.ts` - SINIR API integration service
- `db.ts` - Database connection configuration

### Shared Code
The `shared/` directory contains code used by both frontend and backend:
- `schema.ts` - Drizzle table definitions and Zod schemas
- `routes.ts` - API contract definitions with type-safe schemas

### Data Model
Two main entities:
1. **MTR (Manifesto)** - Header record with generator, transporter, receiver info
2. **MTR Items** - Line items representing individual waste types/quantities

Status workflow: PENDENTE → VALIDO/ERRO → ENVIADO → PROCESSADO

### Key Design Decisions

**Monorepo Structure**: Single repository with client, server, and shared directories enables type sharing and simplified deployment.

**Type-Safe API Contracts**: The `shared/routes.ts` file defines API endpoints with Zod schemas, ensuring frontend and backend stay synchronized.

**Repository Pattern**: The `DatabaseStorage` class in `storage.ts` abstracts database operations, making it easier to test and modify data access logic.

**Component Library**: Using shadcn/ui provides accessible, customizable components that are copied into the project (not installed as dependencies), allowing full control over styling.

## External Dependencies

### Database
- **PostgreSQL**: Primary data store via `DATABASE_URL` environment variable
- **Drizzle ORM**: Type-safe database access with schema defined in `shared/schema.ts`
- **Drizzle Kit**: Database migration tool (`npm run db:push`)

### SINIR API Integration
The system integrates with Brazil's SINIR waste management API:
- Base URL: `https://admin.sinir.gov.br/apiws/rest`
- Required environment variables:
  - `SINIR_CNPJ` - Company tax ID
  - `SINIR_PASSWORD` - API password
  - `SINIR_USER` - API username
  - `SINIR_TOKEN` - Pre-generated bearer token (optional)

### Third-Party Libraries
- **xlsx**: Excel file parsing for MTR imports
- **date-fns**: Date formatting (Portuguese locale)
- **Zod**: Runtime validation for API inputs/outputs
- **TanStack Query**: Async state management with caching