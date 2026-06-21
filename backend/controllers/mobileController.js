const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { autoAssignOfficerToNextIssue } = require('../utils/dispatchHelper');

const registerOfficer = async (req, res) => {
  try {
    const { name, email, role, rank } = req.body;
    const { firebase_uid } = req.user; // Provided by Firebase Auth Middleware

    // Check if officer already exists
    let officer = await prisma.officer.findUnique({
      where: { firebase_uid }
    });

    if (!officer) {
      // Create new officer if they don't exist
      officer = await prisma.officer.create({
        data: {
          firebase_uid,
          name: name || 'Unknown Officer',
          email: email || req.user.email || 'unknown@domain.com',
          role: role || 'Patrol',
          rank: rank || 'Officer',
          status: 'Available'
        }
      });
    }

    res.status(201).json({ message: 'Officer registered successfully', officer });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to register officer' });
  }
};

const updateLocation = async (req, res) => {
  try {
    const { lat, lng } = req.body;
    const { firebase_uid } = req.user;

    let officer = await prisma.officer.update({
      where: { firebase_uid },
      data: { lat, lng }
    });

    let nextAssignment = null;
    if (officer.status === 'Available') {
      nextAssignment = await autoAssignOfficerToNextIssue(officer.id);
      if (nextAssignment) {
        officer = await prisma.officer.findUnique({
          where: { id: officer.id }
        });
      }
    }

    res.json({ 
      message: 'Location updated successfully', 
      officer, 
      nextAssignment: nextAssignment || null 
    });
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({ error: 'Failed to update location' });
  }
};

const updateStatus = async (req, res) => {
  try {
    const { status } = req.body; // e.g., 'Available', 'Busy'
    const { firebase_uid } = req.user;

    let officer = await prisma.officer.update({
      where: { firebase_uid },
      data: { status }
    });

    let nextAssignment = null;
    if (status === 'Available') {
      nextAssignment = await autoAssignOfficerToNextIssue(officer.id);
      if (nextAssignment) {
        officer = await prisma.officer.findUnique({
          where: { id: officer.id }
        });
      }
    }

    res.json({ 
      message: 'Status updated successfully', 
      officer, 
      nextAssignment: nextAssignment || null 
    });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
};

const getCurrentAssignments = async (req, res) => {
  try {
    const { id } = req.params;
    
    const officer = await prisma.officer.findUnique({
      where: { id: parseInt(id) }
    });

    if (!officer || officer.firebase_uid !== req.user.firebase_uid) {
      return res.status(403).json({ error: 'Forbidden: Access denied' });
    }

    const assignments = await prisma.assignment.findMany({
      where: {
        officer_id: parseInt(id),
        status: {
          in: ['pending', 'accepted']
        }
      },
      include: {
        hotspot: true
      }
    });

    res.json(assignments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch assignments' });
  }
};

const acceptAssignment = async (req, res) => {
  try {
    const { assignment_id } = req.body;

    const assignment = await prisma.assignment.findUnique({
      where: { id: parseInt(assignment_id) },
      include: { officer: true }
    });

    if (!assignment || assignment.officer.firebase_uid !== req.user.firebase_uid) {
      return res.status(403).json({ error: 'Forbidden: Access denied' });
    }

    const updatedAssignment = await prisma.assignment.update({
      where: { id: parseInt(assignment_id) },
      data: { status: 'accepted' }
    });

    // Update officer status to Busy
    await prisma.officer.update({
      where: { id: assignment.officer_id },
      data: { status: 'Busy' }
    });

    res.json({ message: 'Assignment accepted', assignment: updatedAssignment });
  } catch (error) {
    console.error('Error accepting assignment:', error);
    res.status(500).json({ error: 'Failed to accept assignment' });
  }
};

const declineAssignment = async (req, res) => {
  try {
    const { assignment_id, decline_reason } = req.body;

    const assignment = await prisma.assignment.findUnique({
      where: { id: parseInt(assignment_id) },
      include: { officer: true }
    });

    if (!assignment || assignment.officer.firebase_uid !== req.user.firebase_uid) {
      return res.status(403).json({ error: 'Forbidden: Access denied' });
    }

    const updatedAssignment = await prisma.assignment.update({
      where: { id: parseInt(assignment_id) },
      data: { status: 'declined', decline_reason }
    });

    // Set officer status back to Available since they declined the task
    await prisma.officer.update({
      where: { id: assignment.officer_id },
      data: { status: 'Available' }
    });

    // Automatically trigger assigning them to the next nearest most important hotspot (excluding this one)
    const nextAssignment = await autoAssignOfficerToNextIssue(assignment.officer_id);

    res.json({ 
      message: 'Assignment declined successfully', 
      assignment: updatedAssignment,
      nextAssignment: nextAssignment || null
    });
  } catch (error) {
    console.error('Error declining assignment:', error);
    res.status(500).json({ error: 'Failed to decline assignment' });
  }
};

const completeAssignment = async (req, res) => {
  try {
    const { assignment_id } = req.body;

    const assignment = await prisma.assignment.findUnique({
      where: { id: parseInt(assignment_id) },
      include: { officer: true }
    });

    if (!assignment || assignment.officer.firebase_uid !== req.user.firebase_uid) {
      return res.status(403).json({ error: 'Forbidden: Access denied' });
    }

    const updatedAssignment = await prisma.assignment.update({
      where: { id: parseInt(assignment_id) },
      data: { status: 'completed', completed_at: new Date() }
    });

    // Mark officer Available now
    await prisma.officer.update({
      where: { id: assignment.officer_id },
      data: { status: 'Available' }
    });

    // Automatically find and assign the next nearest most important hotspot
    const nextAssignment = await autoAssignOfficerToNextIssue(assignment.officer_id);

    res.json({ 
      message: 'Assignment completed successfully', 
      assignment: updatedAssignment,
      nextAssignment: nextAssignment || null
    });
  } catch (error) {
    console.error('Error completing assignment:', error);
    res.status(500).json({ error: 'Failed to complete assignment' });
  }
};

module.exports = {
  registerOfficer,
  updateLocation,
  updateStatus,
  getCurrentAssignments,
  acceptAssignment,
  declineAssignment,
  completeAssignment
};
