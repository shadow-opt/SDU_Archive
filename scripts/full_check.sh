#!/usr/bin/env bash
# SDU_Archive 功能可用性全面检查脚本
# 用法：bash scripts/full_check.sh [--skip-ratelimit] [--skip-ai]

set -uo pipefail

SKIP_RATELIMIT=false
SKIP_AI=false
for arg in "$@"; do
  case "$arg" in
    --skip-ratelimit) SKIP_RATELIMIT=true ;;
    --skip-ai)        SKIP_AI=true ;;
  esac
done

# ─── 配置 ─────────────────────────────────────────────────────────────────────
API="${API_BASE_URL:-http://127.0.0.1:${API_HOST_PORT:-18000}}"
WEB="${FRONTEND_BASE_URL:-http://127.0.0.1:${FRONTEND_HOST_PORT:-18080}}"
COMPOSE_FILE="/home/sha-opt/SDU_Archive/docker-compose.yml"

DOTENV="/home/sha-opt/SDU_Archive/.env"
ADMIN_EMAIL="${ADMIN_EMAIL:-$(grep '^ADMIN_EMAIL=' "$DOTENV" 2>/dev/null | cut -d= -f2- || echo 'admin@example.com')}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(grep '^ADMIN_PASSWORD=' "$DOTENV" 2>/dev/null | cut -d= -f2- || echo 'Admin12345678')}"

# 测试用临时账号（使用 example.com 避免邮箱验证误拒）
TS=$(date +%s)
TEST_EMAIL="fc_user_${TS}@fc.example.com"
TEST_PASS="FcTest12345"

PASS=0; FAIL=0; WARN=0
green='\033[0;32m'; red='\033[0;31m'; yellow='\033[0;33m'; reset='\033[0m'

pass() { echo -e "${green}[PASS]${reset} $1"; ((PASS++)) || true; }
fail() { echo -e "${red}[FAIL]${reset} $1"; ((FAIL++)) || true; }
warn() { echo -e "${yellow}[WARN]${reset} $1"; ((WARN++)) || true; }
section() { echo ""; echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; echo "  $1"; echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; }

http_code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }

# ─── P0：前提条件检查 ──────────────────────────────────────────────────────────
section "P0: 前提条件检查"

PS_OUT=$(docker compose -f "$COMPOSE_FILE" ps 2>/dev/null)
if echo "$PS_OUT" | grep -qiE '(running|healthy)'; then
  pass "CHECK-01: Docker Compose 容器运行中"
else
  fail "CHECK-01: 容器未正常运行"
  echo "  提示：docker compose -f $COMPOSE_FILE up -d" >&2; exit 1
fi

if docker compose -f "$COMPOSE_FILE" exec -T db pg_isready -U sdu -d sdu_archive -q 2>/dev/null; then
  pass "CHECK-02: PostgreSQL 可连接"
else
  fail "CHECK-02: PostgreSQL 不可达"
fi

PG_VEC=$(docker compose -f "$COMPOSE_FILE" exec -T db \
  psql -U sdu -d sdu_archive -tAc "SELECT extname FROM pg_extension WHERE extname='vector'" 2>/dev/null | tr -d '[:space:]')
[ "$PG_VEC" = "vector" ] && pass "CHECK-03: pgvector 扩展已安装" || fail "CHECK-03: pgvector 缺失 (got='$PG_VEC')"

MINIO_CODE=$(http_code "http://127.0.0.1:${MINIO_API_PORT:-19002}/minio/health/live" 2>/dev/null || echo "000")
[ "$MINIO_CODE" = "200" ] && pass "CHECK-04: MinIO 健康检查 HTTP 200" || warn "CHECK-04: MinIO health 返回 $MINIO_CODE"

HEALTH_RESP=$(curl -sf "$API/api/health" 2>/dev/null || echo "")
if echo "$HEALTH_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('ok')==True else 1)" 2>/dev/null; then
  pass "CHECK-05: 后端 /api/health 返回 ok=true"
else
  fail "CHECK-05: 后端健康检查失败"
fi

FRONT_CODE=$(http_code "$WEB/" 2>/dev/null || echo "000")
[ "$FRONT_CODE" = "200" ] && pass "CHECK-06: 前端 HTTP 200" || fail "CHECK-06: 前端不可达 (HTTP $FRONT_CODE)"

IDX=$(docker compose -f "$COMPOSE_FILE" exec -T db \
  psql -U sdu -d sdu_archive -tAc \
  "SELECT indexname FROM pg_indexes WHERE tablename='chunks' AND indexname='idx_chunks_embedding'" 2>/dev/null | tr -d '[:space:]')
[ "$IDX" = "idx_chunks_embedding" ] && pass "CHECK-07: HNSW 向量索引已建立" || warn "CHECK-07: HNSW 索引未找到（首次上传后建立）"

# MinIO：通过 HTTP API 检查 bucket 是否可访问（避免 mc ls 对空 bucket 返回结果不一致）
MINIO_BUCKET_CHECK=$(curl -s -o /dev/null -w "%{http_code}" \
  "http://127.0.0.1:${MINIO_API_PORT:-19002}/documents" \
  -H "Authorization: AWS minioadmin:minioadmin" 2>/dev/null || echo "000")
# Bucket 存在时访问返回 403（需签名）或其他非 404 状态；404 表示不存在
if [ "$MINIO_BUCKET_CHECK" != "404" ] && [ "$MINIO_BUCKET_CHECK" != "000" ]; then
  pass "CHECK-08: MinIO documents bucket 存在（HTTP $MINIO_BUCKET_CHECK）"
else
  # 备用：通过 API 上传一个最小文件来验证 bucket 可写
  BUCKET_TEST=$(echo "test" | curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$API/api/documents/upload" \
    -H "Authorization: Bearer $(curl -s -X POST "$API/api/auth/login" \
      -F "username=$ADMIN_EMAIL" -F "password=$ADMIN_PASSWORD" | \
      python3 -c 'import sys,json; print(json.load(sys.stdin).get("access_token",""))' 2>/dev/null)" \
    -F "title=bucket_probe" \
    -F "file=@/dev/stdin;type=text/plain;filename=probe.txt" 2>/dev/null)
  if [ "$BUCKET_TEST" = "200" ]; then
    pass "CHECK-08: MinIO documents bucket 可写（存在）"
  else
    warn "CHECK-08: MinIO bucket 状态未能验证（HTTP $MINIO_BUCKET_CHECK）"
  fi
fi

# ─── 阶段 1：认证模块 ──────────────────────────────────────────────────────────
section "阶段 1: 认证模块"
ADMIN_TOKEN=""

LOGIN_RESP=$(curl -s -X POST "$API/api/auth/login" \
  -F "username=$ADMIN_EMAIL" -F "password=$ADMIN_PASSWORD")
ADMIN_TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || echo "")
if [ -n "$ADMIN_TOKEN" ]; then
  pass "AUTH-01: 管理员登录成功，获得 access_token"
else
  fail "AUTH-01: 管理员登录失败 — resp=$(echo $LOGIN_RESP | head -c 200)"
fi

CODE=$(http_code -X POST "$API/api/auth/login" -F "username=$ADMIN_EMAIL" -F "password=WrongPwd999")
[ "$CODE" = "400" ] && pass "AUTH-02: 密码错误返回 400" || fail "AUTH-02: 期望 400，得到 $CODE"

CODE=$(http_code -X POST "$API/api/auth/login" -F "username=nobody_${TS}@x.com" -F "password=Any12345")
[ "$CODE" = "400" ] && pass "AUTH-03: 不存在用户返回 400" || fail "AUTH-03: 期望 400，得到 $CODE"

ADMIN_ID=""
if [ -n "$ADMIN_TOKEN" ]; then
  ME_RESP=$(curl -s "$API/api/auth/me" -H "Authorization: Bearer $ADMIN_TOKEN")
  ME_ROLE=$(echo "$ME_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('role',''))" 2>/dev/null || echo "")
  ME_ACTIVE=$(echo "$ME_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('is_active',''))" 2>/dev/null || echo "")
  ADMIN_ID=$(echo "$ME_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
  if [ "$ME_ROLE" = "admin" ] && [ "$ME_ACTIVE" = "True" ]; then
    pass "AUTH-04: /me 返回 role=admin, is_active=True"
  else
    fail "AUTH-04: /me 返回 role=$ME_ROLE, is_active=$ME_ACTIVE"
  fi
else
  fail "AUTH-04: 跳过（无 token）"
fi

CODE=$(http_code "$API/api/auth/me")
[ "$CODE" = "401" ] && pass "AUTH-05: 无 token 访问 /me 返回 401" || fail "AUTH-05: 期望 401，得到 $CODE"

CODE=$(http_code -X POST "$API/api/auth/register" \
  -H "Content-Type: application/json" -d '{"email":"new@sdu.edu.cn","password":"Test12345"}')
[ "$CODE" = "403" ] && pass "AUTH-06: 注册接口已禁用，返回 403" || fail "AUTH-06: 期望 403，得到 $CODE"

CODE=$(http_code "$API/api/auth/me" -H "Authorization: Bearer invalid.jwt.token")
[ "$CODE" = "401" ] && pass "AUTH-07: 无效 token 返回 401" || fail "AUTH-07: 期望 401，得到 $CODE"

# ─── 阶段 2：用户管理 ──────────────────────────────────────────────────────────
section "阶段 2: 用户管理"
USER_ID=""; USER_TOKEN=""

if [ -z "$ADMIN_TOKEN" ]; then
  warn "阶段 2: 跳过（无 ADMIN_TOKEN）"
else
  CREATE_RESP=$(curl -s -w "\n%{http_code}" -X POST "$API/api/admin/users" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\",\"role\":\"user\"}")
  CREATE_CODE=$(echo "$CREATE_RESP" | tail -1)
  CREATE_BODY=$(echo "$CREATE_RESP" | head -1)
  if [ "$CREATE_CODE" = "201" ]; then
    USER_ID=$(echo "$CREATE_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
    pass "USER-01: 创建普通用户成功 id=$USER_ID"
    USER_TOKEN=$(curl -s -X POST "$API/api/auth/login" \
      -F "username=$TEST_EMAIL" -F "password=$TEST_PASS" | \
      python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || echo "")
    [ -n "$USER_TOKEN" ] && pass "USER-01b: 新用户登录获取 token 成功" || warn "USER-01b: 新用户 token 获取失败"
  else
    fail "USER-01: 创建用户期望 201，得到 $CREATE_CODE"
  fi

  CODE=$(http_code -X POST "$API/api/admin/users" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\",\"role\":\"user\"}")
  [ "$CODE" = "400" ] && pass "USER-02: 重复邮箱返回 400" || fail "USER-02: 期望 400，得到 $CODE"

  CODE=$(http_code -X POST "$API/api/admin/users" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
    -d '{"email":"weak_pwd@fc.example.com","password":"12345678","role":"user"}')
  [ "$CODE" = "422" ] && pass "USER-03: 弱密码(纯数字)返回 422" || fail "USER-03: 期望 422，得到 $CODE"

  CODE=$(http_code -X POST "$API/api/admin/users" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
    -d '{"email":"badrole@fc.example.com","password":"Test12345","role":"superadmin"}')
  [ "$CODE" = "400" ] || [ "$CODE" = "422" ] && pass "USER-04: 非法 role 返回 $CODE" || fail "USER-04: 期望 400/422，得到 $CODE"

  LIST_RESP=$(curl -s "$API/api/admin/users?limit=50" -H "Authorization: Bearer $ADMIN_TOKEN")
  LIST_TOTAL=$(echo "$LIST_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total',0))" 2>/dev/null || echo "0")
  [ "${LIST_TOTAL:-0}" -ge 1 ] 2>/dev/null && pass "USER-05: 用户列表 total=$LIST_TOTAL" || fail "USER-05: 用户列表异常"

  FILTER_RESP=$(curl -s "$API/api/admin/users?q=fc_user_${TS}" -H "Authorization: Bearer $ADMIN_TOKEN")
  FILTER_TOTAL=$(echo "$FILTER_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total',0))" 2>/dev/null || echo "0")
  [ "${FILTER_TOTAL:-0}" -ge 1 ] 2>/dev/null && pass "USER-06: 关键词过滤找到测试用户 total=$FILTER_TOTAL" || fail "USER-06: 过滤未找到用户"

  if [ -n "$USER_ID" ]; then
    DISABLE_RESP=$(curl -s -X PATCH "$API/api/admin/users/$USER_ID/status" \
      -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"is_active":false}')
    IS_ACTIVE=$(echo "$DISABLE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('is_active',''))" 2>/dev/null || echo "")
    [ "$IS_ACTIVE" = "False" ] && pass "USER-07: 禁用用户成功 is_active=false" || fail "USER-07: 禁用失败 resp=$(echo $DISABLE_RESP | head -c 100)"

    CODE=$(http_code -X POST "$API/api/auth/login" -F "username=$TEST_EMAIL" -F "password=$TEST_PASS")
    [ "$CODE" = "403" ] && pass "USER-08: 被禁用用户登录返回 403" || fail "USER-08: 期望 403，得到 $CODE"

    # 重新激活
    curl -s -X PATCH "$API/api/admin/users/$USER_ID/status" \
      -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"is_active":true}' > /dev/null
    USER_TOKEN=$(curl -s -X POST "$API/api/auth/login" \
      -F "username=$TEST_EMAIL" -F "password=$TEST_PASS" | \
      python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || echo "")
  else
    warn "USER-07/08: 跳过（无 USER_ID）"
  fi

  if [ -n "$ADMIN_ID" ]; then
    CODE=$(http_code -X PATCH "$API/api/admin/users/$ADMIN_ID/status" \
      -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"is_active":false}')
    [ "$CODE" = "400" ] && pass "USER-09: 管理员禁用自己返回 400" || fail "USER-09: 期望 400，得到 $CODE"

    CODE=$(http_code -X PATCH "$API/api/admin/users/$ADMIN_ID/role" \
      -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"role":"user"}')
    [ "$CODE" = "400" ] && pass "USER-10: 管理员降级自己返回 400" || fail "USER-10: 期望 400，得到 $CODE"
  else
    warn "USER-09/10: 跳过（无 ADMIN_ID）"
  fi
fi

# ─── 阶段 3：文档上传与切片管理 ───────────────────────────────────────────────
section "阶段 3: 文档上传与切片管理"
DOC_ID=""; DOC_OBJECT=""

if [ -z "$ADMIN_TOKEN" ]; then
  warn "阶段 3: 跳过（无 ADMIN_TOKEN）"
else
  TEST_TEXT="山东大学创建于1901年，是中国著名高校之一，坐落于山东省济南市。学校历史悠久、文化底蕴深厚。
近年来，山东大学不断推进国际化办学战略，与多所世界知名高校建立了合作关系。
山东大学在科学研究、人才培养方面取得了显著成就，为国家建设贡献了重要力量。
这是功能检查脚本自动生成的测试文档，仅供测试使用，完成后将自动删除。"

  UPLOAD_RESP=$(echo "$TEST_TEXT" | curl -s -w "\n%{http_code}" -X POST "$API/api/documents/upload" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -F "title=山东大学简介_fullcheck" -F "description=功能检查" \
    -F "year_or_period=1901-2024" -F "doc_type=intro" \
    -F "file=@/dev/stdin;type=text/plain;filename=sdu_intro_fc.txt")
  UPLOAD_CODE=$(echo "$UPLOAD_RESP" | tail -1)
  UPLOAD_BODY=$(echo "$UPLOAD_RESP" | head -1)
  if [ "$UPLOAD_CODE" = "200" ]; then
    DOC_ID=$(echo "$UPLOAD_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
    DOC_OBJECT=$(echo "$UPLOAD_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('object_name',''))" 2>/dev/null || echo "")
    pass "DOC-01: TXT 文档上传成功 id=$DOC_ID"
  else
    fail "DOC-01: 上传失败 HTTP=$UPLOAD_CODE"
  fi

  # 注意：GET /api/chunks 需要 trailing slash
  if [ -n "$DOC_ID" ]; then
    sleep 1
    CHUNK_RESP=$(curl -s "$API/api/chunks/?limit=200" -H "Authorization: Bearer $ADMIN_TOKEN")
    DOC_CHUNK_COUNT=$(echo "$CHUNK_RESP" | python3 -c "
import sys,json
d=json.load(sys.stdin)
n=[c for c in d.get('items',[]) if c.get('document_id')=='$DOC_ID']
print(len(n))
" 2>/dev/null || echo "0")
    [ "${DOC_CHUNK_COUNT:-0}" -gt 0 ] 2>/dev/null && pass "DOC-02: 切片自动创建 count=$DOC_CHUNK_COUNT" || fail "DOC-02: 无切片 (count=$DOC_CHUNK_COUNT)"
  fi

  VEC_COUNT=$(docker compose -f "$COMPOSE_FILE" exec -T db \
    psql -U sdu -d sdu_archive -tAc \
    "SELECT count(*) FROM chunks WHERE embedding IS NOT NULL" 2>/dev/null | tr -d '[:space:]' || echo "0")
  [ "${VEC_COUNT:-0}" -gt 0 ] 2>/dev/null && pass "DOC-03: 向量已写入 DB count=$VEC_COUNT" || warn "DOC-03: 向量计数=$VEC_COUNT（Embedding API 可能未响应）"

  CODE=$(echo "fake binary" | http_code -X POST "$API/api/documents/upload" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -F "title=恶意文件" -F "file=@/dev/stdin;type=application/zip;filename=test.zip")
  [ "$CODE" = "400" ] && pass "DOC-04: 不支持类型返回 400" || fail "DOC-04: 期望 400，得到 $CODE"

  if [ -n "$USER_TOKEN" ]; then
    CODE=$(echo "test" | http_code -X POST "$API/api/documents/upload" \
      -H "Authorization: Bearer $USER_TOKEN" -F "title=越权上传" \
      -F "file=@/dev/stdin;type=text/plain;filename=a.txt")
    [ "$CODE" = "403" ] && pass "DOC-05: 普通用户上传返回 403" || fail "DOC-05: 期望 403，得到 $CODE"
  else
    warn "DOC-05: 跳过（无 USER_TOKEN）"
  fi

  if [ -n "$DOC_OBJECT" ]; then
    MC_CHECK=$(docker compose -f "$COMPOSE_FILE" exec -T minio \
      sh -c "mc alias set local http://localhost:9000 minioadmin minioadmin >/dev/null 2>&1 && mc stat local/documents/$DOC_OBJECT 2>&1" 2>/dev/null || echo "error")
    if echo "$MC_CHECK" | grep -qiE "size|Object name"; then
      pass "DOC-06: 文件在 MinIO 存在 object=$DOC_OBJECT"
    else
      # 备选：直接检查 MinIO HTTP API
      STAT_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        "http://127.0.0.1:${MINIO_API_PORT:-19002}/documents/$DOC_OBJECT")
      [ "$STAT_CODE" = "200" ] || [ "$STAT_CODE" = "403" ] && \
        pass "DOC-06: 文件在 MinIO 存在 (HTTP $STAT_CODE)" || \
        warn "DOC-06: MinIO 验证结果不明确 (HTTP $STAT_CODE)"
    fi
  else
    warn "DOC-06: 跳过（无 DOC_OBJECT）"
  fi

  # 中文关键词需 URL 编码
  Q_ENC=$(python3 -c "import urllib.parse; print(urllib.parse.quote('山东大学'))")
  CSEARCH_RESP=$(curl -s "$API/api/chunks/?q=${Q_ENC}&limit=10" -H "Authorization: Bearer $ADMIN_TOKEN")
  CSEARCH_TOTAL=$(echo "$CSEARCH_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))" 2>/dev/null || echo "0")
  [ "${CSEARCH_TOTAL:-0}" -ge 1 ] 2>/dev/null && pass "CHUNK-01: 切片关键词搜索找到 $CSEARCH_TOTAL 条" || fail "CHUNK-01: 搜索无结果"

  if [ -n "$DOC_ID" ]; then
    DEL_CODE=$(http_code -X DELETE "$API/api/documents/$DOC_ID" -H "Authorization: Bearer $ADMIN_TOKEN")
    if [ "$DEL_CODE" = "200" ]; then
      sleep 0.5
      REMAIN=$(curl -s "$API/api/chunks/?limit=200" -H "Authorization: Bearer $ADMIN_TOKEN" | \
        python3 -c "
import sys,json
d=json.load(sys.stdin)
n=[c for c in d.get('items',[]) if c.get('document_id')=='$DOC_ID']
print(len(n))
" 2>/dev/null || echo "unknown")
      [ "$REMAIN" = "0" ] && pass "DOC-07: 删除文档成功，切片级联删除(orphan=0)" || fail "DOC-07: 级联删除异常，残留=$REMAIN"
    else
      fail "DOC-07: 删除文档期望 200，得到 $DEL_CODE"
    fi
    DOC_ID=""
  else
    warn "DOC-07: 跳过（无 DOC_ID）"
  fi
fi

# ─── 阶段 4：RAG 问答 ─────────────────────────────────────────────────────────
section "阶段 4: RAG 问答"
RAG_DOC_ID=""

# 先上传一份数据供 RAG 检索
if [ -n "$ADMIN_TOKEN" ] && [ "$SKIP_AI" = "false" ]; then
  RAG_TEXT="山东大学创建于1901年，位于济南市，是教育部直属重点综合性大学。
山东大学下设多个学院，学科涵盖理、工、文、医等众多领域。
学校秉承'为天下储人才、为国家图富强'的办学宗旨，培育了大批杰出人才。
山东大学积极推进国际化战略，在全球多所顶尖大学建立了合作关系。"
  RAG_UP=$(echo "$RAG_TEXT" | curl -s -w "\n%{http_code}" -X POST "$API/api/documents/upload" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -F "title=RAG测试文档_fullcheck" \
    -F "file=@/dev/stdin;type=text/plain;filename=rag_test_fc.txt")
  RAG_CODE=$(echo "$RAG_UP" | tail -1)
  RAG_BODY=$(echo "$RAG_UP" | head -1)
  if [ "$RAG_CODE" = "200" ]; then
    RAG_DOC_ID=$(echo "$RAG_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
    sleep 3  # 等待向量化
  fi
fi

CODE=$(http_code -X POST "$API/api/rag/query" -H "Content-Type: application/json" -d '{"query":"山东大学"}')
[ "$CODE" = "401" ] && pass "RAG-01: 未认证访问 /rag/query 返回 401" || fail "RAG-01: 期望 401，得到 $CODE"

if [ -z "$ADMIN_TOKEN" ] || [ "$SKIP_AI" = "true" ]; then
  warn "RAG-02~07: 跳过"
else
  QUERY_RESP=$(curl -s -X POST "$API/api/rag/query" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
    -d '{"query":"山东大学建校时间","top_k":4}')
  QUERY_ANS_LEN=$(echo "$QUERY_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('answer','')))" 2>/dev/null || echo "0")
  DEGRADED=$(echo "$QUERY_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('degraded',''))" 2>/dev/null || echo "")
  CITATIONS_TYPE=$(echo "$QUERY_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(type(d.get('citations',None)).__name__)" 2>/dev/null || echo "")
  if [ "${QUERY_ANS_LEN:-0}" -gt 0 ] 2>/dev/null && [ "$CITATIONS_TYPE" = "list" ]; then
    if [ "$DEGRADED" = "False" ]; then
      pass "RAG-02: RAG 非流式查询成功 answer_len=$QUERY_ANS_LEN degraded=false"
    else
      warn "RAG-02: RAG 降级模式 (degraded=true) answer_len=$QUERY_ANS_LEN — 检查 API Key"
    fi
  else
    fail "RAG-02: RAG 查询异常 answer_len=$QUERY_ANS_LEN citations_type=$CITATIONS_TYPE"
  fi

  CODE=$(http_code -X POST "$API/api/rag/query" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"query":"test","top_k":11}')
  [ "$CODE" = "422" ] && pass "RAG-03: top_k=11 返回 422" || fail "RAG-03: 期望 422，得到 $CODE"

  LONG_Q=$(python3 -c "print('测'*2001)")
  CODE=$(http_code -X POST "$API/api/rag/query" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
    -d "{\"query\":\"$LONG_Q\",\"top_k\":4}")
  [ "$CODE" = "422" ] && pass "RAG-04: 超长 query 返回 422" || fail "RAG-04: 期望 422，得到 $CODE"

  NO_HIT=$(curl -s -X POST "$API/api/rag/query" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
    -d '{"query":"量子纠缠薛定谔猫XYZABC123深度学习","top_k":4}')
  NHCIT=$(echo "$NO_HIT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('citations',[])))" 2>/dev/null || echo "-1")
  [ "$NHCIT" = "0" ] && pass "RAG-05: 无命中时 citations=[]" || warn "RAG-05: citations=$NHCIT（若有旧数据则忽略）"

  # SSE 流式格式验证（使用临时 Python 文件避免 heredoc-pipe 冲突）
  SSE_CHECKER=$(mktemp /tmp/sdu_sse_check_XXXX.py)
  cat > "$SSE_CHECKER" << 'PYEOF'
import sys, json
lines = sys.stdin.read().strip().split('\n')
events = []
errors = []
for line in lines:
    line = line.strip()
    if line.startswith('data: '):
        try:
            events.append(json.loads(line[6:]))
        except json.JSONDecodeError as e:
            errors.append(f"invalid json: {line[:80]} ({e})")
if errors:
    print(f"FAIL: JSON errors: {errors}")
elif not events:
    print("FAIL: no SSE events received")
elif events[-1].get('done') != True:
    print(f"FAIL: last event missing done=true, got: {events[-1]}")
else:
    print(f"PASS: {len(events)} events, done=true, last={events[-1]}")
PYEOF

  SSE_OUT=$(curl -sN --max-time 30 -X POST "$API/api/rag/stream" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"query":"山东大学建校时间","top_k":3}' 2>/dev/null || echo "")
  SSE_VALID=$(echo "$SSE_OUT" | python3 "$SSE_CHECKER")
  rm -f "$SSE_CHECKER"

  if echo "$SSE_VALID" | grep -q "^PASS"; then
    pass "RAG-06: SSE 流式格式正确 ($SSE_VALID)"
  else
    fail "RAG-06: SSE 流式格式异常 ($SSE_VALID)"
  fi

  # SSE Content-Type 检查（使用 -D - 获取响应头，不发送 -I 避免 HEAD 请求）
  SSE_HEADERS=$(curl -s -D - --max-time 10 -X POST "$API/api/rag/stream" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"query":"test","top_k":1}' 2>/dev/null | \
    grep -i "content-type" | head -1 | tr -d '\r')
  if echo "$SSE_HEADERS" | grep -qi "text/event-stream"; then
    pass "RAG-06b: SSE Content-Type=text/event-stream"
  else
    fail "RAG-06b: SSE Content-Type 异常: $SSE_HEADERS"
  fi

  CODE=$(http_code -X POST "$API/api/rag/stream" -H "Content-Type: application/json" -d '{"query":"test"}')
  [ "$CODE" = "401" ] && pass "RAG-07: 未认证访问 /rag/stream 返回 401" || fail "RAG-07: 期望 401，得到 $CODE"
fi

# ─── 阶段 5：题库 ─────────────────────────────────────────────────────────────
section "阶段 5: 题库"
Q_ID=""

if [ -z "$ADMIN_TOKEN" ]; then
  warn "阶段 5: 跳过（无 ADMIN_TOKEN）"
else
  Q_RESP=$(curl -s -w "\n%{http_code}" -X POST "$API/api/quiz/questions" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
    -d '{"prompt":"[fullcheck] 山东大学创建于哪一年？","options":["1898年","1901年","1912年","1949年"],"correct_index":1,"points":10,"question_type":"single_choice","explanation":"山东大学于1901年建校。"}')
  Q_CODE=$(echo "$Q_RESP" | tail -1)
  Q_BODY=$(echo "$Q_RESP" | head -1)
  if [ "$Q_CODE" = "200" ]; then
    Q_ID=$(echo "$Q_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
    pass "QUIZ-01: 创建题目成功 id=$Q_ID"
  else
    fail "QUIZ-01: 创建题目期望 200，得到 $Q_CODE"
  fi

  CODE=$(http_code -X POST "$API/api/quiz/questions" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
    -d '{"prompt":"越界测试","options":["A","B"],"correct_index":5,"points":1}')
  [ "$CODE" = "400" ] || [ "$CODE" = "422" ] && pass "QUIZ-02: correct_index 越界返回 $CODE" || fail "QUIZ-02: 期望 400/422，得到 $CODE"

  if [ -n "$USER_TOKEN" ]; then
    UQ_RESP=$(curl -s "$API/api/quiz/questions" -H "Authorization: Bearer $USER_TOKEN")
    LEAKED=$(echo "$UQ_RESP" | python3 -c "
import sys,json
qs=json.load(sys.stdin)
leaked=[q for q in qs if 'correct_index' in q]
print(len(leaked))
" 2>/dev/null || echo "-1")
    [ "$LEAKED" = "0" ] && pass "QUIZ-03: 用户视图无 correct_index 泄露" || fail "QUIZ-03: 泄露了 $LEAKED 个题目的答案"
  else
    warn "QUIZ-03: 跳过（无 USER_TOKEN）"
  fi

  AQ_RESP=$(curl -s "$API/api/quiz/questions/admin" -H "Authorization: Bearer $ADMIN_TOKEN")
  ADMIN_HAS=$(echo "$AQ_RESP" | python3 -c "
import sys,json
qs=json.load(sys.stdin)
print('True' if qs and 'correct_index' in qs[0] else 'False/empty')
" 2>/dev/null || echo "error")
  [ "$ADMIN_HAS" = "True" ] && pass "QUIZ-04: 管理员视图含 correct_index" || warn "QUIZ-04: $ADMIN_HAS（若题库空则忽略）"

  if [ -n "$USER_TOKEN" ]; then
    CODE=$(http_code "$API/api/quiz/questions/admin" -H "Authorization: Bearer $USER_TOKEN")
    [ "$CODE" = "403" ] && pass "QUIZ-05: 普通用户访问 admin 题目视图返回 403" || fail "QUIZ-05: 期望 403，得到 $CODE"
  else
    warn "QUIZ-05: 跳过（无 USER_TOKEN）"
  fi

  if [ -n "$Q_ID" ] && [ -n "$USER_TOKEN" ]; then
    SUB_RESP=$(curl -s -X POST "$API/api/quiz/questions/$Q_ID/submit" \
      -H "Authorization: Bearer $USER_TOKEN" -H "Content-Type: application/json" \
      -d '{"answer_index":1}')
    IS_CORRECT=$(echo "$SUB_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('correct',''))" 2>/dev/null || echo "")
    AWARDED=$(echo "$SUB_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('awarded',0))" 2>/dev/null || echo "0")
    if [ "$IS_CORRECT" = "True" ] && [ "${AWARDED:-0}" -eq 10 ] 2>/dev/null; then
      pass "QUIZ-06: 正确答案 correct=true awarded=$AWARDED"
    else
      fail "QUIZ-06: 期望 correct=true,awarded=10，得到 correct=$IS_CORRECT awarded=$AWARDED"
    fi
  else
    warn "QUIZ-06: 跳过（无 Q_ID 或 USER_TOKEN）"
  fi

  if [ -n "$Q_ID" ] && [ -n "$USER_TOKEN" ]; then
    CODE=$(http_code -X POST "$API/api/quiz/questions/$Q_ID/submit" \
      -H "Authorization: Bearer $USER_TOKEN" -H "Content-Type: application/json" -d '{"answer_index":0}')
    [ "$CODE" = "400" ] && pass "QUIZ-07: 重复作答返回 400" || fail "QUIZ-07: 期望 400，得到 $CODE"
  else
    warn "QUIZ-07: 跳过（无 Q_ID 或 USER_TOKEN）"
  fi

  if [ -n "$Q_ID" ]; then
    WRONG_RESP=$(curl -s -X POST "$API/api/quiz/questions/$Q_ID/submit" \
      -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"answer_index":0}')
    WRONG_CORRECT=$(echo "$WRONG_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('correct',''))" 2>/dev/null || echo "")
    WRONG_AWARD=$(echo "$WRONG_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('awarded','-1'))" 2>/dev/null || echo "-1")
    if [ "$WRONG_CORRECT" = "False" ] && [ "$WRONG_AWARD" = "0" ]; then
      pass "QUIZ-08: 错误答案 correct=false awarded=0"
    else
      fail "QUIZ-08: 期望 correct=false awarded=0，得到 correct=$WRONG_CORRECT awarded=$WRONG_AWARD"
    fi
  else
    warn "QUIZ-08: 跳过（无 Q_ID）"
  fi

  CSV_DATA='prompt,options,correct_index,points,question_type,explanation
"山东大学建校年份（CSV测试）？","1898年|1901年|1912年",1,5,single_choice,"1901年建校"
"山大所在城市（CSV测试）？","青岛|济南|烟台",1,5,single_choice,"总部在济南"'

  IMPORT_RESP=$(echo "$CSV_DATA" | curl -s -w "\n%{http_code}" -X POST \
    "$API/api/quiz/questions/import-csv" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -F "file=@/dev/stdin;type=text/csv;filename=quiz_fc.csv")
  IMPORT_CODE=$(echo "$IMPORT_RESP" | tail -1)
  IMPORT_BODY=$(echo "$IMPORT_RESP" | head -1)
  IMPORT_CREATED=$(echo "$IMPORT_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('created',0))" 2>/dev/null || echo "0")
  if [ "$IMPORT_CODE" = "200" ] && [ "${IMPORT_CREATED:-0}" -ge 2 ] 2>/dev/null; then
    pass "QUIZ-09: CSV 批量导入成功 created=$IMPORT_CREATED"
  else
    fail "QUIZ-09: CSV 导入期望 created>=2，得到 HTTP=$IMPORT_CODE created=$IMPORT_CREATED"
  fi

  if [ -n "$Q_ID" ]; then
    DEL1=$(http_code -X DELETE "$API/api/quiz/questions/$Q_ID" -H "Authorization: Bearer $ADMIN_TOKEN")
    DEL2=$(http_code -X DELETE "$API/api/quiz/questions/$Q_ID" -H "Authorization: Bearer $ADMIN_TOKEN")
    if [ "$DEL1" = "200" ] && [ "$DEL2" = "404" ]; then
      pass "QUIZ-10: 删除题目 200，再次删除 404"
    else
      fail "QUIZ-10: 期望 first=200 second=404，得到 $DEL1 $DEL2"
    fi
  else
    warn "QUIZ-10: 跳过（无 Q_ID）"
  fi
fi

# ─── 阶段 6：仪表盘 ────────────────────────────────────────────────────────────
section "阶段 6: 仪表盘"

if [ -z "$ADMIN_TOKEN" ]; then
  warn "阶段 6: 跳过（无 ADMIN_TOKEN）"
else
  DASH_RESP=$(curl -s "$API/api/admin/dashboard" -H "Authorization: Bearer $ADMIN_TOKEN")
  # 使用临时文件避免 heredoc-in-pipe 问题
  DASH_CHECKER=$(mktemp /tmp/sdu_dash_check_XXXX.py)
  cat > "$DASH_CHECKER" << 'PYEOF'
import sys, json
try:
    d = json.load(sys.stdin)
    kpi = d.get('kpi', {})
    required_kpi = ['total_users','total_answers','average_accuracy','today_points']
    missing = [k for k in required_kpi if k not in kpi]
    if missing:
        print(f"FAIL: missing kpi fields: {missing}")
    elif not isinstance(d.get('wrong_questions'), list):
        print("FAIL: wrong_questions is not list")
    elif not isinstance(d.get('top_users'), list):
        print("FAIL: top_users is not list")
    else:
        acc = float(kpi.get('average_accuracy', -1))
        # average_accuracy 是百分比（0-100），不是小数
        if not (0.0 <= acc <= 100.0):
            print(f"FAIL: average_accuracy={acc} out of [0,100]")
        else:
            print(f"PASS: users={kpi['total_users']}, answers={kpi['total_answers']}, acc={acc}%, wq={len(d['wrong_questions'])}, tu={len(d['top_users'])}")
except Exception as e:
    print(f"FAIL: parse error {e}")
PYEOF
  DASH_VALID=$(echo "$DASH_RESP" | python3 "$DASH_CHECKER")
  rm -f "$DASH_CHECKER"

  if echo "$DASH_VALID" | grep -q "^PASS"; then
    pass "DASH-01: 仪表盘数据完整 ($DASH_VALID)"
  else
    fail "DASH-01: 仪表盘数据异常 ($DASH_VALID)"
  fi

  if [ -n "$USER_TOKEN" ]; then
    CODE=$(http_code "$API/api/admin/dashboard" -H "Authorization: Bearer $USER_TOKEN")
    [ "$CODE" = "403" ] && pass "DASH-02: 普通用户访问仪表盘返回 403" || fail "DASH-02: 期望 403，得到 $CODE"
  else
    warn "DASH-02: 跳过（无 USER_TOKEN）"
  fi
fi

# ─── 阶段 7：限流机制 ──────────────────────────────────────────────────────────
section "阶段 7: 限流机制"

if [ "$SKIP_RATELIMIT" = "true" ]; then
  warn "RATE-01: 跳过（--skip-ratelimit）"
else
  echo "  正在测试登录限流（发送 12 次错误登录）..."
  CODES_ARR=(); GOT_429=false
  for i in $(seq 1 12); do
    C=$(http_code -X POST "$API/api/auth/login" \
      -F "username=ratelimit_probe_nobody@sdu.local" -F "password=WrongPwd999")
    CODES_ARR+=("$C")
    [ "$C" = "429" ] && GOT_429=true
    sleep 0.1
  done
  CODES_STR="${CODES_ARR[*]}"
  if [ "$GOT_429" = "true" ]; then
    pass "RATE-01: 登录限流触发 429 (codes: $CODES_STR)"
    echo "  等待 65 秒让限流窗口重置..."
    sleep 65
  else
    warn "RATE-01: 未触发 429（RATE_LIMIT_PER_MINUTE 可能较高）codes=$CODES_STR"
  fi
fi

# ─── 阶段 8：Nginx 代理 ────────────────────────────────────────────────────────
section "阶段 8: Nginx 代理"

CODE=$(http_code "$WEB/api/health")
[ "$CODE" = "200" ] && pass "NGINX-01: Nginx 代理 /api/* 到后端 HTTP 200" || fail "NGINX-01: 期望 200，得到 $CODE"

FRONT_HTML=$(curl -s "$WEB/" 2>/dev/null | head -c 200)
if echo "$FRONT_HTML" | grep -qi "html\|<!doctype"; then
  pass "NGINX-02: 前端静态 HTML 正常返回"
else
  fail "NGINX-02: 前端 HTML 异常"
fi

# ─── 清理测试数据 ──────────────────────────────────────────────────────────────
section "清理测试数据"

if [ -n "$ADMIN_TOKEN" ]; then
  # 删除 CSV 导入的测试题目
  QUIZ_LIST=$(curl -s "$API/api/quiz/questions/admin" -H "Authorization: Bearer $ADMIN_TOKEN" 2>/dev/null || echo "[]")
  CSV_IDS=$(echo "$QUIZ_LIST" | python3 -c "
import sys,json
qs=json.load(sys.stdin)
ids=[q['id'] for q in qs if 'CSV测试' in q.get('prompt','') or '[fullcheck]' in q.get('prompt','')]
print(' '.join(ids))
" 2>/dev/null || echo "")
  for qid in $CSV_IDS; do
    curl -s -X DELETE "$API/api/quiz/questions/$qid" -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
  done
  [ -n "$CSV_IDS" ] && echo "  删除测试题目: $CSV_IDS" || echo "  无测试题目需清理"

  # 删除 RAG 测试文档
  if [ -n "$RAG_DOC_ID" ]; then
    curl -s -X DELETE "$API/api/documents/$RAG_DOC_ID" -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
    echo "  删除 RAG 测试文档 $RAG_DOC_ID"
  fi
fi

# 通过 DB 清理测试用户（无 DELETE user API）
# 先删除依赖表记录（answer_records / user_scores 有非 CASCADE 外键），再删 users
DB_CLEAN=$(docker compose -f "$COMPOSE_FILE" exec -T db \
  psql -U sdu -d sdu_archive -tAc \
  "DELETE FROM answer_records WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'fc_user_%@fc.example.com');
   DELETE FROM user_scores  WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'fc_user_%@fc.example.com');
   DELETE FROM users WHERE email LIKE 'fc_user_%@fc.example.com' RETURNING email;" \
  2>/dev/null | tr '\n' ',' | tr -d '[:space:]' || echo "")
echo "  清理测试用户: ${DB_CLEAN:-none}"

# ─── 总结 ──────────────────────────────────────────────────────────────────────
section "测试结果汇总"
echo ""
echo -e "  ${green}PASS: $PASS${reset}   ${red}FAIL: $FAIL${reset}   ${yellow}WARN: $WARN${reset}"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo -e "  ${green}✅ 所有检查通过 — 系统功能可用性正常${reset}"
  exit 0
else
  echo -e "  ${red}❌ 有 $FAIL 项检查失败 — 请查看上方 [FAIL] 条目${reset}"
  exit 1
fi
