#!/usr/bin/env bash
# Small Hours on DigitalOcean. Run from the repo root after `doctl auth init` once.
#   deploy/do.sh            build both images, push, create or update the app
#   deploy/do.sh secrets    push the secrets from .env into the app (run once, and after rotating a key)
set -euo pipefail
cd "$(dirname "$0")/.."
REG=${DO_REGISTRY:-small-hours}
APP=small-hours
need() { command -v "$1" >/dev/null || { echo "missing $1"; exit 1; }; }
need doctl; need docker
doctl account get >/dev/null || { echo "run: doctl auth init"; exit 1; }

registry() { doctl registry get >/dev/null 2>&1 || doctl registry create "$REG" --subscription-tier basic --region fra1; doctl registry login; }
app_id() { doctl apps list --format ID,Spec.Name --no-header | awk -v n="$APP" '$2==n{print $1}'; }
app_url() { doctl apps get "$(app_id)" --format DefaultIngress --no-header; }

if [[ "${1:-}" == "secrets" ]]; then
  [[ -f .env ]] || { echo "no .env"; exit 1; }
  set -a; source .env; set +a
  ID=$(app_id); [[ -n "$ID" ]] || { echo "create the app first: deploy/do.sh"; exit 1; }
  doctl apps spec get "$ID" > /tmp/ft-spec.yaml
  python3 - "$ID" <<'PY'
import os, sys, yaml
spec = yaml.safe_load(open("/tmp/ft-spec.yaml"))
secrets = ["OPENROUTER_API_KEY", "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SH_OPS_TOKEN", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_RESIDENT", "STRIPE_PRICE_PATRON", "SH_OR_MODEL_ROUTINE", "SH_OR_MODEL_STAKES", "SH_OR_MODEL_REFLECT", "GEMINI_API_KEY", "SH_BOAT_SECRET", "RECRAFT_API_KEY"]
for svc in spec["services"]:
    if svc["name"] != "town": continue
    envs = [e for e in svc.get("envs", []) if e["key"] not in secrets]
    for k in secrets:
        v = os.environ.get(k, "")
        if v: envs.append({"key": k, "value": v, "type": "SECRET"})
    svc["envs"] = envs
yaml.safe_dump(spec, open("/tmp/ft-spec.yaml", "w"))
PY
  doctl apps update "$ID" --spec /tmp/ft-spec.yaml >/dev/null; rm -f /tmp/ft-spec.yaml
  echo "secrets set on the town service"; exit 0
fi

registry
REGURL=$(doctl registry get --format Endpoint --no-header)
TAG="$(git rev-parse --short HEAD 2>/dev/null || echo dev)-$(date +%s)"   # a fresh tag each time, so the platform pulls the new image instead of trusting `latest`
export TAG
echo "building the town"
docker build --platform linux/amd64 -t "$REGURL/small-hours-town:$TAG" -f Dockerfile .
docker push "$REGURL/small-hours-town:$TAG"

ID=$(app_id)
if [[ -z "$ID" ]]; then
  echo "creating the app with the town only; the web joins once its image is built against the app's URL"
  python3 -c "import os, yaml; s=yaml.safe_load(open('.do/app.yaml')); s['services']=[x for x in s['services'] if x['name']=='town']; s['services'][0]['image']['tag']=os.environ['TAG']; yaml.safe_dump(s, open('/tmp/ft-town-only.yaml','w'))"
  doctl apps create --spec /tmp/ft-town-only.yaml --wait >/dev/null; rm -f /tmp/ft-town-only.yaml
  ID=$(app_id)
fi
URL=$(app_url)
echo "app is at $URL"

echo "building the web against $URL/engine"
set -a; [[ -f .env ]] && source .env; set +a
# the web build bakes in the public Supabase keys; without them the gate offers a name box the server will refuse
NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL:-${SUPABASE_URL:-}}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY:-${SUPABASE_ANON_KEY:-}}
if [[ -n "${SUPABASE_URL:-}" && -z "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ]]; then echo "SUPABASE_URL is set but no anon key: put SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) in .env, or nobody can sign in on the deployed site"; exit 1; fi
export NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY
docker build --platform linux/amd64 -t "$REGURL/small-hours-web:$TAG" -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL="$URL/engine" \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-}" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" .
docker push "$REGURL/small-hours-web:$TAG"

echo "deploying both services, keeping the town's secrets"
doctl apps spec get "$ID" > /tmp/ft-live.yaml
python3 - <<'PY2'
import os, yaml
live = yaml.safe_load(open("/tmp/ft-live.yaml")); want = yaml.safe_load(open(".do/app.yaml"))
for s in want["services"]: s["image"]["tag"] = os.environ["TAG"]
by = {s["name"]: s for s in live.get("services", [])}
merged = []
for svc in want["services"]:
    if svc["name"] in by:
        # the live envs carry the secrets; the file's plain envs are added or updated, so a new setting reaches the app
        keep = by[svc["name"]]; live_envs = {e["key"]: e for e in keep.get("envs", [])}
        for e in svc.get("envs", []): live_envs[e["key"]] = {**live_envs.get(e["key"], {}), **e}
        svc = {**svc, "envs": [e for e in live_envs.values() if not e["key"].startswith("FT_")]}  # the old prefix goes
    merged.append(svc)
live["services"] = merged; live.pop("ingress", None)
if want.get("domains"): live["domains"] = want["domains"]  # the island's own address travels with the file  # the file's per-service routes win over the ingress DigitalOcean derived from them
yaml.safe_dump(live, open("/tmp/ft-live.yaml", "w"))
PY2
doctl apps update "$ID" --spec /tmp/ft-live.yaml --wait >/dev/null; rm -f /tmp/ft-live.yaml
echo "live: $URL   town: $URL/engine/api/health   ops: $URL/ops"
