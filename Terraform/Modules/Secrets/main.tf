resource "helm_release" "external_secrets" {
  name       = "external-secrets"
  repository = "https://charts.external-secrets.io"
  chart      = "external-secrets"

  namespace = var.namespace
  version   = var.helm_chart_version

  create_namespace = true

  atomic = true
  wait   = true
  timeout = 600

  values = [
    yamlencode({
      installCRDs = true

      serviceAccount = {
        create = true
        name   = var.service_account_name

        annotations = {
          "eks.amazonaws.com/role-arn" = var.irsa_role_arn
        }
      }
    })
  ]
}