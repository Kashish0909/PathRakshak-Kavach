const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

const NEIGHBORHOODS = ['Downtown', 'Uptown', 'Industrial District', 'Suburban Sector', 'Financial District', 'Harbor Area', 'Residential Heights', 'Central Park Zone'];
const STREETS = ['5th Avenue', 'Broadway', 'Main Street', 'Oak Road', 'Pine Street', 'Elm Boulevard', 'Market Street', 'Park Lane', 'Sunset Strip', 'Grand Avenue'];
const VEHICLES = ['Sedan', 'SUV', 'Motorcycle', 'Truck', 'Bus'];
const VIOLATIONS = ['Speeding', 'Red Light Violation', 'Reckless Driving', 'Illegal Parking', 'DUI'];

async function seedDatabase() {
  console.log('Starting optimized bulk database seeding...');

  // 1. Read hotspots_master.json
  const hotspotsMasterPath = path.join(__dirname, '../hotspots_master.json');
  let hotspotsMaster = [];
  if (fs.existsSync(hotspotsMasterPath)) {
    try {
      hotspotsMaster = JSON.parse(fs.readFileSync(hotspotsMasterPath, 'utf8'));
    } catch (e) {
      console.error('Failed to parse hotspots_master.json', e);
    }
  }
  
  const hotspotData = [];
  for (const h of hotspotsMaster) {
    const severity_score = h.severity_score || (1.0 + (((h.id * 7) % 90) / 10));
    let risk_level = h.risk_level || 'Low';
    if (severity_score >= 8.5) risk_level = 'Critical';
    else if (severity_score >= 6.0) risk_level = 'High';
    else if (severity_score >= 3.0) risk_level = 'Medium';

    hotspotData.push({
      id: h.id,
      location: h.location,
      lat: h.lat,
      lng: h.lng,
      severity_score,
      risk_level
    });
  }

  // 2. Read Officers from officers.csv
  const officersPath = path.join(__dirname, '../officers.csv');
  const officerData = [];
  
  if (fs.existsSync(officersPath)) {
    const csvData = fs.readFileSync(officersPath, 'utf8').trim().split('\n');
    const lines = csvData.slice(1); // skip header
    const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      
      const parts = line.split(regex).map(val => val.replace(/^"|"$/g, '').trim());
      if (parts.length >= 8) {
        const name = parts[1];
        const badge_number = parts[2];
        const firebase_uid = parts[3];
        const status = parts[4];
        const lat = parseFloat(parts[5]);
        const lng = parseFloat(parts[6]);
        const performance_score = parseFloat(parts[7]);
        const email = `${name.toLowerCase().replace(/\s+/g, '.')}.${badge_number.toLowerCase()}@citypd.gov`;

        officerData.push({
          firebase_uid,
          name,
          email,
          role: 'Patrol',
          rank: 'Officer',
          status,
          lat,
          lng,
          performance_score
        });
      }
    }
  }

  // 3. Create Violations
  const violationData = [];
  for (let i = 1; i <= 20; i++) {
    const neighborhood = NEIGHBORHOODS[(i * 2) % NEIGHBORHOODS.length];
    const street1 = STREETS[(i * 4) % STREETS.length];
    const street2 = STREETS[(i * 5) % STREETS.length];
    const location = `${neighborhood} - Intersection of ${street1} & ${street2}`;
    
    const vehicle_type = VEHICLES[i % VEHICLES.length];
    const violation_type = VIOLATIONS[(i * 3) % VIOLATIONS.length];
    const impact_score = 1.0 + ((i * 3.1) % 9);
    
    const timestamp = new Date();
    timestamp.setHours(timestamp.getHours() - (i * 4));

    violationData.push({
      id: i,
      location,
      vehicle_type,
      violation_type,
      impact_score,
      timestamp
    });
  }

  // 4. Clear database tables in proper order (respecting foreign key constraints)
  console.log('Clearing database tables...');
  await prisma.assignment.deleteMany({});
  await prisma.violation.deleteMany({});
  await prisma.officer.deleteMany({});
  await prisma.hotspot.deleteMany({});

  // 5. Bulk insert data
  console.log(`Inserting ${hotspotData.length} hotspots...`);
  await prisma.hotspot.createMany({
    data: hotspotData
  });

  console.log(`Inserting ${officerData.length} officers...`);
  await prisma.officer.createMany({
    data: officerData
  });

  console.log(`Inserting ${violationData.length} violations...`);
  await prisma.violation.createMany({
    data: violationData
  });

  console.log('Seeding completed successfully!');
}

module.exports = seedDatabase;
