// const admin = require('firebase-admin');

// // Parse the JSON string from the environment variable
// // const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

// // admin.initializeApp({
// //   credential: admin.credential.cert(serviceAccount)
// // });

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  const idToken = authHeader.split('Bearer ')[1].trim();

  try {
    // MOCK AUTHENTICATION:
    // For testing with fake CSV data, we bypass Firebase and treat the Bearer token string directly as the firebase_uid!
    req.user = {
      firebase_uid: idToken,
      email: 'mockuser@citypd.gov' // Fallback email
    };
    next();

    /* REAL FIREBASE AUTH (Uncomment for production)
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    req.user.firebase_uid = decodedToken.uid;
    next();
    */
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(403).json({ error: 'Forbidden: Invalid token' });
  }
};

module.exports = authenticate;
