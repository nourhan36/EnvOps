module "vpc" {
  source          = "./Modules/VPC"
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
module "iam" {
  source = "./Modules/IAM"
  region     = var.region
  account_id = data.aws_caller_identity.current.account_id
  project_name = var.project_name

}
module "irsa" {
  source = "./Modules/IRSA"

  name = "envops-eso-secrets-role"

  policy_arn = module.iam.eso_secrets_policy_arn

  oidc_provider_arn = module.eks.oidc_provider_arn
  oidc_issuer       = module.eks.oidc_provider_url
  service_account   = "eso-secrets-sa"
  namespace         = "envops-core"
}

module "secrets" {
  source = "./Modules/Secrets"

  namespace            = "envops-core"
  service_account_name = "eso-secrets-sa"
  irsa_role_arn        = module.irsa.role_arn
}

module "efs_csi_irsa" {
  source = "./Modules/IRSA"

  name              = "efs-csi"
  oidc_provider_arn = module.eks.oidc_provider_arn
  oidc_issuer       = module.eks.oidc_provider_url
  namespace         = "kube-system"
  service_account   = "efs-csi-controller-sa"
  policy_arn        = "arn:aws:iam::aws:policy/service-role/AmazonEFSCSIDriverPolicy"
}

module "efs" {
  source                = "./Modules/EFS"
  service_account_name  = "efs-csi-controller-sa"
  irsa_role_arn         = module.efs_csi_irsa.role_arn
  namespace             = "kube-system"
  vpc_id                = module.vpc.vpc_id
  private_subnets       = module.vpc.private_subnet_ids
  eks_security_group_id = module.eks.cluster_security_group_id
  depends_on            = [module.eks, module.efs_csi_irsa]
}


module "ecr" {
  source = "./modules/ECR"
  project_name   = var.project_name
  node_role_arn  = module.eks.node_role_arn
  images_to_keep = 10
  repositories   = var.repositories
}

module "jenkins_agent_irsa" {
  source = "./modules/IRSA"

  name              = "jenkins-agent-role"
  oidc_provider_arn = module.eks.oidc_arn
  oidc_issuer       = replace(module.eks.oidc_url, "https://", "")
  namespace         = "cicd"
  service_account   = "jenkins-agent-sa"
  policy_arn        = module.iam_policy.jenkins_agent_policy
}