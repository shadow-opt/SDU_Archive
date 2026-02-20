#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_BASE_URL:-http://localhost:${API_HOST_PORT:-18000}}"
FRONTEND_URL="${FRONTEND_BASE_URL:-http://localhost:${FRONTEND_HOST_PORT:-8080}}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"

echo "[1/8] health check: ${API_URL}/api/health"
curl -fsS "${API_URL}/api/health" >/dev/null

echo "[2/8] frontend check: ${FRONTEND_URL}"
curl -fsSI "${FRONTEND_URL}" | head -n 1 >/dev/null

echo "[3/8] unauth RAG must be 401"
rag_code=$(curl -s -o /tmp/sdu_rag_unauth.out -w "%{http_code}" \
  -X POST "${API_URL}/api/rag/query" \
  -H "Content-Type: application/json" \
  -d '{"query":"校史测试"}')
if [[ "${rag_code}" != "401" ]]; then
  echo "ERROR: expected 401 from unauth RAG, got ${rag_code}" >&2
  cat /tmp/sdu_rag_unauth.out >&2 || true
  exit 1
fi

echo "[4/8] admin login + /me role check"
login_json=$(curl -fsS -X POST "${API_URL}/api/auth/login" \
  -F "username=${ADMIN_EMAIL}" \
  -F "password=${ADMIN_PASSWORD}")

token=$(python3 - <<'PY' "$login_json"
import json,sys
obj=json.loads(sys.argv[1])
print(obj.get('access_token',''))
PY
)

if [[ -z "${token}" ]]; then
  echo "ERROR: login did not return access_token" >&2
  exit 1
fi

me_json=$(curl -fsS "${API_URL}/api/auth/me" -H "Authorization: Bearer ${token}")
role=$(python3 - <<'PY' "$me_json"
import json,sys
obj=json.loads(sys.argv[1])
print(obj.get('role',''))
PY
)
if [[ "${role}" != "admin" ]]; then
  echo "ERROR: expected admin role, got '${role}'" >&2
  exit 1
fi

echo "[5/8] admin endpoint check: /api/chunks"
curl -fsS "${API_URL}/api/chunks?limit=1" -H "Authorization: Bearer ${token}" >/dev/null

echo "[6/8] admin chunk search endpoint"
curl -fsS "${API_URL}/api/chunks?limit=1&q=test" -H "Authorization: Bearer ${token}" >/dev/null

echo "[7/8] admin dashboard summary"
curl -fsS "${API_URL}/api/admin/dashboard" -H "Authorization: Bearer ${token}" >/dev/null

echo "[8/8] admin quiz create + delete"
create_json=$(curl -fsS -X POST "${API_URL}/api/quiz/questions" \
  -H "Authorization: Bearer ${token}" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"[smoke] 山东大学校史测试题","options":["A","B"],"correct_index":0,"points":1}')

question_id=$(python3 - <<'PY' "$create_json"
import json,sys
obj=json.loads(sys.argv[1])
print(obj.get('id',''))
PY
)

if [[ -z "${question_id}" ]]; then
  echo "ERROR: quiz create did not return id" >&2
  exit 1
fi

curl -fsS -X DELETE "${API_URL}/api/quiz/questions/${question_id}" \
  -H "Authorization: Bearer ${token}" >/dev/null

echo "✅ smoke passed"
