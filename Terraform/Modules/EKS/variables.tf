variable "cluster_name" {
  description = "Name of the EKS cluster (used as a prefix for IAM roles and node group names)"
  type        = string

  validation {
    condition     = length(var.cluster_name) <= 49
    error_message = "cluster_name must be 49 characters or fewer to prevent IAM role names from overflowing AWS length limits."
  }
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs where the EKS control plane and worker nodes will be deployed"
  type        = list(string)

  validation {
    condition     = length(var.private_subnet_ids) >= 2
    error_message = "private_subnet_ids must include at least 2 subnets across different AZs for EKS high availability."
  }
}

variable "tags" {
  description = "A map of tags to apply to all EKS resources"
  type        = map(string)
  default     = {}
}