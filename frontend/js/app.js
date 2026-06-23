// Kavach Admin Dashboard - Frontend JavaScript Application

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDlgoVxKiro1qjZDAnBDUdRZIZG1PifK_A",
  authDomain: "police-dispatch-ai.firebaseapp.com",
  projectId: "police-dispatch-ai",
  storageBucket: "police-dispatch-ai.firebasestorage.app",
  messagingSenderId: "837847778574",
  appId: "1:837847778574:web:ffc251428ef30bdfaf835f",
  measurementId: "G-TT8G3EZJH9"
};

// Initialize Firebase App & Auth Services
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// Base API Config
let API_BASE = 'https://police-dispatch-server.onrender.com/api'; // Controlled dynamically by serverSelect in UI
const AUTH_HEADER = {
  'Authorization': '',
  'Content-Type': 'application/json'
};

// Global Error Catching for visual debugger console
window.onerror = function(message, source, lineno, colno, error) {
  const msg = `${message} (at ${source}:${lineno}:${colno})`;
  console.error('[UNCAUGHT EXCEPTION]', msg);
  
  // Try logging to simulation console
  setTimeout(() => {
    const consoleEl = document.getElementById('simConsole');
    if (consoleEl) {
      const logLine = document.createElement('div');
      logLine.className = 'log-line error';
      logLine.style.color = '#ff416c';
      logLine.style.fontWeight = 'bold';
      logLine.innerText = `[JS CRASH] ${msg}`;
      consoleEl.appendChild(logLine);
      consoleEl.scrollTop = consoleEl.scrollHeight;
    }
  }, 500);
  return false;
};

// Application State
let appData = {
  summary: {},
  hotspots: [],
  officers: [],
  leaderboard: [],
  deployments: [],
  activeTab: 'overview',
  selectedMapHotspot: null,
  hotspotsPage: 1,
  hotspotsPerPage: 50,
  officersPage: 1,
  officersPerPage: 50
};

// Global UI Elements
let mainMap = null;
let mapMarkers = {
  hotspots: {},
  officers: {},
  routes: []
};

// Charts
let severityChart = null;
let violationTypeChart = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupHourSelector();
  setupEventListeners();
  setupAuthListeners();

  // Auto-sync dashboard data every 5 seconds to reflect live officer actions (accept/reject)
  setInterval(() => {
    const dashboardContainer = document.getElementById('dashboardContainer');
    if (dashboardContainer && dashboardContainer.classList.contains('active')) {
      console.log('[AUTO-SYNC] Fetching latest officer statuses...');
      syncAllData(true);
    }
  }, 5000);
});

// Setup Firebase Auth State and Login/Sign-Out Events
function setupAuthListeners() {
  const loginForm = document.getElementById('loginForm');
  const signOutBtn = document.getElementById('signOutBtn');
  const loginScreen = document.getElementById('loginScreen');
  const dashboardContainer = document.getElementById('dashboardContainer');
  const loginError = document.getElementById('loginError');
  const profileName = document.getElementById('profileName');
  const authToggleLink = document.getElementById('authToggleLink');
  
  let isSignUpState = false;

  // Toggle Auth Modes (Sign In vs Sign Up)
  if (authToggleLink) {
    authToggleLink.addEventListener('click', (e) => {
      e.preventDefault();
      isSignUpState = !isSignUpState;
      
      const authTitle = document.getElementById('authTitle');
      const authDesc = document.getElementById('authDesc');
      const signUpNameGroup = document.getElementById('signUpNameGroup');
      const signUpConfirmGroup = document.getElementById('signUpConfirmGroup');
      const loginSubmitBtn = document.getElementById('loginSubmitBtn');
      const authToggleText = document.getElementById('authToggleText');
      
      const loginName = document.getElementById('loginName');
      const loginConfirmPassword = document.getElementById('loginConfirmPassword');
      
      if (loginError) loginError.style.display = 'none';

      if (isSignUpState) {
        authTitle.innerHTML = '<i class="fa-solid fa-user-plus" style="color: var(--neon-blue);"></i> Secure Sign Up';
        authDesc.innerText = 'Create a new administrator account';
        signUpNameGroup.style.display = 'flex';
        signUpConfirmGroup.style.display = 'flex';
        loginSubmitBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create Account';
        authToggleText.innerText = 'Already have an account?';
        authToggleLink.innerText = 'Sign In';
        loginName.required = true;
        loginConfirmPassword.required = true;
      } else {
        authTitle.innerHTML = '<i class="fa-solid fa-lock" style="color: var(--neon-blue);"></i> Secure Sign In';
        authDesc.innerText = 'AI-Powered Command & Deployment Center';
        signUpNameGroup.style.display = 'none';
        signUpConfirmGroup.style.display = 'none';
        loginSubmitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In';
        authToggleText.innerText = "Don't have an account?";
        authToggleLink.innerText = 'Sign Up';
        loginName.required = false;
        loginConfirmPassword.required = false;
      }
    });
  }

  // Handle Authentication State telemetries
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      console.log('Firebase user session established:', user.email);
      try {
        // Retrieve Firebase Auth JSON Web Token dynamically
        const idToken = await user.getIdToken();
        
        // Populate Authorization header with the ID token
        AUTH_HEADER['Authorization'] = `Bearer ${idToken}`;
        
        // Update user profile card in sidebar
        if (profileName) {
          profileName.innerText = user.displayName || user.email.split('@')[0];
        }
        
        // Display dashboard and hide login interface
        loginScreen.style.display = 'none';
        dashboardContainer.classList.add('active');
        
        // Trigger initial data synchronization
        syncAllData();
        
      } catch (error) {
        console.error('Failed to retrieve Firebase ID token:', error);
        showLoginError('Session initialization failed. Please try again.');
      }
    } else {
      console.log('No active session. Rendering login screen.');
      // Clear authentication header
      AUTH_HEADER['Authorization'] = '';
      
      // Hide dashboard and show login screen
      dashboardContainer.classList.remove('active');
      loginScreen.style.display = 'flex';
      
      // Reset inputs
      if (loginForm) loginForm.reset();
    }
  });

  // Handle Login/Signup submission
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value;
      const password = document.getElementById('loginPassword').value;
      const submitBtn = document.getElementById('loginSubmitBtn');
      
      if (loginError) loginError.style.display = 'none';
      submitBtn.disabled = true;

      if (API_BASE.includes('localhost') || API_BASE === '/api') {
        console.log('Bypassing Firebase Authentication for Local Dev Server');
        AUTH_HEADER['Authorization'] = 'Bearer mock-admin-token';
        if (profileName) {
          profileName.innerText = email.split('@')[0];
        }
        loginScreen.style.display = 'none';
        dashboardContainer.classList.add('active');
        syncAllData();
        submitBtn.disabled = false;
        return;
      }

      if (isSignUpState) {
        const name = document.getElementById('loginName').value;
        const confirmPassword = document.getElementById('loginConfirmPassword').value;
        
        if (password !== confirmPassword) {
          showLoginError('Passwords do not match.');
          submitBtn.disabled = false;
          return;
        }

        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating Account...';
        try {
          const userCredential = await auth.createUserWithEmailAndPassword(email, password);
          if (name) {
            await userCredential.user.updateProfile({ displayName: name });
            if (profileName) {
              profileName.innerText = name;
            }
          }
        } catch (error) {
          console.error('Firebase Auth sign-up failed:', error);
          showLoginError(error.message || 'Failed to create account.');
        } finally {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create Account';
        }
      } else {
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...';
        try {
          await auth.signInWithEmailAndPassword(email, password);
        } catch (error) {
          console.error('Firebase Auth sign-in failed:', error);
          let errorMsg = 'Invalid email address or password.';
          if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            errorMsg = 'Invalid email address or password.';
          } else if (error.code === 'auth/invalid-email') {
            errorMsg = 'The email address format is invalid.';
          } else if (error.message) {
            errorMsg = error.message;
          }
          showLoginError(errorMsg);
        } finally {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In';
        }
      }
    });
  }

  // Handle Sign Out action
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to sign out from Kavach Control Center?')) {
        try {
          await auth.signOut();
        } catch (error) {
          console.error('Sign-out failed:', error);
        }
      }
    });
  }
}

function showLoginError(message) {
  const loginError = document.getElementById('loginError');
  if (loginError) {
    loginError.innerText = message;
    loginError.style.display = 'block';
  }
}

// Setup sidebar tab switching
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const tabs = document.querySelectorAll('.tab-content');
  
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      
      const targetTab = item.getAttribute('data-tab');
      appData.activeTab = targetTab;
      
      // Update sidebar active class
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      
      // Update page headers
      const pageTitle = document.getElementById('pageTitle');
      const pageSubtitle = document.getElementById('pageSubtitle');
      
      const tabName = item.querySelector('span').innerText;
      pageTitle.innerText = tabName;
      pageSubtitle.innerText = getTabSubtitle(targetTab);
      
      // Update visible tab content
      tabs.forEach(tab => {
        tab.classList.remove('active');
        if (tab.id === `${targetTab}-tab`) {
          tab.classList.add('active');
        }
      });
      
      // Handle special tab initializations with extra safety for dimensions
      if (targetTab === 'map-view') {
        setTimeout(() => {
          initMap();
          if (mainMap) {
            mainMap.invalidateSize();
            console.log('Map size invalidated (1)');
          }
        }, 150);
        
        // Secondary invalidate call after transition finishes to ensure map renders
        setTimeout(() => {
          if (mainMap) {
            mainMap.invalidateSize();
            console.log('Map size invalidated (2)');
          }
        }, 400);
      }
    });
  });
}

function getTabSubtitle(tab) {
  switch (tab) {
    case 'overview': return 'Real-time statistics & traffic monitoring';
    case 'map-view': return 'Geographical visualization of hotspots & patrol units';
    case 'hotspots': return 'Manage high-traffic violation areas';
    case 'officers': return 'Manage on-field traffic officers';
    case 'leaderboard': return 'Officer performance scores & rankings';
    case 'ai-recommendations': return 'AI-driven deployment suggestions';
    case 'simulation': return 'Simulate mobile officer logs & coordinates';
    default: return '';
  }
}

// Populate AI recommendations hours select
function setupHourSelector() {
  const hourSelect = document.getElementById('aiHourSelect');
  if (hourSelect) {
    hourSelect.innerHTML = '';
    for (let i = 0; i < 24; i++) {
      const option = document.createElement('option');
      option.value = i;
      option.innerText = `${i.toString().padStart(2, '0')}:00`;
      hourSelect.appendChild(option);
    }
  }
}

// Bind clicks & filters
function setupEventListeners() {
  // Server selector binding
  const serverSelect = document.getElementById('serverSelect');
  const seedRemoteBtn = document.getElementById('seedRemoteBtn');
  if (serverSelect) {
    API_BASE = serverSelect.value;
    
    // Check initial API target on load
    if (API_BASE.includes('localhost') || API_BASE === '/api') {
      const authStatusText = document.getElementById('authStatusText');
      const authPulse = document.getElementById('authPulse');
      if (authStatusText) authStatusText.innerText = 'Bypass Auth Active';
      if (authPulse) authPulse.className = 'pulse-indicator green';
      if (seedRemoteBtn) seedRemoteBtn.style.display = 'none';
      AUTH_HEADER['Authorization'] = 'Bearer mock-admin-token';
    }

    serverSelect.addEventListener('change', (e) => {
      API_BASE = e.target.value;
      
      const authStatusText = document.getElementById('authStatusText');
      const authPulse = document.getElementById('authPulse');
      
      if (API_BASE.includes('localhost') || API_BASE === '/api') {
        if (authStatusText) authStatusText.innerText = 'Bypass Auth Active';
        if (authPulse) {
          authPulse.className = 'pulse-indicator green';
        }
        if (seedRemoteBtn) seedRemoteBtn.style.display = 'none';
        
        // Use mock token for local requests
        AUTH_HEADER['Authorization'] = 'Bearer mock-admin-token';
      } else {
        if (authStatusText) authStatusText.innerText = 'Firebase Auth Active';
        if (authPulse) {
          authPulse.className = 'pulse-indicator blue';
        }
        if (seedRemoteBtn) seedRemoteBtn.style.display = 'inline-flex';
        
        // Restore Firebase ID token if available
        if (auth.currentUser) {
          auth.currentUser.getIdToken().then(idToken => {
            AUTH_HEADER['Authorization'] = `Bearer ${idToken}`;
          }).catch(err => {
            console.error('Failed to restore Firebase ID token:', err);
          });
        }
      }
      
      logSimEvent('system', `API Server target modified to: ${API_BASE}`);
      syncAllData();
    });
  }

  // Bind push remote data button
  if (seedRemoteBtn) {
    seedRemoteBtn.addEventListener('click', () => {
      if (confirm('Do you want to clear the remote database and push all local seeded data (250 officers, 1931 hotspots) to it?')) {
        uploadLocalDataToRemote();
      }
    });
  }

  // Sync button
  document.getElementById('refreshBtn').addEventListener('click', () => {
    logSimEvent('system', 'Manually synchronizing database models...');
    syncAllData();
  });
  
  // Search & Filters - Hotspots
  document.getElementById('hotspotSearch').addEventListener('input', () => {
    appData.hotspotsPage = 1;
    renderHotspotsTable();
  });
  document.getElementById('hotspotSeverityFilter').addEventListener('change', () => {
    appData.hotspotsPage = 1;
    renderHotspotsTable();
  });
  
  // Search & Filters - Officers
  document.getElementById('officerSearch').addEventListener('input', () => {
    appData.officersPage = 1;
    renderOfficersTable();
  });
  document.getElementById('officerStatusFilter').addEventListener('change', () => {
    appData.officersPage = 1;
    renderOfficersTable();
  });

  // Pagination - Hotspots
  document.getElementById('hotspots-prev-btn').addEventListener('click', () => {
    if (appData.hotspotsPage > 1) {
      appData.hotspotsPage--;
      renderHotspotsTable();
    }
  });
  document.getElementById('hotspots-next-btn').addEventListener('click', () => {
    const total = getFilteredHotspotsCount();
    const maxPage = Math.ceil(total / appData.hotspotsPerPage);
    if (appData.hotspotsPage < maxPage) {
      appData.hotspotsPage++;
      renderHotspotsTable();
    }
  });

  // Pagination - Officers
  document.getElementById('officers-prev-btn').addEventListener('click', () => {
    if (appData.officersPage > 1) {
      appData.officersPage--;
      renderOfficersTable();
    }
  });
  document.getElementById('officers-next-btn').addEventListener('click', () => {
    const total = getFilteredOfficersCount();
    const maxPage = Math.ceil(total / appData.officersPerPage);
    if (appData.officersPage < maxPage) {
      appData.officersPage++;
      renderOfficersTable();
    }
  });

  // AI Recommendation Trigger
  document.getElementById('getAiRecsBtn').addEventListener('click', fetchAiRecommendations);

  // Manual map deployment button
  document.getElementById('mapDeployBtn').addEventListener('click', () => {
    const officerId = document.getElementById('mapDeployOfficer').value;
    const hotspotId = document.getElementById('mapDeployHotspot').value;
    if (!officerId || !hotspotId) {
      alert('Please select both an officer and a hotspot.');
      return;
    }
    executeDeployment(hotspotId, officerId);
  });

  // Modal handlers
  document.getElementById('closeDeployModal').addEventListener('click', closeDeployModal);
  document.getElementById('cancelDeployModal').addEventListener('click', closeDeployModal);
  document.getElementById('confirmDeployModal').addEventListener('click', handleModalDeploymentConfirm);


}

let isSyncing = false;
// Sync all data from backend API
async function syncAllData(isSilent = false) {
  if (isSyncing) {
    console.log('[SYNC] Synchronization already in progress. Skipping overlapping call.');
    return;
  }
  isSyncing = true;
  try {
    if (!isSilent) {
      showLoadingIndicators();
    }
    
    // Skip loading the massive hotspots list (1,931 items) if we already have it in memory
    const shouldFetchHotspots = appData.hotspots.length === 0;
    
    // Fetch all database endpoints concurrently to reduce load latency
    const promises = [
      fetch(`${API_BASE}/dashboard/summary`, { headers: AUTH_HEADER }),
      shouldFetchHotspots ? fetch(`${API_BASE}/hotspots`, { headers: AUTH_HEADER }) : Promise.resolve(null),
      fetch(`${API_BASE}/officers`, { headers: AUTH_HEADER }),
      fetch(`${API_BASE}/performance/officers`, { headers: AUTH_HEADER }),
      fetch(`${API_BASE}/assignments/active`, { headers: AUTH_HEADER })
    ];
    
    const [summaryRes, hotspotsRes, officersRes, leaderboardRes, assignmentsRes] = await Promise.all(promises);
    
    // Parse statistics summary
    const summaryData = await summaryRes.json().catch(() => null);
    if (!summaryRes.ok || !summaryData) {
      throw new Error(`Summary API failed: ${(summaryData && summaryData.error) || summaryRes.statusText}`);
    }
    appData.summary = summaryData;
    
    // Parse Hotspots (only if fetched)
    if (shouldFetchHotspots && hotspotsRes) {
      const hotspotsData = await hotspotsRes.json().catch(() => null);
      if (!hotspotsRes.ok || !hotspotsData) {
        throw new Error(`Hotspots API failed: ${(hotspotsData && hotspotsData.error) || hotspotsRes.statusText}`);
      }
      appData.hotspots = hotspotsData;
    }
    
    // Parse Officers
    const officersData = await officersRes.json().catch(() => null);
    if (!officersRes.ok || !officersData) {
      throw new Error(`Officers API failed: ${(officersData && officersData.error) || officersRes.statusText}`);
    }
    appData.officers = officersData;
    
    // Parse Leaderboard
    const leaderboardData = await leaderboardRes.json().catch(() => null);
    if (!leaderboardRes.ok || !leaderboardData) {
      throw new Error(`Leaderboard API failed: ${(leaderboardData && leaderboardData.error) || leaderboardRes.statusText}`);
    }
    appData.leaderboard = leaderboardData;
    
    // Parse active assignments/deployments
    let assignmentsData = [];
    try {
      console.log('[DEBUG] /assignments/active status:', assignmentsRes.status);
      if (assignmentsRes.ok) {
        assignmentsData = await assignmentsRes.json().catch(() => []);
        console.log('[DEBUG] /assignments/active raw response:', JSON.stringify(assignmentsData));
        console.log('[DEBUG] assignments count:', Array.isArray(assignmentsData) ? assignmentsData.length : 'NOT ARRAY');
      } else if (assignmentsRes.status === 404) {
        console.warn('Assignments API endpoint (/assignments/active) is missing on remote server. Falling back to local storage.');
        try {
          const localStored = localStorage.getItem('kavach_local_deployments');
          assignmentsData = localStored ? JSON.parse(localStored) : [];
          
          let changed = false;
          assignmentsData.forEach(d => {
            const officer = appData.officers.find(o => parseInt(o.id) === parseInt(d.officer_id));
            if (officer) {
              // Ignore automatic status checks if we explicitly set it to pending_assign locally to preserve PENDING status
              if (officer.status === 'pending_assign') {
                return;
              }
              // Only automatically resolve completed assignments when the officer returns to Available
              if (officer.status === 'Available' && d.status === 'accepted') {
                d.status = 'completed';
                changed = true;
              }
            }
          });
          if (changed) {
            localStorage.setItem('kavach_local_deployments', JSON.stringify(assignmentsData));
          }
        } catch (e) {
          assignmentsData = [];
        }
        logSimEvent('info', 'Loaded active deployments from local backup storage with status resolution.');
      } else {
        const err = await assignmentsRes.json().catch(() => ({}));
        console.error('[DEBUG] /assignments/active error response:', err);
        throw new Error(err.error || assignmentsRes.statusText || `HTTP ${assignmentsRes.status}`);
      }
    } catch (err) {
      console.warn('Failed to fetch assignments, checking local storage backup:', err);
      try {
        const localStored = localStorage.getItem('kavach_local_deployments');
        assignmentsData = localStored ? JSON.parse(localStored) : [];
      } catch (e) {
        assignmentsData = [];
      }
    }
    appData.deployments = Array.isArray(assignmentsData) ? assignmentsData : [];
    console.log('[DEBUG] appData.deployments set to:', appData.deployments.length, 'items');
    
    // Update Stats Card UI
    updateStatsCards();
    
    // Render Tables
    renderHotspotsTable();
    renderOfficersTable();
    renderLeaderboard();
    renderOverviewDeploymentsTable();
    
    // Setup select options for manual deployment
    populateDeploymentSelects();
    
    // Update Charts
    updateCharts();
    
    // Update Map if active
    if (appData.activeTab === 'map-view') {
      updateMapMarkers();
    }
    
  } catch (error) {
    console.error('Data synchronization failed:', error);
    logSimEvent('error', `Data Sync Failed: ${error.message}`);
    
    // Only display error rows if it's not a silent background sync
    if (!isSilent) {
      const tables = ['overview-deployments-table', 'hotspots-table-body', 'officers-table-body', 'leaderboard-table-body'];
      tables.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.innerHTML = `<tr><td colspan="10" class="text-center text-danger"><i class="fa-solid fa-triangle-exclamation"></i> Synchronisation failed: ${error.message}</td></tr>`;
        }
      });
    }
  } finally {
    isSyncing = false;
  }
}

// Push local SQLite data to remote Render server database
async function uploadLocalDataToRemote() {
  const seedBtn = document.getElementById('seedRemoteBtn');
  if (!seedBtn) return;
  
  try {
    logSimEvent('system', 'Initiating remote database seeding...');
    seedBtn.disabled = true;
    seedBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Seeding...';

    // If targeting remote server, we should directly call the remote seed endpoint
    // since the remote server's seed endpoint will fall back to seeding from local server-side files (officers.csv & hotspots_master.json).
    if (!API_BASE.includes('localhost') && API_BASE !== '/api') {
      logSimEvent('system', 'Target is remote. Directing server-side file seeding...');
      const seedRes = await fetch(`${API_BASE}/admin/seed`, {
        method: 'POST',
        headers: AUTH_HEADER,
        body: JSON.stringify({})
      });
      
      const seedResult = await seedRes.json().catch(() => ({}));
      if (!seedRes.ok) {
        throw new Error(seedResult.error || `HTTP ${seedRes.status}`);
      }
      
      logSimEvent('success', 'Remote database successfully populated with master dataset!');
      alert('Success: Remote server database populated successfully!');
      syncAllData();
      return;
    }

    // Fetch from local server (always running on localhost:3000/api)
    const localBase = 'http://localhost:3000/api';
    const localHeaders = {
      'Authorization': 'Bearer mock-admin-token',
      'Content-Type': 'application/json'
    };
    
    logSimEvent('system', 'Extracting hotspots from local SQLite...');
    const hotspotsRes = await fetch(`${localBase}/hotspots`, { headers: localHeaders });
    if (!hotspotsRes.ok) throw new Error('Failed to fetch local hotspots');
    const hotspots = await hotspotsRes.json();
    
    logSimEvent('system', 'Extracting officers from local SQLite...');
    const officersRes = await fetch(`${localBase}/officers`, { headers: localHeaders });
    if (!officersRes.ok) throw new Error('Failed to fetch local officers');
    const officers = await officersRes.json();
    
    logSimEvent('system', 'Extracting deployments from local SQLite...');
    const assignmentsRes = await fetch(`${localBase}/assignments/active`, { headers: localHeaders });
    if (!assignmentsRes.ok) throw new Error('Failed to fetch local assignments');
    const assignments = await assignmentsRes.json();
    
    logSimEvent('system', `Packaging dataset (${hotspots.length} hotspots, ${officers.length} officers)...`);
    
    // Clean assignments database structure (remove nested hotspots relation to match prisma schema)
    const cleanedAssignments = assignments.map(a => ({
      id: a.id,
      officer_id: a.officer_id,
      hotspot_id: a.hotspot_id,
      status: a.status,
      decline_reason: a.decline_reason,
      created_at: a.created_at,
      completed_at: a.completed_at
    }));

    // POST to remote server (which is the current API_BASE)
    let seedRes = await fetch(`${API_BASE}/admin/seed`, {
      method: 'POST',
      headers: AUTH_HEADER,
      body: JSON.stringify({
        hotspots,
        officers,
        assignments: cleanedAssignments
      })
    });
    
    // Fallback: If payload is too large (HTTP 413), retry with an empty body
    // since the remote server's seed endpoint can fall back to seeding from local server-side files.
    if (seedRes.status === 413) {
      logSimEvent('system', 'Payload too large (HTTP 413). Retrying with server-side seeding fallback...');
      seedRes = await fetch(`${API_BASE}/admin/seed`, {
        method: 'POST',
        headers: AUTH_HEADER,
        body: JSON.stringify({})
      });
    }
    
    const seedResult = await seedRes.json().catch(() => ({}));
    if (!seedRes.ok) {
      throw new Error(seedResult.error || `HTTP ${seedRes.status}`);
    }
    
    logSimEvent('success', 'Remote database successfully populated with local dataset!');
    alert('Success: Remote server database populated with local dataset!');
    syncAllData();
  } catch (error) {
    console.error('Remote seeding failed:', error);
    logSimEvent('error', `Remote Seeding Failed: ${error.message}`);
    alert(`Seeding failed: ${error.message}`);
  } finally {
    seedBtn.disabled = false;
    seedBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Push Local Data';
  }
}

// Stats UI updates
function updateStatsCards() {
  document.getElementById('stat-total-officers').innerText = appData.summary.totalOfficers || 0;
  document.getElementById('stat-active-officers').innerText = appData.summary.activeOfficers || 0;
  document.getElementById('stat-total-hotspots').innerText = appData.summary.totalHotspots || 0;
  document.getElementById('stat-active-assignments').innerText = appData.summary.activeAssignments || 0;
  
  if (appData.summary.totalOfficers > 0) {
    const pct = Math.round((appData.summary.activeOfficers / appData.summary.totalOfficers) * 100);
    document.getElementById('stat-active-pct').innerText = `${pct}% ready for dispatch`;
  }
}

// Show loading states in tables
function showLoadingIndicators() {
  const tables = ['overview-deployments-table', 'hotspots-table-body', 'officers-table-body', 'leaderboard-table-body'];
  tables.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = `<tr><td colspan="10" class="text-center"><i class="fa-solid fa-spinner fa-spin"></i> Synchronizing database model...</td></tr>`;
    }
  });
}

// Helper to count filtered hotspots
function getFilteredHotspotsCount() {
  const query = document.getElementById('hotspotSearch').value.toLowerCase();
  const severityFilter = document.getElementById('hotspotSeverityFilter').value;
  return appData.hotspots.filter(h => {
    const matchesSearch = (h.location || '').toLowerCase().includes(query) || 
                          (h.risk_level || '').toLowerCase().includes(query);
    const matchesSeverity = severityFilter === '' || h.risk_level === severityFilter;
    return matchesSearch && matchesSeverity;
  }).length;
}

// Render Hotspots Directory Table
function renderHotspotsTable() {
  const query = document.getElementById('hotspotSearch').value.toLowerCase();
  const severityFilter = document.getElementById('hotspotSeverityFilter').value;
  const tbody = document.getElementById('hotspots-table-body');
  
  if (!tbody) return;
  
  const filtered = appData.hotspots.filter(h => {
    const matchesSearch = (h.location || '').toLowerCase().includes(query) || 
                          (h.risk_level || '').toLowerCase().includes(query);
    const matchesSeverity = severityFilter === '' || h.risk_level === severityFilter;
    return matchesSearch && matchesSeverity;
  });
  
  const total = filtered.length;
  const page = appData.hotspotsPage;
  const perPage = appData.hotspotsPerPage;
  const maxPage = Math.max(1, Math.ceil(total / perPage));
  
  if (page > maxPage) appData.hotspotsPage = maxPage;
  
  const startIndex = (appData.hotspotsPage - 1) * perPage;
  const endIndex = Math.min(startIndex + perPage, total);
  
  document.getElementById('hotspots-page-start').innerText = total === 0 ? 0 : startIndex + 1;
  document.getElementById('hotspots-page-end').innerText = endIndex;
  document.getElementById('hotspots-total-count').innerText = total;
  
  document.getElementById('hotspots-prev-btn').disabled = appData.hotspotsPage === 1;
  document.getElementById('hotspots-next-btn').disabled = appData.hotspotsPage === maxPage;
  
  if (total === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No hotspots match the criteria.</td></tr>`;
    return;
  }
  
  const paginated = filtered.slice(startIndex, endIndex);
  
  tbody.innerHTML = paginated.map(h => {
    let severityClass = 'badge-red';
    if (h.risk_level === 'Medium') severityClass = 'badge-orange';
    if (h.risk_level === 'Low') severityClass = 'badge-blue';
    
    return `
      <tr>
        <td><strong>#${h.id}</strong></td>
        <td>${h.location || 'Unknown'}</td>
        <td><span class="rec-officer-score">${(h.severity_score !== undefined && h.severity_score !== null) ? h.severity_score.toFixed(1) : '0.0'} Pts</span></td>
        <td><span class="badge ${severityClass}">${h.risk_level || 'Low'}</span></td>
        <td>${(h.lat !== null && h.lat !== undefined) ? h.lat.toFixed(5) : '0.00000'}, ${(h.lng !== null && h.lng !== undefined) ? h.lng.toFixed(5) : '0.00000'}</td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="openDeployModal(${h.id}, '${(h.location || 'Unknown').replace(/'/g, "\\'")}', 'Risk: ${h.risk_level || 'Low'}')">
            <i class="fa-solid fa-paper-plane"></i> Deploy
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Helper to count filtered officers
function getFilteredOfficersCount() {
  const query = document.getElementById('officerSearch').value.toLowerCase();
  const statusFilter = document.getElementById('officerStatusFilter').value;
  return appData.officers.filter(o => {
    const matchesSearch = (o.name || '').toLowerCase().includes(query) || 
                          (o.rank || '').toLowerCase().includes(query) ||
                          (o.role || '').toLowerCase().includes(query) ||
                          (o.email || '').toLowerCase().includes(query);
    const matchesStatus = statusFilter === '' || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  }).length;
}

// Render Officers Directory Table
function renderOfficersTable() {
  const query = document.getElementById('officerSearch').value.toLowerCase();
  const statusFilter = document.getElementById('officerStatusFilter').value;
  const tbody = document.getElementById('officers-table-body');
  
  if (!tbody) return;
  
  // Sort officers numerically by ID ascending
  const filtered = appData.officers.filter(o => {
    const matchesSearch = (o.name || '').toLowerCase().includes(query) || 
                          (o.rank || '').toLowerCase().includes(query) ||
                          (o.role || '').toLowerCase().includes(query) ||
                          (o.email || '').toLowerCase().includes(query);
    const matchesStatus = statusFilter === '' || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  }).sort((a, b) => parseInt(a.id) - parseInt(b.id));
  
  const total = filtered.length;
  const page = appData.officersPage;
  const perPage = appData.officersPerPage;
  const maxPage = Math.max(1, Math.ceil(total / perPage));
  
  if (page > maxPage) appData.officersPage = maxPage;
  
  const startIndex = (appData.officersPage - 1) * perPage;
  const endIndex = Math.min(startIndex + perPage, total);
  
  document.getElementById('officers-page-start').innerText = total === 0 ? 0 : startIndex + 1;
  document.getElementById('officers-page-end').innerText = endIndex;
  document.getElementById('officers-total-count').innerText = total;
  
  document.getElementById('officers-prev-btn').disabled = appData.officersPage === 1;
  document.getElementById('officers-next-btn').disabled = appData.officersPage === maxPage;
  
  if (total === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted">No officers match the criteria.</td></tr>`;
    return;
  }
  
  const paginated = filtered.slice(startIndex, endIndex);
  
  tbody.innerHTML = paginated.map(o => {
    let statusClass = 'badge-blue';
    if (o.status === 'Busy') statusClass = 'badge-purple';
    if (o.status === 'Off-Duty') statusClass = 'badge-gray';
    
    const isAvailable = o.status === 'Available';
    
    return `
      <tr>
        <td><strong>${o.firebase_uid || `OFF-${o.id}`}</strong></td>
        <td>${o.name || 'Unknown'}</td>
        <td>${o.email || 'N/A'}</td>
        <td>${o.rank || 'Unknown'}</td>
        <td>${o.role || 'Unknown'}</td>
        <td><span class="badge ${statusClass}">${o.status || 'Available'}</span></td>
        <td><span class="rec-officer-score">${(o.performance_score !== undefined && o.performance_score !== null) ? o.performance_score.toFixed(1) : '0.0'} Pts</span></td>
        <td>${(o.lat !== null && o.lat !== undefined) ? o.lat.toFixed(5) : '0.00000'}, ${(o.lng !== null && o.lng !== undefined) ? o.lng.toFixed(5) : '0.00000'}</td>
        <td>
          <button class="btn btn-primary btn-sm" ${!isAvailable ? 'disabled' : ''} onclick="openDeployForOfficer(${o.id}, '${(o.name || 'Unknown').replace(/'/g, "\\'")}', '${o.rank || 'Officer'}')">
            Deploy
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Render Leaderboard
function renderLeaderboard() {
  const tbody = document.getElementById('leaderboard-table-body');
  if (!tbody) return;
  
  // Sort by score
  const sorted = [...appData.leaderboard].sort((a,b) => b.performance_score - a.performance_score);
  
  // Update Podium (Top 3)
  if (sorted.length >= 3) {
    document.getElementById('podium-name-1').innerText = sorted[0].name;
    document.getElementById('podium-score-1').innerText = `${sorted[0].performance_score.toFixed(1)} Pts (${sorted[0].email})`;
    
    document.getElementById('podium-name-2').innerText = sorted[1].name;
    document.getElementById('podium-score-2').innerText = `${sorted[1].performance_score.toFixed(1)} Pts`;
    
    document.getElementById('podium-name-3').innerText = sorted[2].name;
    document.getElementById('podium-score-3').innerText = `${sorted[2].performance_score.toFixed(1)} Pts`;
  }
  
  tbody.innerHTML = sorted.map((o, idx) => {
    let medal = idx + 1;
    if (idx === 0) medal = '<i class="fa-solid fa-trophy" style="color: #eab308;"></i>';
    else if (idx === 1) medal = '<i class="fa-solid fa-award" style="color: #9ca3af;"></i>';
    else if (idx === 2) medal = '<i class="fa-solid fa-medal" style="color: #d97706;"></i>';
    
    return `
      <tr>
        <td><strong>${medal}</strong></td>
        <td><strong>${o.name}</strong></td>
        <td>${o.email || 'N/A'}</td>
        <td>${o.role || 'Unknown'}</td>
        <td><strong style="color: var(--neon-blue);">${o.performance_score.toFixed(1)}</strong> / 100</td>
        <td>
          <div class="leaderboard-bar-bg">
            <div class="leaderboard-bar-fill" style="width: ${o.performance_score}%"></div>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Render Overview Active Deployments Table
function renderOverviewDeploymentsTable() {
  const tbody = document.getElementById('overview-deployments-table');
  if (!tbody) return;
  
  // Filter to pending/accepted/declined (exclude completed)
  const active = (appData.deployments || []).filter(d => d.status === 'pending' || d.status === 'accepted' || d.status === 'declined' || d.status === 'rejected');
  
  if (active.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No active or pending patrols at the moment. Use the 'Simulation Panel' or 'Hotspots' to deploy officers!</td></tr>`;
    return;
  }
  
  tbody.innerHTML = active.map(d => {
    // Use nested objects from API response first (remote server includes them),
    // then fall back to appData lookup with parseInt to avoid type mismatch.
    const officer = d.officer || appData.officers.find(o => parseInt(o.id) === parseInt(d.officer_id));
    const hotspot = d.hotspot || appData.hotspots.find(h => parseInt(h.id) === parseInt(d.hotspot_id));
    
    let statusClass = 'badge-orange';
    if (d.status === 'accepted') statusClass = 'badge-purple';
    if (d.status === 'completed') statusClass = 'badge-green';
    if (d.status === 'declined' || d.status === 'rejected') statusClass = 'badge-red';
    
    const time = d.created_at ? new Date(d.created_at).toLocaleTimeString() : 'N/A';
    const officerName = officer ? (officer.name || 'Unknown') : `Officer #${d.officer_id}`;
    const hotspotLocation = hotspot ? (hotspot.location || hotspot.name || 'Unknown') : `Hotspot #${d.hotspot_id}`;
    const coords = (hotspot && hotspot.lat != null && hotspot.lng != null)
      ? `${parseFloat(hotspot.lat).toFixed(4)}, ${parseFloat(hotspot.lng).toFixed(4)}`
      : 'N/A';
    
    return `
      <tr>
        <td><strong>#ASM-${d.id}</strong></td>
        <td>${officerName}</td>
        <td>${hotspotLocation}</td>
        <td>${coords}</td>
        <td><span class="badge ${statusClass}">${d.status || 'pending'}</span></td>
        <td>${time}</td>
      </tr>
    `;
  }).join('');
}

// Populate deployment option selectors
function populateDeploymentSelects() {
  const officerSelect = document.getElementById('mapDeployOfficer');
  const hotspotSelect = document.getElementById('mapDeployHotspot');
  
  if (!officerSelect || !hotspotSelect) return;
  
  // Available officers
  const availableOfficers = appData.officers.filter(o => o.status === 'Available');
  officerSelect.innerHTML = '<option value="">-- Choose Available Officer --</option>';
  availableOfficers.forEach(o => {
    officerSelect.innerHTML += `<option value="${o.id}">${o.name} (${o.rank || 'Officer'} - ${o.role || 'Title'})</option>`;
  });
  
  // Hotspots
  hotspotSelect.innerHTML = '<option value="">-- Choose Hotspot --</option>';
  appData.hotspots.forEach(h => {
    hotspotSelect.innerHTML += `<option value="${h.id}">${h.location} (${h.risk_level || 'Low'} Risk)</option>`;
  });
}



// AI recommendations engine fetch
async function fetchAiRecommendations() {
  const day = document.getElementById('aiDaySelect').value;
  const hour = document.getElementById('aiHourSelect').value;
  const container = document.getElementById('recommendations-grid');
  const temporalSlotSpan = document.getElementById('selected-temporal-slot');
  
  if (!container) return;
  
  temporalSlotSpan.innerText = `${day} at ${hour.toString().padStart(2, '0')}:00`;
  container.innerHTML = `<div class="no-data-card card"><i class="fa-solid fa-spinner fa-spin"></i> Analyzing historical patterns in CSV...</div>`;
  
  // Helper to calculate distance on frontend
  const calcDist = (lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  try {
    const res = await fetch(`${API_BASE}/deployment/recommendations?day=${day}&hour=${hour}`, { headers: AUTH_HEADER });
    const recommendations = await res.json();
    
    if (recommendations.length === 0) {
      container.innerHTML = `<div class="no-data-card card"><p>No specific peaks found for this hour. General patrolling is recommended.</p></div>`;
      return;
    }
    
    // Sort recommendations by historical severity/count if possible, showing the most critical first
    const displayedRecs = recommendations.slice(0, 9); // limit to top 9 cards
    
    container.innerHTML = displayedRecs.map(rec => {
      const hotspot = appData.hotspots.find(h => h.id === rec.hotspot_id);
      const hotspotName = hotspot ? hotspot.location : `Hotspot #${rec.hotspot_id}`;
      const riskLevel = hotspot ? hotspot.risk_level : (rec.predicted_risk_level || 'Low');
      
      let severityClass = 'badge-red';
      if (riskLevel === 'Medium') severityClass = 'badge-orange';
      if (riskLevel === 'Low') severityClass = 'badge-blue';
      
      const isDeployed = appData.deployments.some(d => d.hotspot_id === rec.hotspot_id && d.status !== 'completed');
      
      // Dynamically calculate recommended officers closest to this hotspot
      const officerCount = typeof rec.recommended_officers === 'number' ? rec.recommended_officers : 2;
      const availableOfficers = appData.officers.filter(o => o.status === 'Available');
      let recOfficers = [];
      if (hotspot && hotspot.lat && hotspot.lng) {
        recOfficers = availableOfficers
          .map(o => ({
            ...o,
            distance: calcDist(hotspot.lat, hotspot.lng, o.lat, o.lng)
          }))
          .sort((a, b) => a.distance - b.distance)
          .slice(0, officerCount);
      }

      // Recommended officers rendering
      let officersHtml = '<p class="text-muted" style="font-size:0.8rem;">No officers available nearby</p>';
      if (recOfficers.length > 0) {
        officersHtml = recOfficers.map(o => {
          let statusColor = 'var(--neon-green)';
          if (o.status === 'Busy') statusColor = 'var(--neon-purple)';
          if (o.status === 'Off-Duty') statusColor = 'var(--text-muted)';
          
          return `
            <div class="rec-officer-item">
              <span class="rec-officer-name">${o.name}</span>
              <span class="badge" style="font-size: 0.7rem; color:${statusColor}; background:rgba(255,255,255,0.02);">${o.status}</span>
              <span class="rec-officer-score">${o.performance_score.toFixed(1)} Pts</span>
            </div>
          `;
        }).join('');
      }

      // Check if we can deploy the top recommended officer (if they are available)
      const topOfficer = recOfficers[0];
      const canDeploy = topOfficer && topOfficer.status === 'Available' && !isDeployed;
      
      const violationType = rec.violation_type || (hotspot ? 'Speed / Red Light Violation' : 'Traffic Violation');
      const reason = rec.reason || `Historically high violation density predicted at ${hotspotName} during this temporal window.`;

      return `
        <div class="card rec-card">
          <div class="rec-header">
            <h4 class="rec-location">${hotspotName}</h4>
            <span class="badge ${severityClass}">${riskLevel}</span>
          </div>
          
          <div class="rec-details">
            <div><i class="fa-solid fa-triangle-exclamation"></i> <strong>Violation:</strong> ${violationType}</div>
            <div><i class="fa-solid fa-shield-halved"></i> <strong>Station:</strong> ${hotspot ? hotspot.police_station : 'Bengaluru Central'}</div>
          </div>
          
          <div class="rec-reason">${reason}</div>
          
          <div style="margin-top: 0.5rem;">
            <p style="font-size: 0.8rem; font-weight: 600; color: #fff; margin-bottom: 0.5rem;">Recommended Officers:</p>
            <div class="rec-officer-list">${officersHtml}</div>
          </div>
          
          <div style="margin-top: auto; padding-top: 1rem;">
            ${isDeployed 
              ? `<button class="btn btn-secondary btn-sm btn-block" disabled><i class="fa-solid fa-shield-halved"></i> Patrol Active</button>`
              : canDeploy
                ? `<button class="btn btn-primary btn-sm btn-block" onclick="executeDeployment(${rec.hotspot_id}, ${topOfficer.id})"><i class="fa-solid fa-circle-check"></i> Accept & Deploy</button>`
                : `<button class="btn btn-secondary btn-sm btn-block" onclick="openDeployModal(${rec.hotspot_id}, '${hotspotName.replace(/'/g, "\\'")}', '${hotspot ? hotspot.police_station : ''}')"><i class="fa-solid fa-paper-plane"></i> Deploy Custom</button>`
            }
          </div>
        </div>
      `;
    }).join('');
    
  } catch (error) {
    console.error('Failed to fetch AI recommendations:', error);
    container.innerHTML = `<div class="no-data-card card error"><p>Error fetching AI recommendations: ${error.message}</p></div>`;
  }
}

// Deploy officer API call
async function executeDeployment(hotspotId, officerId) {
  try {
    const res = await fetch(`${API_BASE}/deployment/assign`, {
      method: 'POST',
      headers: AUTH_HEADER,
      body: JSON.stringify({
        hotspot_id: parseInt(hotspotId),
        officer_id: parseInt(officerId)
      })
    });
    
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Failed to deploy officer');
    }
    
    const assignment = await res.json();
    
    // Save to local storage cache backup
    try {
      const localStored = localStorage.getItem('kavach_local_deployments');
      const deploymentsList = localStored ? JSON.parse(localStored) : [];
      // Ensure we don't save duplicates
      if (!deploymentsList.some(d => d.id === assignment.id)) {
        deploymentsList.push(assignment);
        localStorage.setItem('kavach_local_deployments', JSON.stringify(deploymentsList));
      }
    } catch (e) {
      console.warn('Could not cache assignment in local storage:', e);
    }
    
    // Use nested officer/hotspot from assignment response, fallback to appData
    const officer = assignment.officer || appData.officers.find(o => parseInt(o.id) === parseInt(officerId));
    if (officer) {
      // Force status to "pending_assign" locally to delay showing ACCEPTED status until officer updates app
      officer.status = 'pending_assign';
    }
    const hotspot = assignment.hotspot || appData.hotspots.find(h => parseInt(h.id) === parseInt(hotspotId));
    const officerName = officer ? officer.name : `Officer #${officerId}`;
    const hotspotName = hotspot ? (hotspot.location || hotspot.name || `Hotspot #${hotspotId}`) : `Hotspot #${hotspotId}`;
    logSimEvent('success', `[DEPLOY] Created Assignment #${assignment.id}: ${officerName} dispatched to ${hotspotName}`);
    
    // Close modal if open
    closeDeployModal();
    
    // Navigate to Overview tab so user sees the Active Deployments Dashboard update
    const overviewNavBtn = document.querySelector('[data-tab="overview"]');
    if (overviewNavBtn) overviewNavBtn.click();
    
    // Sync data to refresh Active Deployments Dashboard
    syncAllData();
    
    alert(`✅ Dispatched ${officerName} to ${hotspotName}!\n\nCheck the Overview tab for the Active Deployments Dashboard.`);
    
  } catch (error) {
    alert(`Error deploying officer: ${error.message}`);
  }
}

// Modal dialog controllers
function openDeployModal(hotspotId, hotspotName, policeStation) {
  document.getElementById('modalHotspotId').value = hotspotId;
  document.getElementById('modalHotspotName').innerText = hotspotName;
  document.getElementById('modalHotspotStation').innerText = policeStation;
  
  // Populate officers select with available officers matching this police station first
  const select = document.getElementById('modalOfficerSelect');
  select.innerHTML = '';
  
  const localOfficers = appData.officers.filter(o => o.status === 'Available' && o.police_station === policeStation);
  const otherOfficers = appData.officers.filter(o => o.status === 'Available' && o.police_station !== policeStation);
  
  if (localOfficers.length === 0 && otherOfficers.length === 0) {
    select.innerHTML = '<option value="">-- No Available Officers on Shift --</option>';
    document.getElementById('confirmDeployModal').disabled = true;
  } else {
    document.getElementById('confirmDeployModal').disabled = false;
    
    if (localOfficers.length > 0) {
      const optGroup = document.createElement('optgroup');
      optGroup.label = `Local Officers (${policeStation})`;
      localOfficers.forEach(o => {
        optGroup.innerHTML += `<option value="${o.id}">${o.name} (Score: ${o.performance_score})</option>`;
      });
      select.appendChild(optGroup);
    }
    
    if (otherOfficers.length > 0) {
      const optGroup = document.createElement('optgroup');
      optGroup.label = `Other Stations`;
      otherOfficers.forEach(o => {
        optGroup.innerHTML += `<option value="${o.id}">${o.name} (${o.police_station} - Score: ${o.performance_score})</option>`;
      });
      select.appendChild(optGroup);
    }
  }
  
  document.getElementById('deployModal').classList.add('active');
}

function openDeployForOfficer(officerId, officerName, policeStation) {
  // Modal designed for hotspot first, so we reverse search a hotspot in this station
  const matchingHotspot = appData.hotspots.find(h => h.police_station === policeStation) || appData.hotspots[0];
  if (!matchingHotspot) {
    alert('No hotspots available to deploy officer.');
    return;
  }
  openDeployModal(matchingHotspot.id, matchingHotspot.name, matchingHotspot.police_station);
  
  // Force select the clicked officer
  setTimeout(() => {
    document.getElementById('modalOfficerSelect').value = officerId;
  }, 100);
}

function closeDeployModal() {
  document.getElementById('deployModal').classList.remove('active');
}

function handleModalDeploymentConfirm() {
  const hotspotId = document.getElementById('modalHotspotId').value;
  const officerId = document.getElementById('modalOfficerSelect').value;
  if (!officerId) {
    alert('Please select an officer.');
    return;
  }
  executeDeployment(hotspotId, officerId);
}

// Leaflet Live Map Integration
function initMap() {
  try {
    if (mainMap !== null) {
      // Map already initialized, just invalidate size to make sure rendering is correct
      mainMap.invalidateSize();
      return;
    }
    
    if (typeof L === 'undefined') {
      throw new Error('Leaflet library (L) is not loaded correctly. Please ensure unpkg.com is accessible or local leaflet.js is loaded.');
    }
    
    console.log('Initializing Leaflet.js Live Map...');
    logSimEvent('system', 'Initializing Leaflet.js Live Map...');
    
    // Center on Bengaluru center computed from average hotspots
    mainMap = L.map('liveMap').setView([12.9716, 77.5946], 12);
    
    // Add dark tile layer CartoDB Dark Matter
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(mainMap);
    
    // Bind dynamic culling on map movement/zoom
    mainMap.on('moveend', updateMapMarkers);
    mainMap.on('zoomend', updateMapMarkers);
    
    // Load markers
    updateMapMarkers();
    logSimEvent('success', 'Live Map loaded successfully with Bengaluru coordinates.');
  } catch (error) {
    console.error('initMap error:', error);
    logSimEvent('error', `Live Map failed to initialize: ${error.message}`);
  }
}

function updateMapMarkers() {
  if (!mainMap) return;
  
  const bounds = mainMap.getBounds();
  
  // Clean up routes on update
  mapMarkers.routes.forEach(route => mainMap.removeLayer(route));
  mapMarkers.routes = [];

  // 1. Plot Hotspots as translucent circle overlays (with viewport culling)
  appData.hotspots.forEach(h => {
    const latLng = L.latLng(h.lat, h.lng);
    const isVisible = bounds.contains(latLng);
    
    if (isVisible) {
      if (!mapMarkers.hotspots[h.id]) {
        let color = '#eab308'; // Low (yellow)
        let radius = 180;
        if (h.risk_level === 'High') { color = 'var(--neon-red)'; radius = 350; }
        else if (h.risk_level === 'Medium') { color = 'var(--neon-orange)'; radius = 240; }
        
        const circle = L.circle([h.lat, h.lng], {
          color: color,
          fillColor: color,
          fillOpacity: 0.15,
          weight: 1.5,
          radius: radius
        }).addTo(mainMap);
        
        const popupContent = `
          <div>
            <h4>${h.location || 'Unknown'}</h4>
            <p><strong>Risk Level:</strong> <span class="badge ${h.risk_level === 'High' ? 'badge-red' : h.risk_level === 'Medium' ? 'badge-orange' : 'badge-blue'}">${h.risk_level || 'Low'}</span></p>
            <p><strong>Severity Score:</strong> ${(h.severity_score !== undefined && h.severity_score !== null) ? h.severity_score.toFixed(1) : '0.0'} Pts</p>
            <button class="btn btn-primary btn-sm leaflet-popup-btn" onclick="openDeployModal(${h.id}, '${(h.location || 'Unknown').replace(/'/g, "\\'")}', 'Risk: ${h.risk_level || 'Low'}')">
              <i class="fa-solid fa-paper-plane"></i> Deploy Patrol Unit
            </button>
          </div>
        `;
        
        circle.bindPopup(popupContent);
        mapMarkers.hotspots[h.id] = circle;
      }
    } else {
      if (mapMarkers.hotspots[h.id]) {
        mainMap.removeLayer(mapMarkers.hotspots[h.id]);
        delete mapMarkers.hotspots[h.id];
      }
    }
  });

  // 2. Plot Officers with custom styled markers (with viewport culling)
  appData.officers.forEach(o => {
    const latLng = L.latLng(o.lat, o.lng);
    const isVisible = bounds.contains(latLng);
    
    if (isVisible) {
      if (!mapMarkers.officers[o.id]) {
        let markerColor = '#3b82f6'; // Available (blue)
        if (o.status === 'Busy') markerColor = '#a855f7'; // Busy (purple)
        if (o.status === 'Off-Duty') markerColor = '#6b7280'; // Off-duty (gray)
        
        const svgIcon = L.divIcon({
          html: `
            <div style="
              width: 24px;
              height: 24px;
              background: ${markerColor};
              border: 2px solid #fff;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              box-shadow: 0 0 10px rgba(0,0,0,0.5);
              cursor: pointer;
            ">
              <i class="fa-solid fa-user-shield" style="font-size: 11px;"></i>
            </div>
          `,
          className: 'custom-officer-icon',
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });
        
        const marker = L.marker([o.lat, o.lng], { icon: svgIcon }).addTo(mainMap);
        
        const popupContent = `
          <div>
            <h4>Officer ${o.name}</h4>
            <p><strong>Rank:</strong> ${o.rank || 'Officer'}</p>
            <p><strong>Role:</strong> ${o.role || 'Unknown'}</p>
            <p><strong>Status:</strong> ${o.status || 'Available'}</p>
            <p><strong>Performance Score:</strong> ${(o.performance_score !== undefined && o.performance_score !== null) ? o.performance_score.toFixed(1) : '0.0'} / 100</p>
            <p><strong>Email:</strong> ${o.email || 'N/A'}</p>
          </div>
        `;
        
        marker.bindPopup(popupContent);
        mapMarkers.officers[o.id] = marker;
      } else {
        // Dynamically update status color if already on map
        let markerColor = '#3b82f6';
        if (o.status === 'Busy') markerColor = '#a855f7';
        if (o.status === 'Off-Duty') markerColor = '#6b7280';
        
        const markerElement = mapMarkers.officers[o.id].getElement();
        if (markerElement && markerElement.firstElementChild) {
          markerElement.firstElementChild.style.backgroundColor = markerColor;
        }
      }
    } else {
      if (mapMarkers.officers[o.id]) {
        mainMap.removeLayer(mapMarkers.officers[o.id]);
        delete mapMarkers.officers[o.id];
      }
    }
  });

  // 3. Draw dashes from busy officers to their assigned hotspots
  appData.deployments.filter(d => d.status === 'accepted').forEach(d => {
    const officer = appData.officers.find(o => o.id === d.officer_id);
    const hotspot = appData.hotspots.find(h => h.id === d.hotspot_id);
    
    if (officer && hotspot) {
      const line = L.polyline([[officer.lat, officer.lng], [hotspot.lat, hotspot.lng]], {
        color: '#a855f7',
        weight: 1.5,
        dashArray: '5, 8',
        opacity: 0.7
      }).addTo(mainMap);
      
      mapMarkers.routes.push(line);
    }
  });
}

// Chart.js Stats Generation
function updateCharts() {
  if (!appData.hotspots || appData.hotspots.length === 0) return;
  
  // 1. Severity/Risk Distribution
  const severityCounts = { High: 0, Medium: 0, Low: 0 };
  appData.hotspots.forEach(h => {
    if (h.risk_level && severityCounts[h.risk_level] !== undefined) {
      severityCounts[h.risk_level]++;
    }
  });
  
  const severityCtx = document.getElementById('severityChart');
  if (severityCtx) {
    if (severityChart) severityChart.destroy();
    
    severityChart = new Chart(severityCtx, {
      type: 'doughnut',
      data: {
        labels: ['High Risk', 'Medium Risk', 'Low Risk'],
        datasets: [{
          data: [severityCounts.High, severityCounts.Medium, severityCounts.Low],
          backgroundColor: ['#ff416c', '#ff9f43', '#00f2fe'],
          borderColor: '#111827',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#f3f4f6', font: { family: 'Inter' } }
          }
        }
      }
    });
  }

  // 2. High Risk Hotspot Regions (Top 5 highest severity scores)
  const highRiskHotspots = appData.hotspots
    .filter(h => h.risk_level === 'High' || h.severity_score >= 7.0)
    .sort((a, b) => b.severity_score - a.severity_score)
    .slice(0, 5);

  const typeCtx = document.getElementById('violationTypeChart');
  if (typeCtx) {
    if (violationTypeChart) violationTypeChart.destroy();
    
    violationTypeChart = new Chart(typeCtx, {
      type: 'bar',
      data: {
        labels: highRiskHotspots.map(h => h.location.split(' - ')[1] || h.location),
        datasets: [{
          label: 'Severity Score',
          data: highRiskHotspots.map(h => h.severity_score),
          backgroundColor: 'rgba(255, 65, 108, 0.45)', // Neon Red translucent
          borderColor: '#ff416c',
          borderWidth: 1.5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#9ca3af' } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af', stepSize: 1 } }
        }
      }
    });
  }
}

// Console Logging Fallback instead of Simulation Console
function logSimEvent(type, message) {
  console.log(`[${type.toUpperCase()}] ${message}`);
}
