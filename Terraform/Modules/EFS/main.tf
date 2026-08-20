resource "helm_release" "efs_csi" {
  name       = "aws-efs-csi-driver"
  repository = "https://kubernetes-sigs.github.io/aws-efs-csi-driver/"
  chart      = "aws-efs-csi-driver"
  namespace  = var.namespace
  version    = var.helm_chart_version

  atomic = true
  wait   = true
  timeout = 600

  values = [
  yamlencode({
    controller = {
      serviceAccount = {
        create = true
        name   = var.service_account_name

        annotations = {
          "eks.amazonaws.com/role-arn" = var.irsa_role_arn
        }
      }
    }
  })
]

  
}

resource "aws_efs_file_system" "efs" {
  creation_token = "eks-efs"
  encrypted = true
  tags = {
    Name = "eks-efs"
  }
}

resource "aws_security_group" "efs" {
  name   = "efs-sg"
  vpc_id = var.vpc_id

  ingress {
    from_port       = 2049
    to_port         = 2049
    protocol        = "tcp"
    security_groups = [var.eks_security_group_id]
  }

  egress {
    from_port = 0
    to_port   = 0
    protocol  = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_efs_mount_target" "this" {
  count = length(var.private_subnets)

  file_system_id  = aws_efs_file_system.efs.id
  subnet_id       = var.private_subnets[count.index]
  security_groups = [aws_security_group.efs.id]
}