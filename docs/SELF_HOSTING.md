# Self-Hosting Guide

This guide covers deploying TrafficPulse in production environments using Docker Compose, Kubernetes, or direct bare-metal / VM instances.

## Quickstart with Docker Compose

TrafficPulse provides a production-ready `docker-compose.yml` including the dashboard application, PostgreSQL 16 database, and optional Redis rate-limiting service.

### 1. Clone and Configure

```bash
git clone https://github.com/amalrn98/TrafficPulse.git
cd TrafficPulse

# Copy environment configuration
cp .env.example .env
```

### 2. Configure Environment Variables

Edit `.env` and configure:
```ini
ADMIN_API_KEY="your-high-entropy-admin-key"
DATABASE_URL="postgresql://postgres:postgres@postgres:5432/trafficpulse?schema=public"
NEXTAUTH_SECRET="random-32-byte-hex-string"
TRUST_PROXY=true
RETENTION_DAYS=90
```

### 3. Launch Services

```bash
docker compose up -d
```

Verify services are healthy:
```bash
docker compose ps
curl http://localhost:3000/api/health
```

## Production Architecture Recommendations

For high-throughput deployments (>= 1,000 requests / sec):
1. **Reverse Proxy / Ingress**: Place Nginx, Traefik, or Cloudflare in front of the dashboard for SSL termination.
2. **Database**: Use managed PostgreSQL (AWS RDS, GCP Cloud SQL, or Neon) with `pgBouncer` connection pooling.
3. **Redis**: Enable `REDIS_URL` in `.env` for multi-instance distributed rate limiting.
4. **Data Retention**: The built-in retention job purges records older than `RETENTION_DAYS` (default 90). Schedule pruning via cron:
```bash
# Nightly retention cleanup at 02:00 UTC
0 2 * * * curl -X POST http://localhost:3000/api/v1/admin/retention/prune -H "Authorization: Bearer $ADMIN_API_KEY"
```

## Kubernetes Deployment

Pre-configured Kubernetes manifests are provided in `deploy/kubernetes/trafficpulse.yaml`:

```bash
kubectl apply -f deploy/kubernetes/trafficpulse.yaml
```

The manifest configures:
- Horizontal Pod Autoscaler (HPA) targeting 70% CPU utilization.
- Distinct liveness (`/api/health/liveness`) and readiness (`/api/health`) probes.
- Read-only root filesystem with ephemeral `/tmp` volume.
- Non-root user (UID 1001) security context.

## Backups and Recovery

To back up your PostgreSQL analytics data:
```bash
docker compose exec postgres pg_dump -U postgres trafficpulse > backup_$(date +%Y%m%d).sql
```

To restore from a backup:
```bash
cat backup.sql | docker compose exec -T postgres psql -U postgres trafficpulse
```

