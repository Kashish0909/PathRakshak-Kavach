const seedDatabase = require('./seed-function');

seedDatabase()
  .then(() => {
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
