output "eso_secrets_policy_arn" {
  value = aws_iam_policy.eso_secrets_policy.arn
}

output "jenkins_agent_policy_arn" {
  value = aws_iam_policy.jenkins_agent_policy.arn
}