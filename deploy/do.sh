#!/usr/bin/env bash
# Ferry Town on DigitalOcean. Run from the repo root after `doctl auth init` once.
#   deploy/do.sh            build both images, push, create or update the app
#   deploy/do.sh secrets    push the secrets from .env into the app (run once, and after rotating a key)
set -euo pipefail
cd "$(dirname "$0")/.."
REG=${DO_REGISTRY:-ferry-town}
APP=ferry-town
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
secrets = ["OPENROUTER_API_KEY", "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "FT_OPS_TOKEN", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_RESIDENT", "STRIPE_PRICE_PATRON", "FT_OR_MODEL_ROUTINE", "FT_OR_MODEL_STAKES", "FT_OR_MODEL_REFLECT"]
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
echo "building the town"
docker build --platform linux/amd64 -t "$REGURL/ferry-town-town:latest" -f Dockerfile .
docker push "$REGURL/ferry-town-town:latest"

ID=$(app_id)
if [[ -z "$ID" ]]; then
  echo "creating the app with the town only; the web joins once its image is built against the app's URL"
  python3 -c "import yaml; s=yaml.safe_load(open('.do/app.yaml')); s['services']=[x for x in s['services'] if x['name']=='town']; yaml.safe_dump(s, open('/tmp/ft-town-only.yaml','w'))"
  doctl apps create --spec /tmp/ft-town-only.yaml --wait >/dev/null; rm -f /tmp/ft-town-only.yaml
  ID=$(app_id)
fi
URL=$(app_url)
echo "app is at $URL"

echo "building the web against $URL/engine"
set -a; [[ -f .env ]] && source .env; set +a
docker build --platform linux/amd64 -t "$REGURL/ferry-town-web:latest" -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL="$URL/engine" \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-}" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" .
docker push "$REGURL/ferry-town-web:latest"

echo "deploying both services, keeping the town's secrets"
doctl apps spec get "$ID" > /tmp/ft-live.yaml
python3 - <<'PY2'
import yaml
live = yaml.safe_load(open("/tmp/ft-live.yaml")); want = yaml.safe_load(open(".do/app.yaml"))
by = {s["name"]: s for s in live.get("services", [])}
merged = []
for svc in want["services"]:
    if svc["name"] in by:
        keep = by[svc["name"]]; svc = {**svc, "envs": keep.get("envs", svc.get("envs", []))}  # the live envs carry the secrets
    merged.append(svc)
live["services"] = merged; live.pop("ingress", None)  # the file's per-service routes win over the ingress DigitalOcean derived from them
yaml.safe_dump(live, open("/tmp/ft-live.yaml", "w"))
PY2
doctl apps update "$ID" --spec /tmp/ft-live.yaml --wait >/dev/null; rm -f /tmp/ft-live.yaml
echo "live: $URL   town: $URL/engine/api/health   ops: $URL/ops"
