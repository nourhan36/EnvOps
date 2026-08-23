# resource "helm_release" "cert_manager" {
#   name             = "cert-manager"
#   repository       = "https://charts.jetstack.io"
#   chart            = "cert-manager"
#   namespace        = "cert-manager"
#   create_namespace = true

#   set {
#     name  = "crds.enabled"
#     value = "true"
#   }

#   atomic  = true
#   wait    = true
#   timeout = 600

#   depends_on = [
#     helm_release.nginx_ingress
#   ]
# }

# # resource "kubernetes_manifest" "letsencrypt_issuer" {
# #   manifest = {
# #     apiVersion = "cert-manager.io/v1"
# #     kind       = "ClusterIssuer"

# #     metadata = {
# #       name = "letsencrypt-prod"
# #     }

# #     spec = {
# #       acme = {
# #         email  = var.acme_email
# #         server = "https://acme-v02.api.letsencrypt.org/directory"

# #         privateKeySecretRef = {
# #           name = "letsencrypt-prod"
# #         }

# #         solvers = [
# #           {
# #             http01 = {
# #               ingress = {
# #                 ingressClassName = "nginx"
# #               }
# #             }
# #           }
# #         ]
# #       }
# #     }
# #   }

# #   depends_on = [
# #     helm_release.cert_manager
# #   ]
# # }