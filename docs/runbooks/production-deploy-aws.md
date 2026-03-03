# Production Deploy — AWS EC2

Deploy Chronicle to a single EC2 instance with Docker Compose, SES email, and automated CI/CD.

**Starting point:** AWS account with CLI configured (`aws configure` done).

---

## 1. Generate Secrets

Run this locally. Save the output — you'll need it for `.env`.

```bash
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
echo "CHRONICLE_JWT_SECRET=$(openssl rand -hex 32)"
echo "CHRONICLE_SYNC_TOKEN=$(openssl rand -hex 16)"
echo "MEILI_MASTER_KEY=$(openssl rand -hex 16)"
echo "MINIO_ROOT_PASSWORD=$(openssl rand -hex 24)"
```

---

## 2. Create IAM Role for EC2

The instance needs SSM access (for CI/CD deploys without SSH).

```bash
# Create the role
aws iam create-role \
  --role-name chronicle-ec2 \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": { "Service": "ec2.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }]
  }'

# Attach SSM policy
aws iam attach-role-policy \
  --role-name chronicle-ec2 \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore

# Create instance profile and attach role
aws iam create-instance-profile --instance-profile-name chronicle-ec2
aws iam add-role-to-instance-profile \
  --instance-profile-name chronicle-ec2 \
  --role-name chronicle-ec2
```

---

## 3. Create Security Group

```bash
# Get your default VPC
VPC_ID=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true \
  --query 'Vpcs[0].VpcId' --output text)

# Create security group
SG_ID=$(aws ec2 create-security-group \
  --group-name chronicle-prod \
  --description "Chronicle production" \
  --vpc-id "$VPC_ID" \
  --query 'GroupId' --output text)

# Allow HTTP, HTTPS (Caddy handles TLS)
aws ec2 authorize-security-group-ingress --group-id "$SG_ID" \
  --protocol tcp --port 80 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id "$SG_ID" \
  --protocol tcp --port 443 --cidr 0.0.0.0/0
```

No port 22 needed — SSM handles shell access.

---

## 4. Create SSH Key (emergency access)

```bash
aws ec2 create-key-pair \
  --key-name chronicle-prod \
  --query 'KeyMaterial' --output text > chronicle-prod.pem
chmod 400 chronicle-prod.pem
```

---

## 5. Launch EC2 Instance

```bash
# Find latest Amazon Linux 2023 AMI
AMI_ID=$(aws ec2 describe-images \
  --owners amazon \
  --filters "Name=name,Values=al2023-ami-2023*-x86_64" \
            "Name=state,Values=available" \
  --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
  --output text)

# Launch instance
INSTANCE_ID=$(aws ec2 run-instances \
  --image-id "$AMI_ID" \
  --instance-type t3.medium \
  --key-name chronicle-prod \
  --security-group-ids "$SG_ID" \
  --iam-instance-profile Name=chronicle-ec2 \
  --block-device-mappings '[{
    "DeviceName": "/dev/xvda",
    "Ebs": { "VolumeSize": 50, "VolumeType": "gp3" }
  }]' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=chronicle-prod}]' \
  --query 'Instances[0].InstanceId' --output text)

echo "Instance: $INSTANCE_ID"
```

### Allocate Elastic IP

```bash
ALLOC_ID=$(aws ec2 allocate-address --domain vpc \
  --query 'AllocationId' --output text)

# Wait for instance to be running
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID"

EIP=$(aws ec2 associate-address \
  --instance-id "$INSTANCE_ID" \
  --allocation-id "$ALLOC_ID" \
  --query 'PublicIp' --output text 2>/dev/null)

# Get the actual IP
EIP=$(aws ec2 describe-addresses --allocation-ids "$ALLOC_ID" \
  --query 'Addresses[0].PublicIp' --output text)

echo "Elastic IP: $EIP"
```

**Point your DNS A record to this IP now** (e.g. `chronicle.yourdomain.com → $EIP`).

---

## 6. Install Docker on the Instance

Wait a minute for SSM agent to register, then:

```bash
aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=[
    "dnf install -y docker git",
    "systemctl enable --now docker",
    "usermod -aG docker ec2-user",
    "mkdir -p /usr/local/lib/docker/cli-plugins",
    "curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 -o /usr/local/lib/docker/cli-plugins/docker-compose",
    "chmod +x /usr/local/lib/docker/cli-plugins/docker-compose",
    "docker compose version"
  ]' \
  --comment "Install Docker"
```

Check it completed:

```bash
# List recent commands to find the command ID
aws ssm list-commands --instance-id "$INSTANCE_ID" \
  --query 'Commands[0].[CommandId,Status]' --output text
```

---

## 7. Clone and Configure

```bash
aws ssm start-session --target "$INSTANCE_ID"
```

Inside the SSM session:

```bash
sudo -u ec2-user bash
cd /home/ec2-user
git clone https://github.com/yourorg/chronicle.git
cd chronicle
```

Create `.env` with your real values:

```bash
cat > .env << 'ENVEOF'
# --- Database ---
POSTGRES_DB=chronicle
POSTGRES_USER=chronicle
POSTGRES_PASSWORD=<from step 1>

# --- Auth & Tokens ---
CHRONICLE_JWT_SECRET=<from step 1>
CHRONICLE_SYNC_TOKEN=<from step 1>

# --- Domain ---
CHRONICLE_CORS_ORIGIN=https://chronicle.yourdomain.com
CHRONICLE_DOMAIN=chronicle.yourdomain.com

# --- Search ---
MEILI_MASTER_KEY=<from step 1>

# --- Object Storage (MinIO) ---
MINIO_ROOT_USER=chronicle
MINIO_ROOT_PASSWORD=<from step 1>
S3_BUCKET=chronicle
S3_USE_SSL=false

# --- SMTP (AWS SES — see step 8) ---
SMTP_HOST=email-smtp.eu-west-1.amazonaws.com
SMTP_PORT=587
SMTP_USERNAME=<SES SMTP username>
SMTP_PASSWORD=<SES SMTP password>
SMTP_FROM=noreply@yourdomain.com
SMTP_FROM_NAME=Chronicle

# --- Redis ---
REDIS_URL=redis://redis:6379/0
ENVEOF
```

---

## 8. Set Up AWS SES (Email Verification)

This gives you real email delivery for user signup verification and password resets.

### Verify your domain

```bash
# Request domain verification
aws ses verify-domain-identity --domain yourdomain.com

# Get the verification TXT record
aws ses get-identity-verification-attributes \
  --identities yourdomain.com \
  --query 'VerificationAttributes.*.VerificationToken' --output text
```

Add the TXT record to your DNS:
- **Name:** `_amazonses.yourdomain.com`
- **Type:** TXT
- **Value:** the token from above

### Get DKIM records (improves deliverability)

```bash
aws ses verify-domain-dkim --domain yourdomain.com \
  --query 'DkimTokens' --output text
```

Add 3 CNAME records:
- `<token1>._domainkey.yourdomain.com` → `<token1>.dkim.amazonses.com`
- `<token2>._domainkey.yourdomain.com` → `<token2>.dkim.amazonses.com`
- `<token3>._domainkey.yourdomain.com` → `<token3>.dkim.amazonses.com`

### Create SMTP credentials

```bash
aws iam create-user --user-name chronicle-ses-smtp

aws iam put-user-policy --user-name chronicle-ses-smtp \
  --policy-name ses-send \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": "ses:SendRawEmail",
      "Resource": "*"
    }]
  }'

# Generate SMTP credentials
aws iam create-access-key --user-name chronicle-ses-smtp
```

**Important:** The SMTP username is the `AccessKeyId`. The SMTP password must be derived from the `SecretAccessKey` — it is NOT the secret key itself. Use the [AWS SES SMTP password generator](https://docs.aws.amazon.com/ses/latest/dg/smtp-credentials.html#smtp-credentials-convert) or:

```python
python3 -c "
import hmac, hashlib, base64, sys
key = sys.argv[1]  # SecretAccessKey
region = sys.argv[2]  # e.g. eu-west-1
msg = 'SendRawEmail'
v = 0x04
h = hmac.new(('AWS4' + key).encode(), region.encode(), hashlib.sha256)
h = hmac.new(h.digest(), b'ses', hashlib.sha256)
h = hmac.new(h.digest(), b'aws4_request', hashlib.sha256)
h = hmac.new(h.digest(), msg.encode(), hashlib.sha256)
print(base64.b64encode(bytes([v]) + h.digest()).decode())
" YOUR_SECRET_KEY eu-west-1
```

Put the resulting SMTP username and password in your `.env`.

### Request production access

New SES accounts are sandboxed (can only send to verified emails). Request production access:

```bash
aws sesv2 put-account-details \
  --production-access-enabled \
  --mail-type TRANSACTIONAL \
  --website-url "https://chronicle.yourdomain.com" \
  --use-case-description "Transactional emails: account verification and password resets for Chronicle document collaboration platform" \
  --contact-language EN
```

This typically takes 24 hours to approve. While waiting, you can verify individual test email addresses:

```bash
aws ses verify-email-identity --email-address you@yourdomain.com
```

---

## 9. Update Caddy and Web Config for Production Domain

Before starting the stack, you need two changes.

### Caddyfile

Edit `docker/Caddyfile` for your domain:

```
{$CHRONICLE_DOMAIN:localhost} {
  encode gzip zstd

  @api path /api* /health /ready
  handle @api {
    reverse_proxy api:8787
  }

  @uploads path /api/uploads/*
  handle @uploads {
    reverse_proxy api:8787
  }

  @sync path /ws*
  handle @sync {
    reverse_proxy sync:8788
  }

  handle {
    reverse_proxy web:4173
  }
}
```

Caddy automatically provisions Let's Encrypt TLS when it sees a real domain name (not `:port`).

### WebSocket URL

In `docker-compose.yml`, update the `web` service environment:

```yaml
  web:
    environment:
      VITE_SYNC_URL: wss://${CHRONICLE_DOMAIN:-localhost}/ws
```

---

## 10. Start the Stack

Back in the SSM session on the EC2 instance:

```bash
cd /home/ec2-user/chronicle
docker compose up -d --build
```

First build takes 3-5 minutes. Watch progress:

```bash
docker compose logs -f
```

Verify all services are healthy:

```bash
docker compose ps
```

All 7 services should show `healthy`. Test externally:

```bash
curl -s https://chronicle.yourdomain.com/api/health
```

---

## 11. Set Up CI/CD (GitHub Actions + SSM)

### Create a deploy IAM user

```bash
aws iam create-user --user-name chronicle-deployer

aws iam put-user-policy --user-name chronicle-deployer \
  --policy-name ssm-deploy \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": [
        "ssm:SendCommand",
        "ssm:GetCommandInvocation",
        "ssm:ListCommands"
      ],
      "Resource": "*"
    }]
  }'

aws iam create-access-key --user-name chronicle-deployer
```

### Add GitHub Secrets

In your repo → Settings → Secrets and variables → Actions, add:

| Secret | Value |
|--------|-------|
| `AWS_ACCESS_KEY_ID` | Deployer access key |
| `AWS_SECRET_ACCESS_KEY` | Deployer secret key |
| `AWS_REGION` | Your region (e.g. `eu-west-1`) |
| `EC2_INSTANCE_ID` | Your instance ID |

### Create the workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

concurrency:
  group: production-deploy
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ secrets.AWS_REGION }}

      - name: Deploy to EC2 via SSM
        run: |
          COMMAND_ID=$(aws ssm send-command \
            --instance-ids "${{ secrets.EC2_INSTANCE_ID }}" \
            --document-name "AWS-RunShellScript" \
            --timeout-seconds 300 \
            --parameters 'commands=[
              "cd /home/ec2-user/chronicle",
              "git pull origin main",
              "docker compose up -d --build",
              "docker compose ps"
            ]' \
            --comment "Deploy ${{ github.sha }}" \
            --query "Command.CommandId" --output text)

          echo "Command ID: $COMMAND_ID"

          # Wait for completion
          aws ssm wait command-executed \
            --command-id "$COMMAND_ID" \
            --instance-id "${{ secrets.EC2_INSTANCE_ID }}"

          # Print output
          aws ssm get-command-invocation \
            --command-id "$COMMAND_ID" \
            --instance-id "${{ secrets.EC2_INSTANCE_ID }}" \
            --query "[StandardOutputContent, StandardErrorContent]" \
            --output text
```

Now every push to `main` auto-deploys.

---

## 12. Backups

### Automated daily Postgres backup

On the EC2 instance, create a cron job:

```bash
# Create backup script
cat > /home/ec2-user/chronicle-backup.sh << 'SCRIPT'
#!/bin/bash
set -euo pipefail
BACKUP_DIR="/home/ec2-user/backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Dump Postgres
docker compose -f /home/ec2-user/chronicle/docker-compose.yml exec -T postgres \
  pg_dump -U chronicle chronicle | gzip > "$BACKUP_DIR/chronicle-$TIMESTAMP.sql.gz"

# Keep last 14 days
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +14 -delete

echo "Backup complete: chronicle-$TIMESTAMP.sql.gz"
SCRIPT
chmod +x /home/ec2-user/chronicle-backup.sh

# Schedule daily at 3am
(crontab -l 2>/dev/null; echo "0 3 * * * /home/ec2-user/chronicle-backup.sh >> /home/ec2-user/backups/cron.log 2>&1") | crontab -
```

### Git repos volume

The `/data/repos` Docker volume holds all document content. For full disaster recovery, periodically snapshot the EBS volume:

```bash
# Get the volume ID
VOL_ID=$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].BlockDeviceMappings[0].Ebs.VolumeId' --output text)

# Create snapshot
aws ec2 create-snapshot --volume-id "$VOL_ID" \
  --description "Chronicle backup $(date +%Y%m%d)" \
  --tag-specifications "ResourceType=snapshot,Tags=[{Key=Name,Value=chronicle-backup}]"
```

---

## Quick Reference

| What | Where |
|------|-------|
| App URL | `https://chronicle.yourdomain.com` |
| Shell access | `aws ssm start-session --target $INSTANCE_ID` |
| View logs | `docker compose logs -f api` (or `sync`, `web`, etc.) |
| Restart | `docker compose restart` |
| Full rebuild | `docker compose up -d --build` |
| Postgres shell | `docker compose exec postgres psql -U chronicle chronicle` |
| Check health | `curl https://chronicle.yourdomain.com/api/health` |

---

## Cost Estimate

| Resource | Monthly |
|----------|---------|
| t3.medium (on-demand) | ~$30 |
| 50GB gp3 EBS | ~$4 |
| Elastic IP (attached) | $0 |
| SES (transactional) | < $1 |
| **Total** | **~$35/mo** |

Reserve the instance for 1-year savings: ~$19/mo instead of $30.
