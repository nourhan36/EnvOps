locals {
  ecr_registry = split("/", var.backend_repository_url)[0]
}

resource "helm_release" "argocd" {
  name       = "argocd"
  repository = "https://argoproj.github.io/argo-helm"
  chart      = "argo-cd"
  version    = var.argocd_chart_version

  namespace        = "argocd"
  create_namespace = true

  wait    = true
  atomic  = true
  timeout = 900

  values = [
    yamlencode({
      configs = {
        repositories = {
          envops = {
            url      = var.git_repo_url
            username = var.git_username
            password = var.git_token
            name     = "envops-repo"
            type     = "git"
          }
        }
      }

      server = {
        replicas = 1
      }

      controller = {
        replicas = 1
      }

      repoServer = {
        replicas = 1
      }

      applicationSet = {
        replicas = 1
      }

      notifications = {
        enabled = false
      }
    })
  ]
}

resource "kubernetes_manifest" "envops_application" {
  manifest = {
    apiVersion = "argoproj.io/v1alpha1"
    kind       = "Application"

    metadata = {
      name      = "envops"
      namespace = "argocd"

      finalizers = [
        "resources-finalizer.argocd.argoproj.io"
      ]
    }

    spec = {
      project = "default"

      source = {
        repoURL        = var.git_repo_url
        targetRevision = var.git_branch
        path           = "Kubernetes"
      }

      destination = {
        server    = "https://kubernetes.default.svc"
        namespace = "envops-core"
      }

      syncPolicy = {
        automated = {
          prune    = true
          selfHeal = true
        }

        syncOptions = [
          "CreateNamespace=true"
        ]
      }
    }
  }

  depends_on = [
    helm_release.argocd
  ]
}
resource "helm_release" "image_updater" {
  name             = "argocd-image-updater"
  repository       = "https://argoproj.github.io/argo-helm"
  chart            = "argocd-image-updater"
  version          = var.image_updater_chart_version

  namespace        = "argocd"
  create_namespace = false

  wait    = true
  atomic  = true
  timeout = 900

  depends_on = [
    helm_release.argocd
  ]

  values = [
    yamlencode({
      serviceAccount = {
        create = true

        annotations = {
          "eks.amazonaws.com/role-arn" = var.image_updater_role_arn
        }
      }

      extraEnv = [
        {
          name  = "AWS_REGION"
          value = var.aws_region
        }
      ]

      authScripts = {
        enabled = true

        scripts = {
          "ecr-login.sh" = <<-EOF
            #!/bin/sh
            set -eu

            PASSWORD=$(/custom-tools/aws ecr get-login-password --region "$AWS_REGION")

            printf 'AWS:%s\n' "$PASSWORD"
          EOF
        }
      }

      initContainers = [
        {
          name  = "aws-cli"
          image = "amazon/aws-cli:2.27.58"

          command = [
            "/bin/sh",
            "-c"
          ]

          args = [
            "cp \"$(command -v aws)\" /custom-tools/aws"
          ]

               securityContext = {
      runAsUser                = 0
      runAsGroup               = 0
      runAsNonRoot              = false
      allowPrivilegeEscalation = false
    }
          volumeMounts = [
            {
              name      = "custom-tools"
              mountPath = "/custom-tools"
            }
          ]
        }
      ]

      volumes = [
        {
          name = "custom-tools"

          emptyDir = {}
        }
      ]

      volumeMounts = [
        {
          name      = "custom-tools"
          mountPath = "/custom-tools"
        }
      ]

      config = {
        "git.user"  = "envops-image-updater"
        "git.email" = "envops-image-updater@users.noreply.github.com"

        registries = [
          {
            name        = "AWS ECR"
            api_url     = "https://${local.ecr_registry}"
            prefix      = local.ecr_registry
            ping        = true
            insecure    = false
            credentials = "ext:/scripts/ecr-login.sh"
            credsexpire = "11h"
          }
        ]
      }
    })
  ]
}

resource "kubernetes_secret_v1" "git_creds" {
  metadata {
    name      = "git-creds"
    namespace = "argocd"
  }

  type = "Opaque"

  data = {
    username = var.git_username
    password = var.git_token
  }

  depends_on = [
    helm_release.argocd
  ]
}
