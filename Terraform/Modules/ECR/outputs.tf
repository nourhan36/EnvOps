output "frontend_repository_url" {
  value = aws_ecr_repository.repos["frontend"].repository_url
}

output "backend_repository_url" {
  value = aws_ecr_repository.repos["backend"].repository_url
}