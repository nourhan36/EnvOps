## IAM role to annotate on the External Secrets Operator service account.
output "eso_role_arn" {
  description = "ARN of the IAM role granted read access to EnvOps secrets"
  value       = aws_iam_role.eso_secrets_role.arn
}
