resource "helm_release" "nginx_ingress" {
name             = "ingress-nginx"
repository       = "https://kubernetes.github.io/ingress-nginx"
chart            = "ingress-nginx"
namespace        = "ingress-nginx"
create_namespace = true

atomic  = true
wait    = true
timeout = 600

set {
name  = "controller.service.type"
value = "LoadBalancer"
}
}
