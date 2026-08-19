variable "namespace" {
  type    = string
}

variable "service_account_name" {
  type    = string
}

variable "irsa_role_arn" {
  description = "IAM role ARN (IRSA) for the External Secrets service account"
  type        = string
}

variable "helm_chart_version" {
  description = "Version of the external-secrets Helm chart"
  type        = string
  default     = "4.3.0"
}

variable "vpc_id" {
  type = string
}
variable "eks_security_group_id" {
  type = string
  
}
variable "private_subnets" {    
  type = list(string)
  
}