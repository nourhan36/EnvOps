variable "region" {
  type        = string
  description = "AWS region to deploy resources"
  default = "us-east-1"
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


