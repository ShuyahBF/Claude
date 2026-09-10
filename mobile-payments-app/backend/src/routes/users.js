const express = require('express');
const User = require('../models/User');

const router = express.Router();

// POST /api/users - enregistre/met à jour le profil d'un utilisateur (upsert par téléphone).
// Route publique (pas d'API_KEY, voir server.js) : c'est l'app elle-même qui l'appelle à
// l'accueil pour synchroniser le profil saisi à l'étape 1/3 ; ce n'est pas une écriture
// administrative comme le catalogue de services.
router.post('/users', async (req, res, next) => {
  try {
    const { nom, prenom, email, telephone } = req.body;
    if (!nom || !prenom || !telephone) {
      return res.status(400).json({ error: 'nom, prenom et telephone sont obligatoires' });
    }
    const user = await User.findOneAndUpdate(
      { telephone },
      { nom, prenom, email: email || null, telephone },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
