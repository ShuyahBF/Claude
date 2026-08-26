// Peuple la base avec des services USSD réels (Burkina Faso) à titre d'exemple.
// Adaptez/complétez ces gabarits selon les codes réellement en vigueur chez chaque opérateur.
require('dotenv').config();
const { connectDB } = require('../config/db');
const Service = require('../models/Service');

const services = [
  {
    operator: 'Orange',
    country: 'BF',
    name: 'Paiement marchand',
    category: 'merchant_payment',
    ussdTemplate: '*144*10*{code}*{amount}#',
    fields: [
      { key: 'code', label: 'Code marchand', type: 'numeric', isMerchantCode: true },
      { key: 'amount', label: 'Montant (FCFA)', type: 'numeric' },
    ],
    description: 'Paiement Orange Money chez un marchand affilié',
  },
  {
    operator: 'Orange',
    country: 'BF',
    name: 'Paiement de facture',
    category: 'bill_payment',
    ussdTemplate: '*144*4*{code}*{amount}#',
    fields: [
      { key: 'code', label: 'Code du fournisseur', type: 'numeric', isMerchantCode: true },
      { key: 'amount', label: 'Montant (FCFA)', type: 'numeric' },
    ],
    description: 'Règlement de facture (eau, électricité, etc.) via Orange Money',
  },
  {
    operator: 'Orange',
    country: 'BF',
    name: 'Transfert d\'argent',
    category: 'money_transfer',
    ussdTemplate: '*144*1*{phone}*{amount}#',
    fields: [
      { key: 'phone', label: 'Numéro du bénéficiaire', type: 'numeric' },
      { key: 'amount', label: 'Montant (FCFA)', type: 'numeric' },
    ],
    description: 'Transfert d\'argent vers un autre numéro Orange Money',
  },
  {
    operator: 'Orange',
    country: 'BF',
    name: 'Achat de crédit de communication',
    category: 'airtime_topup',
    ussdTemplate: '*144*4*1*{amount}#',
    fields: [{ key: 'amount', label: 'Montant (FCFA)', type: 'numeric' }],
    description: 'Rechargement de crédit de communication depuis le solde Orange Money',
  },
  {
    operator: 'Moov Africa',
    country: 'BF',
    name: 'Paiement marchand',
    category: 'merchant_payment',
    ussdTemplate: '*555*2*{code}*{amount}#',
    fields: [
      { key: 'code', label: 'Code marchand', type: 'numeric', isMerchantCode: true },
      { key: 'amount', label: 'Montant (FCFA)', type: 'numeric' },
    ],
    description: 'Paiement Moov Money chez un marchand affilié',
  },
  {
    operator: 'Moov Africa',
    country: 'BF',
    name: 'Transfert d\'argent',
    category: 'money_transfer',
    ussdTemplate: '*555*1*{phone}*{amount}#',
    fields: [
      { key: 'phone', label: 'Numéro du bénéficiaire', type: 'numeric' },
      { key: 'amount', label: 'Montant (FCFA)', type: 'numeric' },
    ],
    description: 'Transfert d\'argent Moov Money',
  },
  {
    operator: 'Telecel Faso',
    country: 'BF',
    name: 'Paiement marchand',
    category: 'merchant_payment',
    ussdTemplate: '*133*3*{code}*{amount}#',
    fields: [
      { key: 'code', label: 'Code marchand', type: 'numeric', isMerchantCode: true },
      { key: 'amount', label: 'Montant (FCFA)', type: 'numeric' },
    ],
    description: 'Paiement Telecel Money chez un marchand affilié',
  },
];

async function seed() {
  await connectDB(process.env.MONGODB_URI);
  for (const svc of services) {
    await Service.findOneAndUpdate(
      { operator: svc.operator, country: svc.country, name: svc.name },
      svc,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  console.log(`${services.length} services insérés/à jour.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
