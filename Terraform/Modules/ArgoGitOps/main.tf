locals {
  ecr_registry = split("/", var.backend_repository_url)[0]
}

resource "helm_release" "argocd" {
  name             = "argocd"
  repository       = "https://argoproj.github.io/argo-helm"
  chart            = "argo-cd"
  version          = var.argocd_chart_version

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

      extraObjects = [
        {
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
                enabled  = true
                prune    = true
                selfHeal = true
              }

              syncOptions = [
                "CreateNamespace=true"
              ]
            }
          }
        }
      ]
    })
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

          image = "amazon/aws-cli:2"

          command = [
            "/bin/sh",
            "-c"
          ]

          args = [
            "cp \"$(command -v aws)\" /custom-tools/aws"
          ]

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
        "git.user" = "envops-image-updater"

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

      extraObjects = [
        {
          apiVersion = "v1"
          kind       = "Secret"

          metadata = {
            name      = "git-creds"
            namespace = "argocd"
          }

          type = "Opaque"

          stringData = {
            username = var.git_username
            password = var.git_token
          }
        },
        {
          apiVersion = "argocd-image-updater.argoproj.io/v1alpha1"
          kind       = "ImageUpdater"

          metadata = {
            name      = "envops-image-updater"
            namespace = "argocd"
          }

          spec = {
            writeBackConfig = {
              method = "git:secret:git-creds"

              gitConfig = {
                repository     = var.git_repo_url
                branch         = var.git_branch
                writeBackTarget = "kustomization"
              }
            }

            applicationRefs = [
              {
                namePattern = "envops"

                images = [
                  {
                    alias     = "backend"
                    imageName = "${var.backend_repository_url}:latest"

                    commonUpdateSettings = {
                      updateStrategy = "digest"
                      forceUpdate    = true
                    }

                    manifestTargets = {
                      kustomize = {
                        name = "REPLACE_WITH_ECR_BACKEND_IMAGE"
                      }
                    }
                  },
                  {
                    alias     = "frontend"
                    imageName = "${var.frontend_repository_url}:latest"

                    commonUpdateSettings = {
                      updateStrategy = "digest"
                      forceUpdate    = true
                    }

                    manifestTargets = {
                      kustomize = {
                        name = "REPLACE_WITH_ECR_FRONTEND_IMAGE"
                      }
                    }
                  }
                ]
              }
            ]
          }
        }
      ]
    })
  ]
}
