variable "project_name" {
  type = string
}

variable "images_to_keep" {
  type    = number
  default = 10
}

variable "node_role_arn" {
  type = string
}
variable "repositories" {
  description = "List of ECR repositories to create"
  type        = list(string)

  default = [
    "frontend",
    "backend"
  ]
}