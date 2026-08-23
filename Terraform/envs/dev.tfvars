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

domain_name = "envops-rana.duckdns.org"
acme_email  = "ranasalem923@gmail.com"

git_repo_url = "https://github.com/nourhan36/EnvOps"
git_branch = "main"
git_token = "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"