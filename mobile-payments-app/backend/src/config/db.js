const mongoose = require('mongoose');

async function connectDB(uri) {
  if (!uri) {
    throw new Error('MONGODB_URI manquant : définissez-le dans le fichier .env');
  }

  mongoose.connection.on('connected', () => {
    console.log('MongoDB connecté');
  });
  mongoose.connection.on('error', (err) => {
    console.error('Erreur de connexion MongoDB :', err.message);
  });

  await mongoose.connect(uri);
  return mongoose.connection;
}

module.exports = { connectDB };
