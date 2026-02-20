# SDU Archive Project Review Report

**Review Date**: 2026-02-20
**Project**: Shandong University Historical Archive (RAG + Quiz System)
**Perspectives**: Product Manager + Full-Stack Engineer

---

## Executive Summary

This is a historical archive and educational platform combining RAG (Retrieval-Augmented Generation) for document search with an interactive quiz system. The project demonstrates good technical foundations but has critical security issues, incomplete RAG implementation, and UX gaps that need immediate attention.

**Overall Assessment**:
- ✅ **Strengths**: Clear value proposition, modern tech stack, containerized deployment
- ⚠️ **Concerns**: Security vulnerabilities, incomplete RAG (no LLM), limited scalability
- ❌ **Critical Issues**: CORS misconfiguration, hardcoded credentials, production password exposure

---

## I. Product Manager Perspective

### 1.1 Product Positioning

**Strengths**:
- Dual-engine design (knowledge retrieval + interactive learning)
- "No records found" mechanism reduces AI hallucination
- Low-barrier deployment (Docker Compose one-click start)

**Issues**:
- **Unclear focus**: Serves both "archive query" and "learning gamification" but user journeys are disconnected
- **No user segmentation**: Archive researchers vs. quiz learners have different needs
- **Recommendation**: Define primary scenario or create user personas

### 1.2 User Experience Issues

#### Critical UX Problems

**Authentication Flow**:
- ❌ No password complexity requirements (allows "123")
- ❌ No email verification (can register fake emails)
- ❌ Default admin credentials exposed in README (`admin@example.com/admin123`)

**RAG Search Experience**:
- ❌ **No actual AI generation**: Returns concatenated text snippets, not synthesized answers
  - Current: `/api/rag/query` only retrieves chunks and joins them with `\n`
  - Expected: Should call LLM (OpenAI Chat API) to generate natural language response
- ❌ No loading progress indicator
- ❌ Citations not clickable (plain text URLs)
- ⚠️ Forced login without trial access (may deter new users)

**Quiz Experience**:
- ❌ Inefficient question selection (dropdown with all questions)
- ❌ No question details page (explanation field exists in backend but not shown)
- ❌ No answer history (users can't review mistakes)
- ⚠️ Too strict duplicate prevention (can't retake failed questions)

**Admin Features**:
- ✅ Comprehensive user management (status, role, password reset)
- ❌ No bulk operations (can't batch disable users)
- ❌ No audit logs (admin actions untracked)
- ❌ No content moderation workflow (user uploads go live immediately)

### 1.3 Missing Features

**Core Functionality**:
1. No user feedback mechanism (can't rate RAG answers)
2. No search history (users must retype queries)
3. No notification system (password reset happens silently)
4. No document categorization/tagging

**Analytics Gaps**:
- Dashboard shows only aggregated KPIs
- Missing: DAU/MAU trends, search hot keywords, question difficulty analysis

### 1.4 Mobile Experience

- ✅ Tailwind CSS responsive design basics
- ❌ Charts not mobile-optimized (Recharts overlapping labels)
- ❌ Long text hard to read on small screens
- ❌ No PWA support (can't add to homescreen)

---

## II. Full-Stack Engineer Perspective

### 2.1 Architecture

**Strengths**:
- Modern stack: FastAPI + React + PostgreSQL + pgvector + MinIO
- Docker Compose for consistent environments
- Native vector search with pgvector (no separate vector DB)

**Critical Issues**:
- ❌ **Monolithic architecture**: All services tightly coupled in single docker-compose
  - Can't scale API independently during traffic spikes
  - Single point of failure (Postgres down = entire service down)
- ❌ **No caching layer**: Dashboard KPIs query database every time
- ❌ **No async task queue**: File uploads block requests (100MB files)

### 2.2 Backend Code Issues

#### Security Vulnerabilities (HIGH PRIORITY)

```python
# backend/app/main.py:17-23
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # ❌ CRITICAL: Allows ANY domain (CSRF risk)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```
**Fix**: Restrict to specific domains: `["http://localhost:18080", "https://sdu.edu.cn"]`

```python
# docker-compose.yml
MINIO_ROOT_USER=minioadmin  # ❌ Hardcoded credentials in version control
MINIO_ROOT_PASSWORD=minioadmin
```
**Fix**: Use `.env` file with `.gitignore`

#### Functional Issues

```python
# backend/app/rag.py:35
answer_text = "\n".join(snippets)  # ❌ No LLM generation!
return RagResponse(answer=answer_text, citations=citations)
```
**Problem**: Product claims "AI answer" but only returns keyword search results
**Fix**: Integrate OpenAI Chat API to synthesize answer from retrieved chunks

```python
# backend/app/documents.py (inferred)
# File upload → chunk → embed → DB (synchronous)
# ❌ 100MB files will timeout
```
**Fix**: Return task ID immediately, process asynchronously with Celery/RQ

#### Performance Issues

```python
# backend/app/dashboard.py (inferred)
# ❌ KPI queries run live SQL every request
# ⚠️ No caching
```
**Fix**:
- Use materialized views or scheduled tasks
- Add Redis caching (5min TTL)

### 2.3 Frontend Code Issues

**State Management**:
```typescript
// frontend/src/pages/Home.tsx
// ❌ Component manages token, query, answer states internally
// ⚠️ No global state management (Zustand/Jotai)
// localStorage.getItem('token') scattered across files
```

**API Client**:
```typescript
// frontend/src/pages/Quiz.tsx:28
const res = await fetch(`${apiBase}/api/quiz/questions`);
// ❌ No unified error handling
// ❌ No retry logic
// ⚠️ SWR exists but used inconsistently
```

**Performance**:
- ❌ No code splitting (loads all pages upfront)
- ❌ No image lazy loading
- ⚠️ Dashboard charts re-render unnecessarily

**Accessibility**:
- ❌ Forms missing `aria-label`
- ❌ Errors missing `role="alert"`
- ⚠️ Color contrast not verified (WCAG 2.1 AA?)

### 2.4 Database Design

**Strengths**:
- ✅ UUID primary keys (prevents enumeration attacks)
- ✅ Foreign key constraints

**Issues**:
```sql
-- models.py:User
email: Mapped[str] = mapped_column(String(255), unique=True)
-- ❌ No email format validation at DB level
-- ❌ No created_by/updated_by audit fields
```

```sql
-- models.py:AnswerRecord
__table_args__ = (UniqueConstraint("user_id", "question_id"),)
-- ⚠️ Prevents retaking quizzes (bad for learning scenarios)
-- Fix: Allow multiple attempts, store best score
```

**Missing Indexes**:
- `documents.created_at` (for time-based sorting)
- `chunks.content` (for full-text search if needed)

### 2.5 DevOps & Monitoring

**Issues**:
- ❌ No health checks in Docker Compose (containers can be "zombie")
- ❌ No log persistence (stdout only, can't debug historical issues)
- ❌ No monitoring/alerting (Prometheus/Grafana)
- ❌ No automated backups for PostgreSQL
- ❌ No HTTPS configuration (needed for production)

**Security Hardening**:
- ❌ Database port exposed to host (15433) - should be internal only
- ❌ No WAF (vulnerable to SQL injection, XSS)
- ⚠️ Rate limiting is in-memory (lost on restart, fails in multi-instance)

### 2.6 Testing

**Current State**:
- ✅ `backend/tests/` directory exists
- ✅ `scripts/smoke.sh` for basic integration tests
- ❌ No frontend tests (`*.test.tsx` missing)
- ❌ No performance/load tests

**Recommendations**:
1. Unit tests: pytest for business logic (embedding fallback, scoring)
2. Integration tests: Expand smoke.sh to cover full user journeys
3. E2E tests: Playwright for critical flows
4. Load tests: Locust to simulate 1000 concurrent users

---

## III. Priority Fix Recommendations

### P0 - Critical Security (Fix Immediately)

1. **CORS misconfiguration**: Change `allow_origins=["*"]` to whitelist
2. **Exposed admin password**: Remove from README, force change on first login
3. **Hardcoded credentials**: Move MinIO/DB passwords to `.env` + `.gitignore`

### P1 - Core Functionality (Fix Within 1 Week)

1. **RAG incomplete**: Integrate OpenAI Chat API for answer generation
2. **No quiz explanations**: Display `explanation` field after submission
3. **Citations not actionable**: Make `source_url` clickable links
4. **No answer history**: Add "My Answers" page

### P2 - UX Improvements (Fix Within 2 Weeks)

1. **Dashboard mobile**: Make Recharts responsive
2. **Quiz pagination**: Replace dropdown with cards/recommendations
3. **Async uploads**: Add Celery/RQ for file processing
4. **Add caching**: Redis for KPIs and hot queries

### P3 - Long-term Optimization

1. **Microservices**: Decouple API from monolith for horizontal scaling
2. **Monitoring**: Prometheus + Grafana dashboards
3. **CI/CD**: Automated testing in pipeline
4. **PWA**: Service Worker for offline access

---

## IV. Conclusion

### Product Summary
- Clear value proposition but needs UX polish
- RAG experience incomplete (no LLM generation) - this is the biggest product gap
- Quiz features too basic for serious learning (no history, no retakes, no categorization)

### Technical Summary
- Good foundation but lacks scalability (no caching, no queuing, no async)
- **Critical security issues** must be fixed before production deployment
- Code quality medium (good type hints, but missing tests/monitoring)

### Recommended Development Path

1. **MVP Validation** (Current): Fix P0/P1 issues, ensure core flows work
2. **Product Polish** (1-3 months): Complete P2 fixes, add analytics
3. **Scale-up** (3-6 months): Refactor to microservices, add caching/queuing for 100k+ users

---

**Reviewer**: Claude Code (AI Assistant)
**Feedback**: Submit issues via GitHub
