import { Router } from 'express';
import { query } from '../db.js';
import { loadProject, canViewProject, canManageProject } from '../lib/access.js';
import { logAudit } from '../lib/audit.js';

const router = Router();
const TYPES = ['swot', 'root_cause', 'gap'];

router.get('/projects/:projectId/analyses', async (req, res) => {
  const project = await loadProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!canViewProject(req.user, project)) return res.status(403).json({ error: 'No access' });
  const { rows } = await query(
    `SELECT analysis_type, content, updated_at FROM project_analyses WHERE project_id = $1`,
    [req.params.projectId]
  );
  const byType = Object.fromEntries(rows.map((r) => [r.analysis_type, r]));
  res.json({ analyses: byType });
});

// PUT /api/projects/:projectId/analyses/:type — upsert the structured content
router.put('/projects/:projectId/analyses/:type', async (req, res) => {
  if (!TYPES.includes(req.params.type)) return res.status(400).json({ error: 'Unknown analysis type' });
  const project = await loadProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!canManageProject(req.user, project)) return res.status(403).json({ error: 'Only project managers can edit analyses' });

  const content = req.body?.content;
  if (content == null || typeof content !== 'object') return res.status(400).json({ error: 'content object is required' });

  const { rows } = await query(
    `INSERT INTO project_analyses (project_id, analysis_type, content, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (project_id, analysis_type)
     DO UPDATE SET content = EXCLUDED.content, updated_by = EXCLUDED.updated_by, updated_at = now()
     RETURNING analysis_type, content, updated_at`,
    [req.params.projectId, req.params.type, JSON.stringify(content), req.user.id]
  );
  await logAudit(req, 'update', 'analysis', project.id, { after: { type: req.params.type } });
  res.json({ analysis: rows[0] });
});

export default router;
