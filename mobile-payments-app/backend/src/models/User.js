const { Schema, model } = require('mongoose');

// Profil saisi par l'utilisateur au premier lancement de l'app (voir l'accueil Android en 3
// étapes). Le téléphone identifie l'utilisateur (obligatoire, unique) ; l'email est facultatif
// car peu fiable en zone rurale.
const UserSchema = new Schema(
  {
    nom: { type: String, required: true, trim: true },
    prenom: { type: String, required: true, trim: true },
    email: { type: String, trim: true, default: null },
    telephone: { type: String, required: true, trim: true, unique: true },
  },
  { timestamps: true }
);

module.exports = model('User', UserSchema);
