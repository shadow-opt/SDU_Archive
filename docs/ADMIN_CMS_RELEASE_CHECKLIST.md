# Admin CMS 发布检查清单（MVP）

## 一、建议提交拆分（按模块）

1. **backend: models/schemas + compat migration + dashboard api**
   - backend/app/models.py
   - backend/app/schemas.py
   - backend/app/main.py
   - backend/app/dashboard.py

2. **backend: documents/chunks/quiz enhanced endpoints**
   - backend/app/documents.py
   - backend/app/chunks.py
   - backend/app/quiz.py

3. **frontend: routing/layout/shared services**
   - frontend/src/main.tsx
   - frontend/src/components/AdminLayout.tsx
   - frontend/src/services/api.ts
   - frontend/src/components/InlineNotice.tsx

4. **frontend: admin pages upload/chunks/quiz/dashboard**
   - frontend/src/pages/Upload.tsx
   - frontend/src/pages/RagChunks.tsx
   - frontend/src/pages/QuizManager.tsx
   - frontend/src/pages/AdminDashboard.tsx
   - frontend/src/components/ui/card.tsx

5. **infra/test: docker + smoke + deps**
   - .dockerignore
   - scripts/smoke.sh
   - frontend/package.json
   - frontend/package-lock.json

---

## 二、上线前必查

- [ ] `docker compose up -d --build` 成功
- [ ] `bash scripts/smoke.sh` 全部通过（8/8）
- [ ] 管理员登录后默认进入 `/admin/dashboard`
- [ ] `/admin/upload` 可提交 `year_or_period` 与 `doc_type`
- [ ] `/admin/chunks` 支持搜索、编辑、删除
- [ ] `/admin/quiz-manager` 支持新增、编辑、删除、CSV 导入
- [ ] `/api/admin/dashboard` 返回 200 且结构包含：`kpi`、`wrong_questions`、`top_users`

---

## 三、数据校验点

- [ ] 数据库存在 `answer_records` 表
- [ ] `user_scores` 包含 `total_answers` 列
- [ ] `documents` 包含 `year_or_period`、`doc_type`
- [ ] `quiz_questions` 包含 `question_type`、`explanation`

---

## 四、回滚点

1. **前端回滚**：回退 frontend 相关提交（路由/页面/依赖）
2. **后端 API 回滚**：回退 `dashboard.py` 与 quiz/chunks/documents 扩展逻辑
3. **数据库回滚策略**：
   - 先停写请求
   - 允许保留新增列/表（兼容老版本通常不受影响）
   - 如需硬回滚，再执行手工 DDL（谨慎）

---

## 五、上线后观察（首日）

- [ ] API 429/401/403 是否异常升高
- [ ] quiz 提交是否出现重复答题冲突激增
- [ ] dashboard 查询耗时是否超过 500ms（P95）
- [ ] 上传任务失败率是否异常
