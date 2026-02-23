#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_BASE_URL:-http://localhost:${API_HOST_PORT:-18000}}"
FRONTEND_URL="${FRONTEND_BASE_URL:-http://localhost:${FRONTEND_HOST_PORT:-18080}}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin12345678}"

echo "[1/11] health check: ${API_URL}/api/health"
curl -fsS "${API_URL}/api/health" >/dev/null

echo "[2/11] frontend check: ${FRONTEND_URL}"
curl -fsSI "${FRONTEND_URL}" | head -n 1 >/dev/null

echo "[3/11] unauth RAG must be 401"
rag_code=$(curl -s -o /tmp/sdu_rag_unauth.out -w "%{http_code}" \
  -X POST "${API_URL}/api/rag/query" \
  -H "Content-Type: application/json" \
  -d '{"query":"校史测试"}')
if [[ "${rag_code}" != "401" ]]; then
  echo "ERROR: expected 401 from unauth RAG, got ${rag_code}" >&2
  cat /tmp/sdu_rag_unauth.out >&2 || true
  exit 1
fi

echo "[4/11] admin login + /me role check"
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

echo "[5/11] admin endpoint check: /api/chunks"
curl -fsS "${API_URL}/api/chunks?limit=1" -H "Authorization: Bearer ${token}" >/dev/null

echo "[6/11] admin chunk search endpoint"
curl -fsS "${API_URL}/api/chunks?limit=1&q=test" -H "Authorization: Bearer ${token}" >/dev/null

echo "[7/11] admin dashboard summary"
curl -fsS "${API_URL}/api/admin/dashboard" -H "Authorization: Bearer ${token}" >/dev/null

echo "[8/11] admin creates test user for user-management checks"
test_user_email="smoke_user_$(date +%s)@example.com"
test_user_password="Smoke12345"
register_code=$(curl -s -o /tmp/sdu_smoke_register.out -w "%{http_code}" \
  -X POST "${API_URL}/api/admin/users" \
  -H "Authorization: Bearer ${token}" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${test_user_email}\",\"password\":\"${test_user_password}\",\"role\":\"user\"}")
if [[ "${register_code}" != "201" ]]; then
  echo "ERROR: admin create-user failed, code=${register_code}" >&2
  cat /tmp/sdu_smoke_register.out >&2 || true
  exit 1
fi

echo "[9/11] admin users list endpoint"
list_json=$(curl -fsS "${API_URL}/api/admin/users?limit=100" -H "Authorization: Bearer ${token}")
test_user_id=$(python3 - <<'PY' "$list_json" "$test_user_email"
import json,sys
payload=json.loads(sys.argv[1])
target=sys.argv[2]
for item in payload.get('items',[]):
    if item.get('email')==target:
        print(item.get('id',''))
        break
else:
    print('')
PY
)
if [[ -z "${test_user_id}" ]]; then
  echo "ERROR: user-management list did not return created user" >&2
  exit 1
fi

echo "[10/11] admin user status toggle"
curl -fsS -X PATCH "${API_URL}/api/admin/users/${test_user_id}/status" \
  -H "Authorization: Bearer ${token}" \
  -H "Content-Type: application/json" \
  -d '{"is_active":false}' >/dev/null

echo "[11/11] admin quiz create + delete"
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

curl -N -X POST "${API_URL}/api/rag/stream" \
  -H "Authorization: Bearer ${token}" \
  -H "Content-Type: application/json" \
  -d '{"query":"山东大学建校时间？"}' > /tmp/sdu_rag_stream.out

if grep -qi '"error"' /tmp/sdu_rag_stream.out; then
  echo "ERROR: rag stream returned error payload" >&2
  cat /tmp/sdu_rag_stream.out >&2 || true
  exit 1
fi


curl -fsS -X DELETE "${API_URL}/api/quiz/questions/${question_id}" \
  -H "Authorization: Bearer ${token}" >/dev/null

rag_auth_code=$(curl -s -o /tmp/sdu_rag_query.out -w "%{http_code}" -X POST "${API_URL}/api/rag/query" \
  -H "Authorization: Bearer ${token}" \
  -H "Content-Type: application/json" \
  -d '{"query":"山东大学建校时间？"}')

if [[ "${rag_auth_code}" != "200" ]]; then
  echo "ERROR: expected 200 from auth RAG query, got ${rag_auth_code}" >&2
  cat /tmp/sdu_rag_query.out >&2 || true
  exit 1
fi

echo "✅ smoke passed"
