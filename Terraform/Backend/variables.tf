variable "bucket_name" {
  description = "Unique S3 bucket name for Terraform remote state"
  type        = string
}

variable "aws_region" {
  description = "AWS Region"
  type        = string
  default     = "us-east-1"
}