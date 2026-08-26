const { Schema, model } = require('mongoose');

// Un champ que l'utilisateur doit saisir dans l'app avant de composer le code USSD.
// La clé du champ correspond au nom du placeholder utilisé dans `ussdTemplate` (ex: "{code}").
const ServiceFieldSchema = new Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    type: { type: String, enum: ['numeric', 'text'], default: 'numeric' },
    // Si vrai, ce champ est un "code marchand" : l'app recherche/crée un enregistrement
    // dans la collection Merchant à partir de la valeur saisie.
    isMerchantCode: { type: Boolean, default: false },
  },
  { _id: false }
);

const ServiceSchema = new Schema(
  {
    operator: { type: String, required: true, trim: true }, // ex: "Orange", "Moov Africa", "Telecel"
    country: { type: String, required: true, trim: true, default: 'BF' }, // code pays ISO (ex: "BF", "CI")
    name: { type: String, required: true, trim: true }, // ex: "Paiement marchand"
    category: {
      type: String,
      required: true,
      enum: [
        'merchant_payment',
        'bill_payment',
        'money_transfer',
        'airtime_topup',
        'internet_bundle',
        'other',
      ],
    },
    // Gabarit du code USSD avec placeholders, ex: "*144*10*{code}*{amount}#"
    ussdTemplate: { type: String, required: true, trim: true },
    fields: { type: [ServiceFieldSchema], default: [] },
    description: { type: String, trim: true, default: '' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

ServiceSchema.index({ operator: 1, country: 1, active: 1 });

module.exports = model('Service', ServiceSchema);
