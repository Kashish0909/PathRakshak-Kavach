const express = require('express');
const router = express.Router();
const {
  registerOfficer,
  updateLocation,
  updateStatus,
  getCurrentAssignments,
  acceptAssignment,
  declineAssignment,
  completeAssignment
} = require('../controllers/mobileController');

router.post('/officers/register', registerOfficer);
router.post('/officers/location', updateLocation);
router.put('/officers/status', updateStatus);
router.get('/assignments/current/:id', getCurrentAssignments);
router.post('/assignments/accept', acceptAssignment);
router.post('/assignments/decline', declineAssignment);
router.post('/assignments/complete', completeAssignment);

module.exports = router;
