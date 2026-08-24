#!/bin/bash

set -e

echo "========================================="
echo " EnvOps AWS / EKS Pre-Destroy Cleanup"
echo "========================================="

CLUSTER_NAME="envops-dev-cluster"
AWS_REGION="us-east-1"

echo
echo ">>> 1. Current Kubernetes context"
kubectl config current-context || true

echo
echo ">>> 2. Delete application workloads"
kubectl delete application --all -n argocd --ignore-not-found=true || true

echo
echo ">>> 3. Wait for ArgoCD Applications to disappear"
sleep 10

echo
echo ">>> 4. Delete EnvOps namespace"
kubectl delete namespace envops-core --ignore-not-found=true --timeout=120s || true

echo
echo ">>> 5. Delete remaining namespaces created by the application"
for ns in \
    envops \
    monitoring \
    sandbox \
    external-secrets
do
    kubectl delete namespace "$ns" --ignore-not-found=true --timeout=120s || true
done

echo
echo ">>> 6. Delete LoadBalancer services"
kubectl get svc -A --no-headers 2>/dev/null | \
awk '$5 ~ /LoadBalancer/ {print $1, $2}' | \
while read ns svc; do
    echo "Deleting LoadBalancer service: $ns/$svc"
    kubectl delete svc "$svc" -n "$ns" --ignore-not-found=true || true
done

echo
echo ">>> 7. Delete PVCs"
kubectl get pvc -A --no-headers 2>/dev/null | \
awk '{print $1, $2}' | \
while read ns pvc; do
    echo "Deleting PVC: $ns/$pvc"
    kubectl delete pvc "$pvc" -n "$ns" --ignore-not-found=true || true
done

echo
echo ">>> 8. Delete remaining pods"
kubectl delete pods --all -A --ignore-not-found=true || true

echo
echo ">>> 9. Delete remaining services except Kubernetes internal services"
kubectl get svc -A --no-headers 2>/dev/null | \
awk '$2 != "kubernetes" {print $1, $2}' | \
while read ns svc; do
    echo "Deleting service: $ns/$svc"
    kubectl delete svc "$svc" -n "$ns" --ignore-not-found=true || true
done

echo
echo ">>> 10. Delete External Secrets resources"
kubectl delete externalsecret --all -A --ignore-not-found=true || true
kubectl delete secretstore --all -A --ignore-not-found=true || true
kubectl delete clustersecretstore --all --ignore-not-found=true || true

echo
echo ">>> 11. Delete ArgoCD"
kubectl delete namespace argocd --ignore-not-found=true --timeout=120s || true

echo
echo ">>> 12. Delete External Secrets namespace"
kubectl delete namespace external-secrets --ignore-not-found=true --timeout=120s || true

echo
echo ">>> 13. Delete remaining PersistentVolumes"
kubectl get pv --no-headers 2>/dev/null | \
awk '{print $1}' | \
while read pv; do
    echo "Deleting PV: $pv"
    kubectl delete pv "$pv" --ignore-not-found=true || true
done

echo
echo ">>> 14. Check remaining Kubernetes resources"
kubectl get all -A || true

echo
echo "========================================="
echo " AWS SIDE CLEANUP"
echo "========================================="

echo
echo ">>> 15. Check EKS Load Balancers"
aws elbv2 describe-load-balancers \
    --region "$AWS_REGION" \
    --query 'LoadBalancers[*].[LoadBalancerArn,LoadBalancerName,VpcId]' \
    --output table || true

echo
echo ">>> 16. Check classic ELBs"
aws elb describe-load-balancers \
    --region "$AWS_REGION" \
    --query 'LoadBalancerDescriptions[*].[LoadBalancerName,VPCId]' \
    --output table || true

echo
echo ">>> 17. Check ENIs attached to EKS/VPC"
VPC_ID=$(aws eks describe-cluster \
    --name "$CLUSTER_NAME" \
    --region "$AWS_REGION" \
    --query 'cluster.resourcesVpcConfig.vpcId' \
    --output text 2>/dev/null || true)

if [ -n "$VPC_ID" ] && [ "$VPC_ID" != "None" ]; then

    echo "VPC: $VPC_ID"

    aws ec2 describe-network-interfaces \
        --region "$AWS_REGION" \
        --filters Name=vpc-id,Values="$VPC_ID" \
        --query 'NetworkInterfaces[*].[NetworkInterfaceId,Status,Description,InterfaceType,PrivateIpAddress]' \
        --output table || true

    echo
    echo ">>> 18. Check NAT Gateways"

    aws ec2 describe-nat-gateways \
        --region "$AWS_REGION" \
        --filter Name=vpc-id,Values="$VPC_ID" \
        --query 'NatGateways[*].[NatGatewayId,State,SubnetId]' \
        --output table || true

    echo
    echo ">>> 19. Check VPC endpoints"

    aws ec2 describe-vpc-endpoints \
        --region "$AWS_REGION" \
        --filters Name=vpc-id,Values="$VPC_ID" \
        --query 'VpcEndpoints[*].[VpcEndpointId,State,ServiceName]' \
        --output table || true

    echo
    echo ">>> 20. Check Internet Gateways"

    aws ec2 describe-internet-gateways \
        --region "$AWS_REGION" \
        --filters Name=attachment.vpc-id,Values="$VPC_ID" \
        --query 'InternetGateways[*].[InternetGatewayId,Attachments[0].State]' \
        --output table || true

    echo
    echo ">>> 21. Check Route Tables"

    aws ec2 describe-route-tables \
        --region "$AWS_REGION" \
        --filters Name=vpc-id,Values="$VPC_ID" \
        --query 'RouteTables[*].[RouteTableId,Associations[*].Main]' \
        --output table || true

    echo
    echo ">>> 22. Check Security Groups"

    aws ec2 describe-security-groups \
        --region "$AWS_REGION" \
        --filters Name=vpc-id,Values="$VPC_ID" \
        --query 'SecurityGroups[*].[GroupId,GroupName]' \
        --output table || true

fi

echo
echo "========================================="
echo " EKS STATUS"
echo "========================================="

aws eks describe-cluster \
    --name "$CLUSTER_NAME" \
    --region "$AWS_REGION" \
    --query 'cluster.[name,status,endpoint]' \
    --output table 2>/dev/null || true

echo
echo "========================================="
echo " Cleanup completed"
echo "========================================="

echo
echo "IMPORTANT:"
echo "Review the AWS resources shown above before terraform destroy."
echo
echo "Next command:"
echo
echo "terraform plan -destroy -var-file=envs/dev.tfvars"
echo
echo "Then:"
echo
echo "terraform destroy -var-file=envs/dev.tfvars"