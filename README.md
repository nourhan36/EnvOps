# EnvOps

> Dynamic, cloud-native development sandboxes on demand.

EnvOps is a microservices-based platform designed to provision, manage, and connect to isolated Kubernetes-based development environments in seconds. It provides developers with secure, ephemeral sandboxes complete with real-time web terminal access directly from the browser.

---

## Architecture Overview

The system is decoupled into three primary execution layers: React client, Node.js control plane, and an AWS EKS infrastructure bedrock.


![Architecture Diagram](./Assets/Architecture.png)

## Core Features

* **Dynamic Kubernetes Provisioning:** Automated generation of Namespaces, Pods, and Network Policies via the Kubernetes Node SDK.
* **Hardened Security Contexts:** Sandboxes run non-root, drop all Linux capabilities (`ALL`), and enforce strict network isolation to prevent lateral movement.
* **Real-time Web Terminal:** Low-latency standard I/O streaming using WebSocket streams, `node-pty`, and `xterm.js`.
* **Infrastructure as Code (IaC):** 100% codified AWS networking (VPC, NAT) and Kubernetes (EKS) infrastructure using Terraform.
* **Local Cloud Emulation:** Full local testing capabilities utilizing Docker and Floci (AWS Emulator), completely eliminating cloud costs during development.

## Tech Stack

| Component | Technology |
| --- | --- |
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, xterm.js, framer-motion |
| **Backend** | Node.js, Express, Socket.IO, Prisma ORM, PostgreSQL, Redis |
| **Infrastructure** | Terraform, AWS (EKS, VPC, IAM), Kubernetes Client SDK |
| **Local Dev** | Docker Compose, Floci (AWS Emulator) |

<!-- ## Repository Structure

```text
.
├── apps/
│   └── backend/          # Node.js API, Prisma Schema, K8s Orchestrator, WebSockets
├── frontend/             # React SPA, Tailwind, Vite, xterm.js UI
├── Terraform/            # AWS IaC (VPC, EKS, IAM, Backend State)
│   ├── Modules/          # Reusable standard modules
│   └── envs/             # Environment specific configurations
└── Docker/               # Local emulation compose files (Postgres, Redis, Floci)

``` 

--- -->

## Getting Started (Local Development)

### Prerequisites

* Docker & Docker Compose
* Node.js (v18+)
* Terraform CLI (v1.5+)

### 1. Spin up Local Services

The provided Docker Compose file initializes Postgres, Redis, and the Floci AWS emulator.

```bash
cd Docker
docker compose up -d

```

### 2. Configure the Backend

Install dependencies and run database migrations.

```bash
cd apps/backend
npm install
cp .env.example .env
npx prisma migrate dev
npm run dev

```

Set `KUBERNETES_TARGET=emulator` for Floci or `KUBERNETES_TARGET=aws` when the backend should talk to a real EKS kubeconfig.

### 3. Launch the Frontend

Install UI dependencies and start the Vite development server.

```bash
cd frontend
npm install
cp .env.example .env
npm run dev

```

---

## Infrastructure Deployment

The `Terraform/` directory contains the modularized IaC for AWS. It is designed to work with both real AWS environments and local emulators via override files.

### Deploying to Local Emulator (Floci)

If you are developing locally, ensure your `floci_override.tf` is present (this file is git-ignored to prevent polluting production).

*Note: Due to local emulator concurrency limitations, it is strictly recommended to apply the VPC module first, followed by the EKS module sequentially.*

```bash
cd Terraform
terraform init

# 1. Build Network Foundation (Sequential)
terraform apply -target=module.vpc -var-file="envs/dev.tfvars" -parallelism=1

# 2. Build EKS Control Plane & Nodes (Sequential)
terraform apply -var-file="envs/dev.tfvars" -parallelism=1

```

### Deploying to AWS

Remove the local override file and execute using standard AWS credentials.

```bash
cd Terraform
terraform init
terraform apply -var-file="envs/prod.tfvars"

```

## The Team

EnvOps is collaboratively developed by:

* **Ahmed Bakry (Infrastructure & Orchestration):** Terraform EKS/VPC modules, K8s SDK integration, Pod Security Policies.
* **Rana (Backend API & Data):** Express controllers, Prisma schemas, REST architecture.
* **Nourhan (WebSockets & Real-time I/O):** Socket.IO gateways, `node-pty` integration.
* **Nouran (Frontend UI):** React architecture, xterm.js terminal integration, Tailwind design.

## License

This project is proprietary and confidential.
