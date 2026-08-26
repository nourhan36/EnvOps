#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
root_dir=$(cd "$script_dir/.." && pwd)

region="${AWS_REGION:-us-east-1}"
cluster="${EKS_CLUSTER_NAME:-envops-dev-cluster}"
namespace=envops-core
temp_dir=$(mktemp -d)
trap 'rm -rf "$temp_dir"' EXIT

ensure_secret() {
  local name=$1 payload=$2
  if aws secretsmanager describe-secret --secret-id "$name" --region "$region" >/dev/null 2>&1; then
    echo "AWS secret already exists: $name"
    return
  fi

  local payload_file="$temp_dir/${name##*/}.json"
  umask 077
  printf '%s' "$payload" > "$payload_file"
  aws secretsmanager create-secret --name "$name" --secret-string "file://$payload_file" --region "$region" >/dev/null
  echo "Created AWS secret: $name"
}

postgres_password=$(openssl rand -hex 32)
redis_password=$(openssl rand -hex 32)
ensure_secret "envops/postgres-credentials" "{\"username\":\"envops_admin\",\"password\":\"$postgres_password\",\"dbname\":\"envops\"}"
ensure_secret "envops/redis-credentials" "{\"password\":\"$redis_password\"}"
ensure_secret "envops/backend-credentials" "{\"sbg_api_key\":\"${SBG_API_KEY:-YOUR_SBG_API_KEY_HERE}\"}"
unset postgres_password redis_password

aws eks update-kubeconfig --name "$cluster" --region "$region" >/dev/null
kubectl config current-context

kubectl wait --for=condition=Available deployment/external-secrets -n "$namespace" --timeout=5m
kubectl apply -f "$root_dir/Kubernetes/secrets-management/secretstore.yaml"
kubectl apply -f "$root_dir/Kubernetes/secrets-management/externalsecret-postgres.yaml"
kubectl apply -f "$root_dir/Kubernetes/secrets-management/externalsecret-redis.yaml"
kubectl apply -f "$root_dir/Kubernetes/secrets-management/externalsecret-backend.yaml"
kubectl apply -f "$root_dir/Kubernetes/envops/backend/configmap.yaml" -n "$namespace"
kubectl wait --for=condition=Ready externalsecret/postgres-credentials -n "$namespace" --timeout=5m
kubectl wait --for=condition=Ready externalsecret/redis-credentials -n "$namespace" --timeout=5m
kubectl wait --for=condition=Ready externalsecret/backend-credentials -n "$namespace" --timeout=5m

helm repo add bitnami https://charts.bitnami.com/bitnami >/dev/null
helm repo update >/dev/null
helm upgrade --install envops-postgres bitnami/postgresql --namespace "$namespace" --create-namespace \
  --values "$root_dir/Kubernetes/data-layer/postgres/values.yaml" --wait --timeout 10m
helm upgrade --install envops-redis bitnami/redis --namespace "$namespace" --create-namespace \
  --values "$root_dir/Kubernetes/data-layer/redis/values.yaml" --wait --timeout 10m

echo "Cloud database bootstrap completed. Run scripts/test-cloud-database.sh to verify it."
