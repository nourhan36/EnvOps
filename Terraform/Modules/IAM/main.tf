data "aws_iam_policy_document" "eso_secrets_policy" {
  statement {
    effect = "Allow"

    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret"
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