output "external_secrets_role_arn" {
  description = "IAM role ARN used by External Secrets Operator."
  value       = module.irsa.role_arn
}

output "external_secrets_role_name" {
  description = "IAM role name used by External Secrets Operator."
  value       = module.irsa.role_name
}
