output "policy_arn" {
  description = "ARN of the ESO Secrets Manager IAM policy."
  value       = aws_iam_policy.eso_secrets_policy.arn
}

output "policy_name" {
  description = "Name of the ESO Secrets Manager IAM policy."
  value       = aws_iam_policy.eso_secrets_policy.name
}