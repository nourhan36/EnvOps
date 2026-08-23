#!/usr/bin/env bash
set -euo pipefail

namespace=envops-core
kubectl wait --for=condition=Ready secretstore/aws-secrets-store -n "$namespace" --timeout=60s
kubectl wait --for=condition=Ready externalsecret/postgres-credentials -n "$namespace" --timeout=60s
kubectl rollout status statefulset/envops-postgres-postgresql -n "$namespace" --timeout=5m
kubectl rollout status deployment/envops-backend -n "$namespace" --timeout=5m

kubectl exec deployment/envops-backend -n "$namespace" -c backend -- node -e '
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
prisma.$queryRawUnsafe("SELECT 1")
  .then(() => console.log("Backend database connection: OK"))
  .finally(() => prisma.$disconnect());
'

echo "Database and backend checks passed."
