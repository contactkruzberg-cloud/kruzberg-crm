# KRUZBERG CRM — Guide d'installation

Ce guide est écrit pour quelqu'un qui n'a jamais codé. Suivez chaque étape dans l'ordre.

---

## 1. Créer un projet Supabase (base de données)

1. Allez sur **[supabase.com](https://supabase.com)** et cliquez **Start your project**
2. Connectez-vous avec votre compte GitHub
3. Cliquez **New Project**
4. Remplissez :
   - **Name** : `kruzberg-crm`
   - **Database Password** : choisissez un mot de passe fort (gardez-le quelque part)
   - **Region** : `West EU (Paris)` ou le plus proche de chez vous
5. Cliquez **Create new project** et attendez ~2 minutes

## 2. Créer les tables de la base de données

1. Dans votre projet Supabase, cliquez sur **SQL Editor** (dans le menu à gauche)
2. Cliquez **New query**
3. Ouvrez le fichier `supabase/migrations/001_initial_schema.sql` de ce projet
4. Copiez TOUT le contenu et collez-le dans l'éditeur SQL
5. Cliquez **Run** (bouton vert en haut à droite)
6. Vous devriez voir "Success. No rows returned" — c'est normal !

## 3. Récupérer vos clés API Supabase

1. Dans le menu à gauche, cliquez **Settings** (l'icône engrenage)
2. Cliquez **API** dans le sous-menu
3. Vous y trouverez :
   - **Project URL** : quelque chose comme `https://xxxxx.supabase.co`
   - **anon / public key** : une longue chaîne commençant par `eyJ...`
4. Gardez cette page ouverte, vous en aurez besoin juste après

## 4. Configurer les variables d'environnement

1. Dans le dossier du projet, trouvez le fichier `.env.local`
2. Remplacez les valeurs vides par vos clés :

```
NEXT_PUBLIC_SUPABASE_URL=https://votre-projet.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=votre-clé-anon-ici
```

## 5. Déployer sur Vercel

1. Allez sur **[vercel.com](https://vercel.com)** et connectez-vous avec GitHub
2. Cliquez **Add New** → **Project**
3. Sélectionnez le repository `mon-saas` (ou le nom de votre repo)
4. Dans **Environment Variables**, ajoutez :
   - `NEXT_PUBLIC_SUPABASE_URL` → collez votre URL Supabase
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → collez votre clé anon
5. Cliquez **Deploy**
6. Attendez 2-3 minutes... et voilà !

## 6. Créer votre compte utilisateur

1. Ouvrez votre app déployée (Vercel vous donne l'URL)
2. Cliquez **Créer un compte**
3. Entrez votre email et un mot de passe
4. Vérifiez votre email et cliquez sur le lien de confirmation
5. Connectez-vous

## 7. Charger les données de démonstration (optionnel)

1. Retournez dans Supabase → **Authentication** → **Users**
2. Copiez votre **User UID** (la longue chaîne sous votre email)
3. Allez dans **SQL Editor** → New query
4. Ouvrez le fichier `supabase/seed.sql`
5. Copiez-collez le contenu dans l'éditeur
6. Remplacez `YOUR_USER_ID` par votre User UID (avec les guillemets)
7. Cliquez **Run**

Vous devriez maintenant voir des données de démo dans votre app !

---

## Lancer en local (optionnel, pour développeurs)

```bash
npm install
npm run dev
```

L'app sera disponible sur `http://localhost:3000`

---

## Support

Si quelque chose ne marche pas, vérifiez :
- Les clés Supabase sont bien copiées (sans espaces avant/après)
- Le SQL de migration a bien été exécuté sans erreur
- Votre email est bien confirmé dans Supabase Auth
