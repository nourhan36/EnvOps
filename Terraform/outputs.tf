output "external_secrets_role_arn" {
  description = "IAM role ARN for the External Secrets Operator service account"
  value       = module.secrets.eso_role_arn
}
