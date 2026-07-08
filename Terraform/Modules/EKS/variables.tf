variable "cluster_name" {
  description = "Name of the EKS cluster"
  type        = string
  default     = "envops-cluster"
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs where the EKS control plane will be deployed"
  type        = list(string)
}