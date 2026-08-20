variable "namespace" {
  type = string
}

variable "service_account_name" {
  type = string
}

variable "irsa_role_arn" {
  type = string
}

variable "helm_chart_version" {
  type = string
   default     = "2.8.0"
}