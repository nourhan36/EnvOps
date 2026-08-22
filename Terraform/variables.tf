variable "region" {
  type        = string
  description = "AWS region to deploy resources"
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name for tagging and resource naming"
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
}

variable "public_subnets" {
  type = list(string)
}

variable "private_subnets" {
  type = list(string)
}

variable "azs" {
  type = list(string)
}


variable "tags" {
  type = map(string)
}

variable "repositories" {
  description = "List of ECR repositories to create"
  type        = list(string)

  default = [
    "frontend",
    "backend"
  ]
}

variable "git_repo_url" {
  description = "Git repository containing the EnvOps project"
  type        = string
}

variable "git_branch" {
  description = "Git branch used by Argo CD and Image Updater"
  type        = string
  default     = "main"
}

variable "git_username" {
  description = "GitHub username for Argo CD/Image Updater"
  type        = string
  sensitive   = true
}

variable "git_token" {
  description = "GitHub PAT with repository read/write access"
  type        = string
  sensitive   = true
}