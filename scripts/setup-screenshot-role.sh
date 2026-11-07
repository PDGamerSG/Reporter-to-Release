#!/bin/sh
# Lets the production Vercel project read and write report screenshots.
# It trusts Vercel's OIDC issuer, so no long-lived AWS key is created.
set -eu
account=$(aws sts get-caller-identity --query Account --output text)
team=pallab-das-projects-d3f377fd
bucket=r2r-report-screenshots-$account
role=r2r-vercel-screenshots
provider=arn:aws:iam::$account:oidc-provider/oidc.vercel.com/$team
aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$provider" >/dev/null 2>&1 ||
  aws iam create-open-id-connect-provider --url "https://oidc.vercel.com/$team" \
    --client-id-list "https://vercel.com/$team" >/dev/null
trust="{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Federated\":\"$provider\"},\"Action\":\"sts:AssumeRoleWithWebIdentity\",\"Condition\":{\"StringEquals\":{\"oidc.vercel.com/$team:aud\":\"https://vercel.com/$team\",\"oidc.vercel.com/$team:sub\":\"owner:$team:project:reporter-to-release:environment:production\"}}}]}"
aws iam get-role --role-name "$role" >/dev/null 2>&1 ||
  aws iam create-role --role-name "$role" --assume-role-policy-document "$trust" >/dev/null
aws iam put-role-policy --role-name "$role" --policy-name screenshots --policy-document \
  "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"s3:PutObject\",\"s3:GetObject\"],\"Resource\":\"arn:aws:s3:::$bucket/reports/*\"}]}"
aws iam get-role --role-name "$role" --query Role.Arn --output text
