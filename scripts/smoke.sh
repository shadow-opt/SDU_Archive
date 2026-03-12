#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_BASE_URL:-http://localhost:${API_HOST_PORT:-18000}}"
FRONTEND_URL="${FRONTEND_BASE_URL:-http://localhost:${FRONTEND_HOST_PORT:-18080}}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin12345678}"

echo "[1/12] health check: ${API_URL}/api/health"
curl -fsS "${API_URL}/api/health" >/dev/null

echo "[2/12] frontend check: ${FRONTEND_URL}"
curl -fsSI "${FRONTEND_URL}" | head -n 1 >/dev/null

echo "[3/12] unauth RAG must be 401"
rag_code=$(curl -s -o /tmp/sdu_rag_unauth.out -w "%{http_code}" \
  -X POST "${API_URL}/api/rag/query" \
  -H "Content-Type: application/json" \
  -d '{"query":"校史测试"}')
if [[ "${rag_code}" != "401" ]]; then
  echo "ERROR: expected 401 from unauth RAG, got ${rag_code}" >&2
  cat /tmp/sdu_rag_unauth.out >&2 || true
  exit 1
fi

echo "[4/12] admin login + /me role check"
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

echo "[5/12] upload -> documents/chunks visibility check"
smoke_file="/tmp/sdu_smoke_upload_$$.txt"
printf 'smoke upload at %s\n' "$(date -u +%FT%TZ)" > "${smoke_file}"

upload_json=$(curl -fsS -X POST "${API_URL}/api/documents/upload" \
  -H "Authorization: Bearer ${token}" \
  -F "title=smoke-upload-${RANDOM}" \
  -F "file=@${smoke_file};type=text/plain")

uploaded_doc_id=$(python3 - <<'PY' "$upload_json"
import json,sys
obj=json.loads(sys.argv[1])
print(obj.get('id',''))
PY
)

if [[ -z "${uploaded_doc_id}" ]]; then
  echo "ERROR: upload did not return document id" >&2
  exit 1
fi

docs_json=$(curl -fsS "${API_URL}/api/documents/?limit=50" -H "Authorization: Bearer ${token}")
doc_visible=$(python3 - <<'PY' "$docs_json" "$uploaded_doc_id"
import json,sys
payload=json.loads(sys.argv[1])
target=sys.argv[2]
for item in payload.get('items',[]):
    if str(item.get('id',''))==target:
        print('1')
        break
else:
    print('0')
PY
)
if [[ "${doc_visible}" != "1" ]]; then
  echo "ERROR: uploaded document not visible in /api/documents/ list" >&2
  exit 1
fi

chunks_json=$(curl -fsS "${API_URL}/api/chunks/?document_id=${uploaded_doc_id}&limit=10" -H "Authorization: Bearer ${token}")
chunk_count=$(python3 - <<'PY' "$chunks_json"
import json,sys
payload=json.loads(sys.argv[1])
print(len(payload.get('items',[])))
PY
)
if [[ "${chunk_count}" -lt "1" ]]; then
  echo "ERROR: uploaded document has no visible chunks in /api/chunks/" >&2
  exit 1
fi

curl -fsS -X DELETE "${API_URL}/api/documents/${uploaded_doc_id}" \
  -H "Authorization: Bearer ${token}" >/dev/null

echo "[6/12] admin endpoint check: /api/chunks"
curl -fsS "${API_URL}/api/chunks?limit=1" -H "Authorization: Bearer ${token}" >/dev/null

echo "[7/12] admin chunk search endpoint"
curl -fsS "${API_URL}/api/chunks?limit=1&q=test" -H "Authorization: Bearer ${token}" >/dev/null

echo "[8/12] admin dashboard summary"
curl -fsS "${API_URL}/api/admin/dashboard" -H "Authorization: Bearer ${token}" >/dev/null

echo "[9/12] admin creates test user for user-management checks"
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

echo "[10/12] admin users list endpoint"
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

echo "[11/12] admin user status toggle"
curl -fsS -X PATCH "${API_URL}/api/admin/users/${test_user_id}/status" \
  -H "Authorization: Bearer ${token}" \
  -H "Content-Type: application/json" \
  -d '{"is_active":false}' >/dev/null

echo "[12/12] admin quiz create + delete"
collection_json=$(curl -fsS -X POST "${API_URL}/api/quiz/collections" \
  -H "Authorization: Bearer ${token}" \
  -H "Content-Type: application/json" \
  -d '{"title":"[smoke] 互动答题专题","description":"smoke test collection","sort_order":999,"is_published":true}')

collection_id=$(python3 - <<'PY' "$collection_json"
import json,sys
obj=json.loads(sys.argv[1])
print(obj.get('id',''))
PY
)

if [[ -z "${collection_id}" ]]; then
  echo "ERROR: quiz collection create did not return id" >&2
  exit 1
fi

create_json=$(curl -fsS -X POST "${API_URL}/api/quiz/questions" \
  -H "Authorization: Bearer ${token}" \
  -H "Content-Type: application/json" \
  -d '{"collection_id":"'"${collection_id}"'","prompt":"[smoke] 山东大学校史测试题","options":["A","B"],"correct_index":0,"points":1}')

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

curl -fsS -X DELETE "${API_URL}/api/quiz/collections/${collection_id}" \
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
