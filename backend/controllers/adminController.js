const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { findClosestAvailableOfficer } = require('../utils/dispatchHelper');

const getDashboardSummary = async (req, res) => {
  try {
    const totalOfficers = await prisma.officer.count();
    const activeOfficers = await prisma.officer.count({ where: { status: 'Available' } });
    const totalHotspots = await prisma.hotspot.count();
    const activeAssignments = await prisma.assignment.count({ where: { status: 'accepted' } });

    res.json({
      totalOfficers,
      activeOfficers,
      totalHotspots,
      activeAssignments
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
};

const getHotspots = async (req, res) => {
  try {
    const hotspots = await prisma.hotspot.findMany();
    res.json(hotspots);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch hotspots' });
  }
};

const getOfficers = async (req, res) => {
  try {
    const officers = await prisma.officer.findMany();
    res.json(officers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch officers' });
  }
};

const getLeaderboard = async (req, res) => {
  try {
    const leaderboard = await prisma.officer.findMany({
      orderBy: {
        performance_score: 'desc'
      },
      take: 10
    });
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch leaderboard data' });
  }
};

const assignDeployment = async (req, res) => {
  try {
    const { hotspot_id, officer_id } = req.body;

    const hotspot = await prisma.hotspot.findUnique({
      where: { id: parseInt(hotspot_id) }
    });

    if (!hotspot) {
      return res.status(404).json({ error: 'Hotspot not found' });
    }

    let assignedOfficerId = officer_id ? parseInt(officer_id) : null;

    if (!assignedOfficerId) {
      // Find the closest available officer to the hotspot
      const closestOfficer = await findClosestAvailableOfficer(hotspot);
      if (!closestOfficer) {
        return res.status(400).json({ error: 'No available officers found near this hotspot' });
      }
      assignedOfficerId = closestOfficer.id;
    } else {
      // Verify that the specified officer is available
      const officer = await prisma.officer.findUnique({
        where: { id: assignedOfficerId }
      });
      if (!officer) {
        return res.status(404).json({ error: 'Officer not found' });
      }
      if (officer.status !== 'Available') {
        return res.status(400).json({ error: 'Selected officer is not currently Available' });
      }
    }

    const assignment = await prisma.assignment.create({
      data: {
        hotspot_id: hotspot.id,
        officer_id: assignedOfficerId,
        status: 'pending'
      },
      include: {
        hotspot: true,
        officer: true
      }
    });

    // Update officer status to Busy so they aren't assigned elsewhere
    await prisma.officer.update({
      where: { id: assignedOfficerId },
      data: { status: 'Busy' }
    });

    res.status(201).json(assignment);
  } catch (error) {
    console.error('Error assigning deployment:', error);
    res.status(500).json({ error: 'Failed to create assignment' });
  }
};

const triggerDatabaseSeed = async (req, res) => {
  try {
    const seedDatabase = require('../prisma/seed-function');
    await seedDatabase();
    res.json({ message: 'Database seeded successfully' });
  } catch (error) {
    console.error('Error seeding database:', error);
    res.status(500).json({ error: 'Failed to seed database: ' + error.message });
  }
};

const getActiveAssignments = async (req, res) => {
  try {
    const assignments = await prisma.assignment.findMany({
      where: {
        status: { in: ['pending', 'accepted'] }
      },
      include: {
        hotspot: true,
        officer: true
      }
    });
    res.json(assignments);
  } catch (error) {
    console.error('getActiveAssignments error:', error);
    res.status(500).json({ error: 'Failed to fetch active assignments' });
  }
};

module.exports = {
  getDashboardSummary,
  getHotspots,
  getOfficers,
  getLeaderboard,
  assignDeployment,
  triggerDatabaseSeed,
  getActiveAssignments
};
