region = "us-east-1"

project_name = "envops-dev"

vpc_cidr = "10.0.0.0/16"

azs = [
  "us-east-1a",
  "us-east-1b"
]

public_subnets = [
  "10.0.1.0/24",
  "10.0.2.0/24"
]

private_subnets = [
  "10.0.11.0/24",
  "10.0.12.0/24"
]

tags = {
  Project     = "EnvOps"
  Environment = "Development"
  ManagedBy   = "Terraform"
  Owner       = "InfraMind Tech"
}