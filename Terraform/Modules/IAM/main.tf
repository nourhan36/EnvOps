data "aws_iam_policy_document" "eso_secrets_policy" {
  statement {
    effect = "Allow"

    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret"
    ]

    resources = [
      "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:envops/*"
    ]
  }
}

resource "aws_iam_policy" "eso_secrets_policy" {
  name        = var.policy_name
  description = "Allows ESO to read EnvOps secrets from AWS Secrets Manager."
  policy      = data.aws_iam_policy_document.eso_secrets_policy.json
}


resource "aws_iam_policy" "jenkins_agent_policy" {
  name = "${var.project_name}-jenkins_agent_policy"

  policy = jsonencode(
    {
      "Version" : "2012-10-17",
      "Statement" : [
        {
          "Effect" : "Allow",
          "Action" : [
            "ecr:GetAuthorizationToken"
          ],
          "Resource" : "*"
        },
        {
          "Effect" : "Allow",
          "Action" : [
            "ecr:BatchCheckLayerAvailability",
            "ecr:InitiateLayerUpload",
            "ecr:UploadLayerPart",
            "ecr:CompleteLayerUpload",
            "ecr:PutImage",
            "ecr:BatchGetImage",
            "ecr:DescribeImages"
          ],
          "Resource" : "*"
        }
      ]
    }
  )
}
