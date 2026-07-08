module "vpc" {
  source = "./Modules/VPC"
  name            = var.project_name
  vpc_cidr        = var.vpc_cidr
  public_subnets  = var.public_subnets
  private_subnets = var.private_subnets
  azs             = var.azs
  tags            = var.tags
}
module "eks" {
  source             = "./Modules/EKS"
  cluster_name       = "${var.project_name}-cluster"
  private_subnet_ids = module.vpc.private_subnet_ids
  tags               = var.tags
}