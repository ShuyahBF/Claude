const express = require('express');
const Merchant = require('../models/Merchant');

const router = express.Router();

// GET /api/merchants/:operator/:code - recherche d'un marchand par opérateur + code
// Réponse 404 si le code n'existe pas encore : l'app invite alors l'utilisateur à le créer.
router.get('/merchants/:operator/:code', async (req, res, next) => {
  try {
    const { operator, code } = req.params;
    const merchant = await Merchant.findOne({ operator, code });
    if (!merchant) return res.status(404).json({ error: 'Marchand introuvable' });
    res.json(merchant);
  } catch (err) {
    next(err);
  }
});

// GET /api/merchants?operator=Orange - historique des marchands connus pour un opérateur
router.get('/merchants', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.operator) filter.operator = req.query.operator;
    const merchants = await Merchant.find(filter).sort({ updatedAt: -1 }).limit(100);
    res.json(merchants);
  } catch (err) {
    next(err);
  }
});

// POST /api/merchants - enregistrer un nouveau code marchand avec l'intitulé choisi par l'utilisateur
router.post('/merchants', async (req, res, next) => {
  try {
    const { code, operator, label } = req.body;
    if (!/^[0-9]+$/.test(code || '')) {
      return res.status(400).json({ error: 'Le code marchand doit être entièrement numérique' });
    }
    if (!/^[a-zA-Z0-9 ._-]+$/.test(label || '')) {
      return res.status(400).json({ error: "L'intitulé doit être alphanumérique" });
    }
    const merchant = await Merchant.findOneAndUpdate(
      { operator, code },
      { operator, code, label },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
    res.status(201).json(merchant);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
