const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

let matrixData = [];
let recommendationsIndex = {};

/**
 * Pre-loads the dispatch matrix and indexes it in-memory.
 */
function loadDispatchMatrix() {
  try {
    const matrixPath = path.join(__dirname, '../dispatch_matrix.json');
    if (fs.existsSync(matrixPath)) {
      matrixData = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
      recommendationsIndex = {};
      matrixData.forEach(item => {
        if (!recommendationsIndex[item.day]) {
          recommendationsIndex[item.day] = {};
        }
        if (!recommendationsIndex[item.day][item.hour]) {
          recommendationsIndex[item.day][item.hour] = [];
        }
        recommendationsIndex[item.day][item.hour].push(item);
      });
      console.log('Dispatch matrix pre-loaded and indexed successfully.');
    } else {
      console.warn('Dispatch matrix file not found during initialization.');
    }
  } catch (error) {
    console.error('Error pre-loading dispatch matrix:', error);
  }
}

// Initialize on load
loadDispatchMatrix();

/**
 * Perform O(1) index lookup for recommendations.
 */
function getRecommendations(day, hour) {
  if (day && hour !== undefined) {
    const h = parseInt(hour);
    return (recommendationsIndex[day] && recommendationsIndex[day][h]) || [];
  }
  if (day) {
    if (!recommendationsIndex[day]) return [];
    return Object.values(recommendationsIndex[day]).flat();
  }
  return matrixData;
}

/**
 * Calculates the Haversine distance between two coordinates in kilometers.
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) {
    return Infinity;
  }
  const R = 6371; // Radius of earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Finds the closest officer with status 'Available' to a given hotspot.
 */
async function findClosestAvailableOfficer(hotspot) {
  if (!hotspot || hotspot.lat === null || hotspot.lng === null) {
    return null;
  }

  const availableOfficers = await prisma.officer.findMany({
    where: {
      status: 'Available',
      lat: { not: null },
      lng: { not: null }
    }
  });

  if (availableOfficers.length === 0) {
    return null;
  }

  let closestOfficer = null;
  let minDistance = Infinity;

  for (const officer of availableOfficers) {
    const distance = calculateDistance(
      hotspot.lat,
      hotspot.lng,
      officer.lat,
      officer.lng
    );
    if (distance < minDistance) {
      minDistance = distance;
      closestOfficer = officer;
    }
  }

  return closestOfficer;
}

/**
 * Finds the next nearest, most important hotspot for a given officer.
 * 1. Limits focus to hotspots predicted active for the current Day & Hour.
 * 2. If all predicted hotspots are busy/completed, falls back to all other unassigned hotspots.
 * We balance priority using: Priority Score = severity_score / (distance + 1.0)
 */
async function findNextNearestMostImportantIssue(officer) {
  if (!officer || officer.lat === null || officer.lng === null) {
    return null;
  }

  // Get current day of week and hour
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const now = new Date();
  const currentDay = days[now.getDay()];
  const currentHour = now.getHours();

  // 1. Get predicted hotspot IDs for current day/hour from our O(1) in-memory index
  const predictions = getRecommendations(currentDay, currentHour);
  const predictedHotspotIds = predictions.map(p => p.hotspot_id);

  let unassignedHotspots = [];

  // Try to find available hotspots matching currently predicted ones
  if (predictedHotspotIds.length > 0) {
    unassignedHotspots = await prisma.hotspot.findMany({
      where: {
        id: { in: predictedHotspotIds },
        assignments: {
          none: {
            OR: [
              { status: { in: ['pending', 'accepted'] } },
              { officer_id: officer.id, status: 'declined' }
            ]
          }
        }
      }
    });
  }

  // 2. If no predicted hotspots are available/unassigned for the current slot,
  // fall back to all unassigned hotspots in the database so officers aren't left idle.
  if (unassignedHotspots.length === 0) {
    unassignedHotspots = await prisma.hotspot.findMany({
      where: {
        assignments: {
          none: {
            OR: [
              { status: { in: ['pending', 'accepted'] } },
              { officer_id: officer.id, status: 'declined' }
            ]
          }
        }
      }
    });
  }

  if (unassignedHotspots.length === 0) {
    return null;
  }

  let bestHotspot = null;
  let highestScore = -1;

  for (const hotspot of unassignedHotspots) {
    const distance = calculateDistance(
      officer.lat,
      officer.lng,
      hotspot.lat,
      hotspot.lng
    );
    
    // Priority Score = severity_score / (distance_in_km + 1.0)
    const score = hotspot.severity_score / (distance + 1.0);

    if (score > highestScore) {
      highestScore = score;
      bestHotspot = hotspot;
    }
  }

  return bestHotspot;
}

/**
 * Automatically assigns an available officer to their next nearest, most important hotspot.
 */
async function autoAssignOfficerToNextIssue(officerId) {
  const officer = await prisma.officer.findUnique({
    where: { id: officerId }
  });

  if (!officer || officer.status !== 'Available') {
    return null;
  }

  const nextHotspot = await findNextNearestMostImportantIssue(officer);
  if (!nextHotspot) {
    return null;
  }

  // Create pending assignment
  const assignment = await prisma.assignment.create({
    data: {
      hotspot_id: nextHotspot.id,
      officer_id: officer.id,
      status: 'pending'
    },
    include: {
      hotspot: true
    }
  });

  // Update officer status to Busy so they aren't assigned multiple tasks
  await prisma.officer.update({
    where: { id: officer.id },
    data: { status: 'Busy' }
  });

  return assignment;
}

module.exports = {
  calculateDistance,
  findClosestAvailableOfficer,
  findNextNearestMostImportantIssue,
  autoAssignOfficerToNextIssue,
  getRecommendations
};
