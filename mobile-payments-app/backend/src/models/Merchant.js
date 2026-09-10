const { Schema, model } = require('mongoose');

const MerchantSchema = new Schema(
  {
    code: { type: String, required: true, trim: true, match: /^[0-9]+$/ }, // code marchand, uniquement numérique
    operator: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true, match: /^[a-zA-Z0-9 ._-]+$/ }, // nom alphanumérique choisi par l'utilisateur
  },
  { timestamps: true }
);

// Un même code marchand est unique par opérateur (deux opérateurs peuvent réutiliser la même numérotation).
MerchantSchema.index({ operator: 1, code: 1 }, { unique: true });

module.exports = model('Merchant', MerchantSchema);
