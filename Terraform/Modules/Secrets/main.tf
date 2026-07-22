# This module creates an IAM role and policy for the EnvOps Secrets Operator (ESO) to access AWS Secrets Manager secrets.
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

# Create the IAM policy for the ESO secrets access
resource "aws_iam_policy" "eso_secrets_policy" {
  name   = "envops-eso-secrets-policy"
  policy = data.aws_iam_policy_document.eso_secrets_policy.json
}

# Create the IAM role for the ESO service account to assume 
data "aws_iam_policy_document" "eso_trust_policy" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [var.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${var.oidc_provider_url}:sub"
      values   = ["system:serviceaccount:envops-core:eso-secrets-sa"]
    }

    condition {
      test     = "StringEquals"
      variable = "${var.oidc_provider_url}:aud"
      values   = ["sts.amazonaws.com"]
    }
  }
}

# Create the IAM role for the ESO service account to assume
resource "aws_iam_role" "eso_secrets_role" {
  name               = "envops-eso-secrets-role"
  assume_role_policy = data.aws_iam_policy_document.eso_trust_policy.json
}

# Attach the policy to the role
resource "aws_iam_role_policy_attachment" "eso_secrets_attach" {
  role       = aws_iam_role.eso_secrets_role.name
  policy_arn = aws_iam_policy.eso_secrets_policy.arn
}
