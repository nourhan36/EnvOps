#!/bin/bash

set -e

# ============================================================
# EnvOps AWS / EKS Pre-Destroy Cleanup
# ============================================================

CLUSTER_NAME="envops-dev-cluster"
AWS_REGION="us-east-1"

echo
echo "============================================================"
echo " EnvOps AWS / EKS Pre-Destroy Cleanup"
echo "============================================================"
echo

# ------------------------------------------------------------
# 1. Check Kubernetes context
# ------------------------------------------------------------

echo ">>> 1. Current Kubernetes context"

kubectl config current-context || true

echo

echo ">>> EKS cluster"

aws eks describe-cluster \
    --name "$CLUSTER_NAME" \
    --region "$AWS_REGION" \
    --query 'cluster.[name,status,endpoint]' \
    --output table 2>/dev/null || true


# ------------------------------------------------------------
# 2. Get VPC ID
# ------------------------------------------------------------

echo
echo ">>> 2. Detect EKS VPC"

VPC_ID=$(aws eks describe-cluster \
    --name "$CLUSTER_NAME" \
    --region "$AWS_REGION" \
    --query 'cluster.resourcesVpcConfig.vpcId' \
    --output text 2>/dev/null || true)

if [ -n "$VPC_ID" ] && [ "$VPC_ID" != "None" ]; then
    echo "VPC ID: $VPC_ID"
else
    echo "WARNING: Could not determine VPC ID"
fi


# ------------------------------------------------------------
# 3. Delete ArgoCD Applications
# ------------------------------------------------------------

echo
echo ">>> 3. Delete ArgoCD Applications"

kubectl delete application --all \
    -n argocd \
    --ignore-not-found=true || true


echo
echo ">>> Waiting for ArgoCD applications to disappear"

sleep 15


# ------------------------------------------------------------
# 4. Delete Ingresses
# ------------------------------------------------------------

echo
echo ">>> 4. Delete all Ingresses"

kubectl delete ingress --all \
    -A \
    --ignore-not-found=true || true


echo
echo ">>> Waiting for Ingress / LoadBalancer cleanup"

sleep 30


# ------------------------------------------------------------
# 5. Delete LoadBalancer services
# ------------------------------------------------------------

echo
echo ">>> 5. Delete LoadBalancer services"

kubectl get svc -A --no-headers 2>/dev/null |
awk '$5 ~ /LoadBalancer/ {print $1, $2}' |
while read -r ns svc; do

    if [ -n "$ns" ] && [ -n "$svc" ]; then
        echo "Deleting LoadBalancer service: $ns/$svc"

        kubectl delete svc "$svc" \
            -n "$ns" \
            --ignore-not-found=true || true
    fi

done


echo
echo ">>> Waiting for AWS LoadBalancer cleanup"

sleep 60


# ------------------------------------------------------------
# 6. Delete Jobs
# ------------------------------------------------------------

echo
echo ">>> 6. Delete Jobs"

kubectl delete jobs \
    --all \
    -A \
    --ignore-not-found=true || true


# ------------------------------------------------------------
# 7. Delete CronJobs
# ------------------------------------------------------------

echo
echo ">>> 7. Delete CronJobs"

kubectl delete cronjobs \
    --all \
    -A \
    --ignore-not-found=true || true


# ------------------------------------------------------------
# 8. Delete Deployments
# ------------------------------------------------------------

echo
echo ">>> 8. Delete Deployments"

kubectl delete deployments \
    --all \
    -A \
    --ignore-not-found=true || true


# ------------------------------------------------------------
# 9. Delete StatefulSets
# ------------------------------------------------------------

echo
echo ">>> 9. Delete StatefulSets"

kubectl delete statefulsets \
    --all \
    -A \
    --ignore-not-found=true || true


# ------------------------------------------------------------
# 10. Delete DaemonSets
# ------------------------------------------------------------

echo
echo ">>> 10. Delete DaemonSets"

kubectl delete daemonsets \
    --all \
    -A \
    --ignore-not-found=true || true


# ------------------------------------------------------------
# 11. Delete PVCs
# ------------------------------------------------------------

echo
echo ">>> 11. Delete PVCs"

kubectl get pvc -A --no-headers 2>/dev/null |
awk '{print $1, $2}' |
while read -r ns pvc; do

    if [ -n "$ns" ] && [ -n "$pvc" ]; then
        echo "Deleting PVC: $ns/$pvc"

        kubectl delete pvc "$pvc" \
            -n "$ns" \
            --ignore-not-found=true || true
    fi

done


# ------------------------------------------------------------
# 12. Delete remaining Pods
# ------------------------------------------------------------

echo
echo ">>> 12. Delete remaining Pods"

kubectl delete pods \
    --all \
    -A \
    --ignore-not-found=true || true


# ------------------------------------------------------------
# 13. Delete remaining Services
# ------------------------------------------------------------

echo
echo ">>> 13. Delete remaining Services"

kubectl get svc -A --no-headers 2>/dev/null |
awk '$2 != "kubernetes" {print $1, $2}' |
while read -r ns svc; do

    if [ -n "$ns" ] && [ -n "$svc" ]; then

        echo "Deleting service: $ns/$svc"

        kubectl delete svc "$svc" \
            -n "$ns" \
            --ignore-not-found=true || true

    fi

done


# ------------------------------------------------------------
# 14. Delete External Secrets resources
# ------------------------------------------------------------

echo
echo ">>> 14. Delete External Secrets resources"

kubectl delete externalsecret \
    --all \
    -A \
    --ignore-not-found=true || true

kubectl delete secretstore \
    --all \
    -A \
    --ignore-not-found=true || true

kubectl delete clustersecretstore \
    --all \
    --ignore-not-found=true || true


# ------------------------------------------------------------
# 15. Delete EnvOps namespaces
# ------------------------------------------------------------

echo
echo ">>> 15. Delete EnvOps namespaces"

for ns in \
    envops-core \
    envops \
    sandbox
do

    echo "Deleting namespace: $ns"

    kubectl delete namespace "$ns" \
        --ignore-not-found=true \
        --timeout=120s || true

done


# ------------------------------------------------------------
# 16. Delete monitoring namespace
# ------------------------------------------------------------

echo
echo ">>> 16. Delete monitoring namespace"

kubectl delete namespace monitoring \
    --ignore-not-found=true \
    --timeout=120s || true


# ------------------------------------------------------------
# 17. Delete External Secrets namespace
# ------------------------------------------------------------

echo
echo ">>> 17. Delete external-secrets namespace"

kubectl delete namespace external-secrets \
    --ignore-not-found=true \
    --timeout=120s || true


# ------------------------------------------------------------
# 18. Delete ArgoCD namespace
# ------------------------------------------------------------

echo
echo ">>> 18. Delete ArgoCD namespace"

kubectl delete namespace argocd \
    --ignore-not-found=true \
    --timeout=120s || true


# ------------------------------------------------------------
# 19. Delete Jenkins namespace
# ------------------------------------------------------------

echo
echo ">>> 19. Delete Jenkins namespace"

kubectl delete namespace jenkins \
    --ignore-not-found=true \
    --timeout=120s || true


# ------------------------------------------------------------
# 20. Delete remaining PersistentVolumes
# ------------------------------------------------------------

echo
echo ">>> 20. Delete remaining PersistentVolumes"

kubectl get pv --no-headers 2>/dev/null |
awk '{print $1}' |
while read -r pv; do

    if [ -n "$pv" ]; then

        echo "Deleting PV: $pv"

        kubectl delete pv "$pv" \
            --ignore-not-found=true || true

    fi

done


# ------------------------------------------------------------
# 21. Check stuck namespaces
# ------------------------------------------------------------

echo
echo ">>> 21. Check namespaces still terminating"

kubectl get namespaces 2>/dev/null || true


# ------------------------------------------------------------
# 22. Check Kubernetes finalizers
# ------------------------------------------------------------

echo
echo ">>> 22. Check Kubernetes resources with finalizers"

if command -v jq >/dev/null 2>&1; then

    kubectl get namespace -o json 2>/dev/null |
    jq -r '
        .items[]
        | select(.metadata.finalizers != null)
        | "\(.metadata.name): \(.metadata.finalizers | join(","))"
    ' || true

else

    echo "jq is not installed; skipping detailed finalizer check."

fi


# ------------------------------------------------------------
# 23. Check remaining Kubernetes resources
# ------------------------------------------------------------

echo
echo ">>> 23. Remaining Kubernetes resources"

kubectl get all -A || true

echo
echo ">>> Remaining PVCs"

kubectl get pvc -A || true

echo
echo ">>> Remaining PVs"

kubectl get pv || true

echo
echo ">>> Remaining Ingresses"

kubectl get ingress -A || true

echo
echo ">>> Remaining LoadBalancer services"

kubectl get svc -A \
    --field-selector spec.type=LoadBalancer || true


# ============================================================
# AWS SIDE CLEANUP / CHECKS
# ============================================================

echo
echo "============================================================"
echo " AWS SIDE CLEANUP / CHECKS"
echo "============================================================"


# ------------------------------------------------------------
# 24. Check ALB / NLB
# ------------------------------------------------------------

echo
echo ">>> 24. Check AWS Load Balancers"

aws elbv2 describe-load-balancers \
    --region "$AWS_REGION" \
    --query 'LoadBalancers[*].[LoadBalancerArn,LoadBalancerName,VpcId,State.Code]' \
    --output table || true


# ------------------------------------------------------------
# 25. Check Classic ELB
# ------------------------------------------------------------

echo
echo ">>> 25. Check Classic ELBs"

aws elb describe-load-balancers \
    --region "$AWS_REGION" \
    --query 'LoadBalancerDescriptions[*].[LoadBalancerName,VPCId]' \
    --output table || true


# ------------------------------------------------------------
# 26. Check ENIs
# ------------------------------------------------------------

if [ -n "$VPC_ID" ] && [ "$VPC_ID" != "None" ]; then

    echo
    echo ">>> 26. Check Network Interfaces"

    aws ec2 describe-network-interfaces \
        --region "$AWS_REGION" \
        --filters Name=vpc-id,Values="$VPC_ID" \
        --query 'NetworkInterfaces[*].[NetworkInterfaceId,Status,Description,InterfaceType,PrivateIpAddress,Attachment.InstanceId]' \
        --output table || true

fi


# ------------------------------------------------------------
# 27. Check NAT Gateways
# ------------------------------------------------------------

if [ -n "$VPC_ID" ] && [ "$VPC_ID" != "None" ]; then

    echo
    echo ">>> 27. Check NAT Gateways"

    aws ec2 describe-nat-gateways \
        --region "$AWS_REGION" \
        --filter Name=vpc-id,Values="$VPC_ID" \
        --query 'NatGateways[*].[NatGatewayId,State,SubnetId]' \
        --output table || true

fi


# ------------------------------------------------------------
# 28. Check VPC Endpoints
# ------------------------------------------------------------

if [ -n "$VPC_ID" ] && [ "$VPC_ID" != "None" ]; then

    echo
    echo ">>> 28. Check VPC Endpoints"

    aws ec2 describe-vpc-endpoints \
        --region "$AWS_REGION" \
        --filters Name=vpc-id,Values="$VPC_ID" \
        --query 'VpcEndpoints[*].[VpcEndpointId,State,ServiceName]' \
        --output table || true

fi


# ------------------------------------------------------------
# 29. Check Internet Gateway
# ------------------------------------------------------------

if [ -n "$VPC_ID" ] && [ "$VPC_ID" != "None" ]; then

    echo
    echo ">>> 29. Check Internet Gateways"

    aws ec2 describe-internet-gateways \
        --region "$AWS_REGION" \
        --filters Name=attachment.vpc-id,Values="$VPC_ID" \
        --query 'InternetGateways[*].[InternetGatewayId,Attachments[0].State]' \
        --output table || true

fi


# ------------------------------------------------------------
# 30. Check Route Tables
# ------------------------------------------------------------

if [ -n "$VPC_ID" ] && [ "$VPC_ID" != "None" ]; then

    echo
    echo ">>> 30. Check Route Tables"

    aws ec2 describe-route-tables \
        --region "$AWS_REGION" \
        --filters Name=vpc-id,Values="$VPC_ID" \
        --query 'RouteTables[*].[RouteTableId,Associations[*].Main]' \
        --output table || true

fi


# ------------------------------------------------------------
# 31. Check Security Groups
# ------------------------------------------------------------

if [ -n "$VPC_ID" ] && [ "$VPC_ID" != "None" ]; then

    echo
    echo ">>> 31. Check Security Groups"

    aws ec2 describe-security-groups \
        --region "$AWS_REGION" \
        --filters Name=vpc-id,Values="$VPC_ID" \
        --query 'SecurityGroups[*].[GroupId,GroupName]' \
        --output table || true

fi


# ------------------------------------------------------------
# 32. Check EBS volumes
# ------------------------------------------------------------

echo
echo ">>> 32. Check EBS volumes"

if [ -n "$VPC_ID" ] && [ "$VPC_ID" != "None" ]; then

    aws ec2 describe-volumes \
        --region "$AWS_REGION" \
        --filters \
            Name=status,Values=available \
        --query 'Volumes[*].[VolumeId,State,Size,AvailabilityZone,CreateTime]' \
        --output table || true

fi


# ------------------------------------------------------------
# 33. Check EBS volumes attached to instances
# ------------------------------------------------------------

echo
echo ">>> 33. Check attached EBS volumes"

aws ec2 describe-volumes \
    --region "$AWS_REGION" \
    --filters Name=status,Values=in-use \
    --query 'Volumes[*].[VolumeId,State,Size,AvailabilityZone,Attachments[0].InstanceId]' \
    --output table || true


# ------------------------------------------------------------
# 34. Check Elastic IPs
# ------------------------------------------------------------

echo
echo ">>> 34. Check Elastic IPs"

aws ec2 describe-addresses \
    --region "$AWS_REGION" \
    --query 'Addresses[*].[AllocationId,PublicIp,AssociationId,NetworkInterfaceId]' \
    --output table || true


# ------------------------------------------------------------
# 35. Check VPC Peering
# ------------------------------------------------------------

if [ -n "$VPC_ID" ] && [ "$VPC_ID" != "None" ]; then

    echo
    echo ">>> 35. Check VPC Peering Connections"

    aws ec2 describe-vpc-peering-connections \
        --region "$AWS_REGION" \
        --filters \
            Name=requester-vpc-info.vpc-id,Values="$VPC_ID" \
        --query 'VpcPeeringConnections[*].[VpcPeeringConnectionId,Status.Code,AccepterVpcInfo.VpcId]' \
        --output table || true

fi


# ------------------------------------------------------------
# 36. Check Transit Gateway attachments
# ------------------------------------------------------------

if [ -n "$VPC_ID" ] && [ "$VPC_ID" != "None" ]; then

    echo
    echo ">>> 36. Check Transit Gateway VPC Attachments"

    aws ec2 describe-transit-gateway-vpc-attachments \
        --region "$AWS_REGION" \
        --filters Name=vpc-id,Values="$VPC_ID" \
        --query 'TransitGatewayVpcAttachments[*].[TransitGatewayAttachmentId,State,TransitGatewayId]' \
        --output table || true

fi


# ------------------------------------------------------------
# 37. Final EKS status
# ------------------------------------------------------------

echo
echo ">>> 37. Final EKS status"

aws eks describe-cluster \
    --name "$CLUSTER_NAME" \
    --region "$AWS_REGION" \
    --query 'cluster.[name,status,endpoint]' \
    --output table 2>/dev/null || true


# ============================================================
# FINAL MESSAGE
# ============================================================

echo
echo "============================================================"
echo " Pre-Destroy Cleanup Completed"
echo "============================================================"

echo
echo "IMPORTANT:"
echo
echo "This script CHECKS AWS resources but does NOT blindly delete:"
echo
echo "  - ENIs"
echo "  - EBS volumes"
echo "  - Elastic IPs"
echo "  - Security Groups"
echo "  - Route Tables"
echo "  - NAT Gateways"
echo "  - VPC Endpoints"
echo "  - Internet Gateways"
echo "  - VPC Peering"
echo "  - Transit Gateway attachments"
echo
echo "Review the output above before Terraform destroy."
echo

echo "Recommended next commands:"
echo
echo "  terraform plan -destroy -var-file=envs/dev.tfvars"
echo
echo "Then, if the plan looks correct:"
echo
echo "  terraform destroy -var-file=envs/dev.tfvars"
echo

echo "============================================================"