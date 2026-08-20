variable "region" {
  type = string
}

variable "account_id" {
  type = string
}

variable "policy_name" {
  type    = string
  default = "envops-eso-secrets-policy"
}