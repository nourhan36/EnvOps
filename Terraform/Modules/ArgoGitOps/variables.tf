variable "argocd_chart_version" {
  description = "Argo CD Helm chart version"
  type        = string
  default     = "10.4.0"
}

variable "image_updater_chart_version" {
  description = "Argo CD Image Updater Helm chart version"
  type        = string
  default     = "1.2.4"
}

variable "git_repo_url" {
  description = "Git repository containing the EnvOps Kubernetes manifests"
  type        = string
}

variable "git_branch" {
  description = "Git branch Argo CD should track"
  type        = string
  default     = "main"
}

variable "git_username" {
  description = "Git username used by Argo CD/Image Updater"
  type        = string
  sensitive   = true
}

variable "git_token" {
  description = "GitHub PAT with repository write access"
  type        = string
  sensitive   = true
}

variable "backend_repository_url" {
  description = "ECR backend repository URL"
  type        = string
}

variable "frontend_repository_url" {
  description = "ECR frontend repository URL"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
}

variable "image_updater_role_arn" {
  description = "IAM role ARN assumed by Argo CD Image Updater through IRSA"
  type        = string
}