const { getRecommendations } = require('../utils/dispatchHelper');

const getDeploymentRecommendations = (req, res) => {
  try {
    const { day, hour } = req.query; // e.g., day='Monday', hour=14
    const recommendations = getRecommendations(day, hour);
    res.json(recommendations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch deployment recommendations: ' + error.message });
  }
};

module.exports = {
  getDeploymentRecommendations
};

