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

Edit `.env` and set real values. The app refuses admin and metrics access while the example placeholders are in place.
```ini
POSTGRES_PASSWORD="<openssl rand -hex 24>"
ADMIN_API_KEY="<openssl rand -hex 32>"
METRICS_AUTH_TOKEN="<openssl rand -hex 32>"
API_KEY_SALT="<openssl rand -hex 16>"   # set before creating your first site
RETENTION_DAYS=90
```
`docker-compose.yml` builds `DATABASE_URL` from `POSTGRES_PASSWORD`, so you do not set it yourself.

**Proxy trust.** Compose binds the app to `127.0.0.1:3000`. Run a TLS reverse proxy in front of it and set
`TRUST_PROXY=true` only then (and `TRUSTED_PROXY_HOPS` if more than one proxy is in the chain).
Never set `TRUST_PROXY=true` while port 3000 is reachable directly: clients could then choose their own IP
and bypass per-IP rate limiting.

### 3. Launch Services

```bash
docker compose up -d
```

The `db-init` job creates the tables (`prisma db push`) before the app starts. Verify:
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

Pre-configured Kubernetes manifests are provided in `deploy/kubernetes/trafficpulse.yaml` (it creates the `trafficpulse` namespace).
Create the `trafficpulse-env` secret first (DATABASE_URL, ADMIN_API_KEY, METRICS_AUTH_TOKEN, API_KEY_SALT, ...), and run
`prisma db push` once against the database (for example from a CI job using the image's builder stage).
The metrics endpoint requires `Authorization: Bearer $METRICS_AUTH_TOKEN`, so configure your Prometheus scrape job with it.

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
docker compose exec postgres pg_dump -U trafficpulse trafficpulse > backup_$(date +%Y%m%d).sql
```

To restore from a backup:
```bash
cat backup.sql | docker compose exec -T postgres psql -U trafficpulse trafficpulse
```

