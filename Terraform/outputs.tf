# output "external_secrets_role_arn" {
#   description = "IAM role ARN used by External Secrets Operator."
#   value       = module.irsa.role_arn
# }

# output "external_secrets_role_name" {
#   description = "IAM role name used by External Secrets Operator."
#   value       = module.irsa.role_name
# }

output "envops_domain_name" {
  value = var.domain_name
}

output "envops_api_endpoint" {
  value = "https://${var.domain_name}"
}

output "envops_frontend_endpoint" {
  value = "https://${var.domain_name}"
}