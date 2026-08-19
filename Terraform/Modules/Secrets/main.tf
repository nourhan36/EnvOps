resource "helm_release" "external_secrets" {
  name       = "external-secrets"
  repository = "https://charts.external-secrets.io"
  chart      = "external-secrets"
  namespace  = var.namespace
  version    = var.helm_chart_version

  create_namespace = true
  atomic           = true
  wait             = true
  timeout          = 600

  values = [
    yamlencode({
      serviceAccount = {
        create = true
        name   = var.service_account_name
        annotations = {
          "eks.amazonaws.com/role-arn" = var.irsa_role_arn
        }
      }
      installCRDs = true
    })
  ]
}
data "aws_iam_policy_document" "eso_secrets_policy" {
  statement {
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret",
    ]
    resources = [
      "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:envops/*"
    ]
  }
}

resource "aws_iam_policy" "eso_secrets_policy" {
  name        = var.policy_name
  description = "Allows ESO to read EnvOps secrets from AWS Secrets Manager."
  policy      = data.aws_iam_policy_document.eso_secrets_policy.json

}