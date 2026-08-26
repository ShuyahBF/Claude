const express = require('express');
const Service = require('../models/Service');

const router = express.Router();

// GET /api/operators - liste des opérateurs distincts (avec filtre pays optionnel)
router.get('/operators', async (req, res, next) => {
  try {
    const filter = { active: true };
    if (req.query.country) filter.country = req.query.country;
    const operators = await Service.distinct('operator', filter);
    res.json(operators.sort());
  } catch (err) {
    next(err);
  }
});

// GET /api/services?operator=Orange&country=BF - services disponibles pour un opérateur
router.get('/services', async (req, res, next) => {
  try {
    const filter = { active: true };
    if (req.query.operator) filter.operator = req.query.operator;
    if (req.query.country) filter.country = req.query.country;
    if (req.query.category) filter.category = req.query.category;
    const services = await Service.find(filter).sort({ name: 1 });
    res.json(services);
  } catch (err) {
    next(err);
  }
});

// GET /api/services/:id
router.get('/services/:id', async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ error: 'Service introuvable' });
    res.json(service);
  } catch (err) {
    next(err);
  }
});

// POST /api/services - créer un nouveau service (protégé par API_KEY, voir middleware requireApiKey)
router.post('/services', async (req, res, next) => {
  try {
    const service = await Service.create(req.body);
    res.status(201).json(service);
  } catch (err) {
    next(err);
  }
});

// PUT /api/services/:id
router.put('/services/:id', async (req, res, next) => {
  try {
    const service = await Service.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!service) return res.status(404).json({ error: 'Service introuvable' });
    res.json(service);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/services/:id - désactivation logique (soft delete)
router.delete('/services/:id', async (req, res, next) => {
  try {
    const service = await Service.findByIdAndUpdate(
      req.params.id,
      { active: false },
      { new: true }
    );
    if (!service) return res.status(404).json({ error: 'Service introuvable' });
    res.json(service);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
