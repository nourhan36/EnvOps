#!/bin/sh
set -eu

# When the backend runs inside Kubernetes, create a kubeconfig that points to
# the API server and reads the rotating ServiceAccount token from tokenFile.
# For local development this block is skipped and kubectl uses ~/.kube/config.
if [ -n "${KUBERNETES_SERVICE_HOST:-}" ] && \
   [ -f /var/run/secrets/kubernetes.io/serviceaccount/token ]; then
  mkdir -p /tmp/envops-kube

  cat > /tmp/envops-kube/config <<CONFIG
apiVersion: v1
kind: Config
clusters:
- name: in-cluster
  cluster:
    server: https://${KUBERNETES_SERVICE_HOST}:${KUBERNETES_SERVICE_PORT_HTTPS:-443}
    certificate-authority: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
contexts:
- name: in-cluster
  context:
    cluster: in-cluster
    user: envops-backend
current-context: in-cluster
users:
- name: envops-backend
  user:
    tokenFile: /var/run/secrets/kubernetes.io/serviceaccount/token
CONFIG

  chmod 600 /tmp/envops-kube/config
  export KUBECONFIG=/tmp/envops-kube/config
fi

exec "$@"
