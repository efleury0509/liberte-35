# Règles de sécurité et de confidentialité

1. **Aucune donnée financière personnelle dans le dépôt.** Le développement
   et les tests utilisent uniquement des données fictives.
2. **Aucun secret dans le dépôt** : ni clé de chiffrement, ni phrase de
   passe, ni clé de récupération, ni autorisation Google, ni identifiant
   client secret. Le test `tests/secrets.test.ts` vérifie les fichiers suivis
   à chaque fabrication, et `.gitignore` exclut les fichiers de données.
3. **Aucun secret dans les journaux, les messages d'erreur ou les exports.**
   Les secrets de l'application (étape 15) seront rangés dans le
   Gestionnaire d'identification de Windows, jamais dans le fichier de données.
4. **Aucune ressource Internet** : polices, images et scripts sont livrés
   avec l'application. La politique de sécurité de la fenêtre n'autorise
   aucun domaine extérieur (testé par `tests/hors-ligne.test.ts`).
5. **Permissions minimales** : la fenêtre n'a que les permissions de base de
   Tauri (`src-tauri/capabilities/default.json`).
6. **Le journal des changements ne peut être ni modifié ni effacé**
   (protégé dans la base elle-même).
