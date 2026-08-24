# resource "aws_iam_role" "cluster" {
#   name = "${var.cluster_name}-cluster-role"
#   tags = var.tags

#   assume_role_policy = jsonencode({
#     Version = "2012-10-17"
#     Statement = [
#       {
#         Action = "sts:AssumeRole"
#         Effect = "Allow"
#         Principal = {
#           Service = "eks.amazonaws.com"
#         }
#       }
#     ]
#   })
# }

# resource "aws_iam_role_policy_attachment" "cluster_policy" {
#   policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
#   role       = aws_iam_role.cluster.name
# }

# data "http" "my_ip" {
#   url = "https://api.ipify.org"
# }

# resource "aws_eks_cluster" "this" {
#   name     = var.cluster_name
#   role_arn = aws_iam_role.cluster.arn
#   tags     = var.tags

#   vpc_config {
#     subnet_ids              = var.private_subnet_ids
#     endpoint_private_access = true
#     endpoint_public_access  = true
#     # public_access_cidrs = [
#     #   "${chomp(data.http.my_ip.response_body)}/32"
#     # ]

#   }
 
  
#   depends_on = [
#     aws_iam_role_policy_attachment.cluster_policy
#   ]
# }

# # IAM OIDC provider automatically. Workloads using IRSA
# # (including External Secrets Operator) require this provider to assume roles.
# data "tls_certificate" "oidc" {
#   url = aws_eks_cluster.this.identity[0].oidc[0].issuer
# }

# resource "aws_iam_openid_connect_provider" "this" {
#   client_id_list  = ["sts.amazonaws.com"]
#   thumbprint_list = [data.tls_certificate.oidc.certificates[0].sha1_fingerprint]
#   url             = aws_eks_cluster.this.identity[0].oidc[0].issuer
#   tags            = var.tags
# }

# resource "aws_iam_role" "nodes" {
#   name = "${var.cluster_name}-node-role"
#   tags = var.tags

#   assume_role_policy = jsonencode({
#     Version = "2012-10-17"
#     Statement = [
#       {
#         Action = "sts:AssumeRole"
#         Effect = "Allow"
#         Principal = {
#           Service = "ec2.amazonaws.com"
#         }
#       }
#     ]
#   })
# }


# resource "aws_iam_role_policy_attachment" "nodes_worker_policy" {
#   policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
#   role       = aws_iam_role.nodes.name
# }

# resource "aws_iam_role_policy_attachment" "nodes_cni_policy" {
#   policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
#   role       = aws_iam_role.nodes.name
# }

# resource "aws_iam_role_policy_attachment" "nodes_ecr_policy" {
#   policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
#   role       = aws_iam_role.nodes.name
# }


# resource "aws_eks_node_group" "private_nodes" {
#   cluster_name    = aws_eks_cluster.this.name
#   node_group_name = "${var.cluster_name}-private-nodes"
#   node_role_arn   = aws_iam_role.nodes.arn
#   subnet_ids      = var.private_subnet_ids
#   tags            = var.tags

#   scaling_config {
#     desired_size = 2
#     max_size     = 3
#     min_size     = 1
#   }
 
#   # instance_types = ["t3.medium"] // unavaible in my aws account, so I will use c7i-flex.large instead
#   instance_types = ["c7i-flex.large"]

#   depends_on = [
#     aws_iam_role_policy_attachment.nodes_worker_policy,
#     aws_iam_role_policy_attachment.nodes_cni_policy,
#     aws_iam_role_policy_attachment.nodes_ecr_policy
#   ]
# }

# resource "aws_ec2_tag" "private_subnet_cluster_tag" {
#   count       = length(var.private_subnet_ids)
#   resource_id = var.private_subnet_ids[count.index]

#   key   = "kubernetes.io/cluster/${var.cluster_name}"
#   value = "shared"
# }


resource "aws_iam_role" "cluster" {
  name = "${var.cluster_name}-cluster-role"
  tags = var.tags

  assume_role_policy = jsonencode({
    Version = "2012-10-17"

    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"

        Principal = {
          Service = "eks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "cluster_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.cluster.name
}


# Get the public IP of the machine running Terraform.
# Currently not used because public_access_cidrs is commented out.
data "http" "my_ip" {
  url = "https://api.ipify.org"
}


# ---------------------------------------------------------
# EKS CLUSTER
# ---------------------------------------------------------

resource "aws_eks_cluster" "this" {
  name     = var.cluster_name
  role_arn = aws_iam_role.cluster.arn
  tags     = var.tags

  vpc_config {
    subnet_ids = var.private_subnet_ids

    endpoint_private_access = true
    endpoint_public_access  = true

    # If you want to restrict Kubernetes API access
    # to your current public IP:
    #
    # public_access_cidrs = [
    #   "${chomp(data.http.my_ip.response_body)}/32"
    # ]
  }

  depends_on = [
    aws_iam_role_policy_attachment.cluster_policy
  ]
}


# ---------------------------------------------------------
# EKS OIDC PROVIDER
# ---------------------------------------------------------
#
# Used by workloads that need AWS IAM permissions through
# Kubernetes ServiceAccounts (IRSA).
#
# External Secrets Operator and EBS CSI Driver can use this.
#

data "tls_certificate" "oidc" {
  url = aws_eks_cluster.this.identity[0].oidc[0].issuer
}

resource "aws_iam_openid_connect_provider" "this" {
  client_id_list = [
    "sts.amazonaws.com"
  ]

  thumbprint_list = [
    data.tls_certificate.oidc.certificates[0].sha1_fingerprint
  ]

  url = aws_eks_cluster.this.identity[0].oidc[0].issuer

  tags = var.tags
}


# ---------------------------------------------------------
# EBS CSI DRIVER IAM ROLE
# ---------------------------------------------------------
#
# The EBS CSI controller uses this role to call AWS APIs
# such as CreateVolume, AttachVolume, DeleteVolume, etc.
#
# The role is assumed by:
#
# system:serviceaccount:kube-system:ebs-csi-controller-sa
#
# through the EKS OIDC provider.
#

resource "aws_iam_role" "ebs_csi" {
  name = "${var.cluster_name}-ebs-csi-role"
  tags = var.tags

  assume_role_policy = jsonencode({
    Version = "2012-10-17"

    Statement = [
      {
        Effect = "Allow"

        Action = "sts:AssumeRoleWithWebIdentity"

        Principal = {
          Federated = aws_iam_openid_connect_provider.this.arn
        }

        Condition = {
          StringEquals = {
            "${replace(
              aws_eks_cluster.this.identity[0].oidc[0].issuer,
              "https://",
              ""
            )}:aud" = "sts.amazonaws.com"

            "${replace(
              aws_eks_cluster.this.identity[0].oidc[0].issuer,
              "https://",
              ""
            )}:sub" = "system:serviceaccount:kube-system:ebs-csi-controller-sa"
          }
        }
      }
    ]
  })
}


# AWS managed policy containing the permissions required
# by the AWS EBS CSI Driver.
#
resource "aws_iam_role_policy_attachment" "ebs_csi" {
  role = aws_iam_role.ebs_csi.name

  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
}


# ---------------------------------------------------------
# EBS CSI DRIVER EKS ADDON
# ---------------------------------------------------------
#
# Installs:
#
# - EBS CSI Controller
# - EBS CSI Node DaemonSet
# - CSI driver registration
#
# This is what allows Kubernetes PVCs using
# ebs.csi.aws.com to dynamically create EBS volumes.
#

resource "aws_eks_addon" "ebs_csi" {
  cluster_name = aws_eks_cluster.this.name

  addon_name = "aws-ebs-csi-driver"

  service_account_role_arn = aws_iam_role.ebs_csi.arn

  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"

  depends_on = [
    aws_iam_role_policy_attachment.ebs_csi,
    aws_eks_node_group.private_nodes
  ]

  tags = var.tags
}


# ---------------------------------------------------------
# EKS NODE IAM ROLE
# ---------------------------------------------------------

resource "aws_iam_role" "nodes" {
  name = "${var.cluster_name}-node-role"
  tags = var.tags

  assume_role_policy = jsonencode({
    Version = "2012-10-17"

    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"

        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })
}


resource "aws_iam_role_policy_attachment" "nodes_worker_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"

  role = aws_iam_role.nodes.name
}


resource "aws_iam_role_policy_attachment" "nodes_cni_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"

  role = aws_iam_role.nodes.name
}


resource "aws_iam_role_policy_attachment" "nodes_ecr_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"

  role = aws_iam_role.nodes.name
}


# ---------------------------------------------------------
# EKS PRIVATE NODE GROUP
# ---------------------------------------------------------

resource "aws_eks_node_group" "private_nodes" {
  cluster_name = aws_eks_cluster.this.name

  node_group_name = "${var.cluster_name}-private-nodes"

  node_role_arn = aws_iam_role.nodes.arn

  subnet_ids = var.private_subnet_ids

  tags = var.tags

  scaling_config {
    desired_size = 2
    max_size     = 3
    min_size     = 1
  }

  # t3.medium was unavailable in this AWS account.
  instance_types = ["c7i-flex.large"]

  depends_on = [
    aws_iam_role_policy_attachment.nodes_worker_policy,
    aws_iam_role_policy_attachment.nodes_cni_policy,
    aws_iam_role_policy_attachment.nodes_ecr_policy
  ]
}


# ---------------------------------------------------------
# KUBERNETES CLUSTER SUBNET TAGGING
# ---------------------------------------------------------
#
# Allows Kubernetes/AWS controllers to identify these
# subnets as belonging to this EKS cluster.
#

resource "aws_ec2_tag" "private_subnet_cluster_tag" {
  count = length(var.private_subnet_ids)

  resource_id = var.private_subnet_ids[count.index]

  key   = "kubernetes.io/cluster/${var.cluster_name}"
  value = "shared"
}