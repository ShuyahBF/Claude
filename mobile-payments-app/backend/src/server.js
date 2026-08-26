require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config/db');
const servicesRouter = require('./routes/services');
const merchantsRouter = require('./routes/merchants');

const app = express();
app.use(cors());
app.use(express.json());

// Protège les routes d'écriture avec une clé API optionnelle (définie via API_KEY dans .env).
function requireApiKey(req, res, next) {
  const expected = process.env.API_KEY;
  if (!expected) return next(); // pas de clé configurée -> pas de restriction (dev)
  if (req.get('x-api-key') === expected) return next();
  return res.status(401).json({ error: 'Clé API invalide ou manquante' });
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use(
  '/api',
  (req, res, next) => (['POST', 'PUT', 'DELETE'].includes(req.method) ? requireApiKey(req, res, next) : next()),
  servicesRouter,
  merchantsRouter
);

app.use((req, res) => res.status(404).json({ error: 'Route inconnue' }));

// Gestionnaire d'erreurs centralisé
app.use((err, req, res, next) => {
  console.error(err);
  if (err.code === 11000) {
    return res.status(409).json({ error: 'Cet enregistrement existe déjà' });
  }
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: 'Erreur serveur interne' });
});

const PORT = process.env.PORT || 3000;

connectDB(process.env.MONGODB_URI)
  .then(() => {
    app.listen(PORT, () => console.log(`API en écoute sur le port ${PORT}`));
  })
  .catch((err) => {
    console.error('Impossible de se connecter à MongoDB :', err.message);
    process.exit(1);
  });

module.exports = app;
