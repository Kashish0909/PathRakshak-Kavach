const express = require('express');
const router = express.Router();
const {
  getDashboardSummary,
  getHotspots,
  getOfficers,
  getLeaderboard,
  assignDeployment,
  triggerDatabaseSeed,
  getActiveAssignments
} = require('../controllers/adminController');
const { getDeploymentRecommendations } = require('../controllers/aiController');

router.get('/dashboard/summary', getDashboardSummary);
router.get('/hotspots', getHotspots);
router.get('/officers', getOfficers);
router.get('/performance/officers', getLeaderboard);
router.get('/deployment/recommendations', getDeploymentRecommendations);
router.post('/deployment/assign', assignDeployment);
router.post('/admin/seed', triggerDatabaseSeed);
router.get('/assignments/active', getActiveAssignments);

module.exports = router;
