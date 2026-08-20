output "cluster_id" {
  description = "The name/id of the EKS cluster"
  value       = aws_eks_cluster.this.id
}

output "cluster_endpoint" {
  description = "Endpoint for the Kubernetes API server"
  value       = aws_eks_cluster.this.endpoint
}

output "cluster_certificate_authority_data" {
  description = "Base64 encoded certificate data required to communicate with the cluster"
  value       = aws_eks_cluster.this.certificate_authority[0].data
}

output "oidc_provider_arn" {
  description = "ARN of the IAM OIDC provider used by EKS workloads with IRSA"
  value = try(
    aws_iam_openid_connect_provider.this[0].arn,
    "arn:aws:iam::${data.aws_caller_identity.this.account_id}:oidc-provider/${trimprefix(local.oidc_issuer_url, "https://")}"
  )
}

output "oidc_provider_url" {
  description = "OIDC issuer URL without the HTTPS scheme, for IAM trust-policy conditions"
  value       = trimprefix(local.oidc_issuer_url, "https://")
}

output "cluster_security_group_id" {
  description = "Security group ID used by the EKS cluster and worker nodes"
  value       = aws_eks_cluster.this.vpc_config[0].cluster_security_group_id
}
