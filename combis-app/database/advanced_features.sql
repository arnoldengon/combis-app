-- Extension des fonctionnalités avancées pour LES COMBIS

-- Table des notifications SMS
CREATE TABLE notifications_sms (
    id SERIAL PRIMARY KEY,
    destinataire_id INTEGER REFERENCES membres(id),
    telephone VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    type_notification VARCHAR(50) NOT NULL, -- rappel_cotisation, sinistre_approuve, convocation, etc.
    statut VARCHAR(20) DEFAULT 'en_attente', -- en_attente, envoye, echec, livre
    tentatives INTEGER DEFAULT 0,
    reference_externe VARCHAR(100), -- ID de l'opérateur SMS
    cout_fcfa INTEGER DEFAULT 0,
    date_envoi TIMESTAMP,
    date_livraison TIMESTAMP,
    erreur TEXT,
    expediteur_id INTEGER REFERENCES membres(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des documents/fichiers
CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    nom_fichier VARCHAR(255) NOT NULL,
    nom_original VARCHAR(255) NOT NULL,
    chemin_fichier VARCHAR(500) NOT NULL,
    taille_bytes INTEGER NOT NULL,
    type_mime VARCHAR(100) NOT NULL,
    type_document VARCHAR(50) NOT NULL, -- justificatif_sinistre, piece_identite, autre
    description TEXT,
    membre_id INTEGER REFERENCES membres(id),
    sinistre_id INTEGER REFERENCES sinistres(id),
    uploaded_by INTEGER REFERENCES membres(id) NOT NULL,
    statut VARCHAR(20) DEFAULT 'actif', -- actif, archive, supprime
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des votes pour validation
CREATE TABLE votes (
    id SERIAL PRIMARY KEY,
    objet_type VARCHAR(50) NOT NULL, -- sinistre, membre, decision
    objet_id INTEGER NOT NULL,
    titre VARCHAR(200) NOT NULL,
    description TEXT,
    type_vote VARCHAR(30) NOT NULL, -- simple_majorite, unanimite, quorum
    quorum_requis INTEGER DEFAULT 0,
    date_debut TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date_fin TIMESTAMP NOT NULL,
    statut VARCHAR(20) DEFAULT 'ouvert', -- ouvert, ferme, approuve, rejete
    cree_par INTEGER REFERENCES membres(id) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des réponses aux votes
CREATE TABLE reponses_votes (
    id SERIAL PRIMARY KEY,
    vote_id INTEGER REFERENCES votes(id),
    membre_id INTEGER REFERENCES membres(id),
    reponse VARCHAR(20) NOT NULL, -- pour, contre, abstention
    commentaire TEXT,
    date_reponse TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(vote_id, membre_id)
);

-- Table d'audit/logs des actions
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    membre_id INTEGER REFERENCES membres(id),
    action VARCHAR(100) NOT NULL,
    table_affectee VARCHAR(50),
    enregistrement_id INTEGER,
    anciennes_valeurs JSONB,
    nouvelles_valeurs JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des réunions et convocations
CREATE TABLE reunions (
    id SERIAL PRIMARY KEY,
    titre VARCHAR(200) NOT NULL,
    description TEXT,
    date_reunion TIMESTAMP NOT NULL,
    lieu VARCHAR(300),
    lien_visio VARCHAR(500),
    type_reunion VARCHAR(50) DEFAULT 'ordinaire', -- ordinaire, extraordinaire, assemblee_generale
    statut VARCHAR(20) DEFAULT 'planifiee', -- planifiee, en_cours, terminee, annulee
    ordre_du_jour TEXT,
    compte_rendu TEXT,
    cree_par INTEGER REFERENCES membres(id) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des convocations individuelles
CREATE TABLE convocations (
    id SERIAL PRIMARY KEY,
    reunion_id INTEGER REFERENCES reunions(id),
    membre_id INTEGER REFERENCES membres(id),
    statut_convocation VARCHAR(20) DEFAULT 'envoye', -- envoye, vu, confirme, decline
    date_envoi TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date_reponse TIMESTAMP,
    commentaire TEXT,
    UNIQUE(reunion_id, membre_id)
);

-- Table des modèles de SMS
CREATE TABLE modeles_sms (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    type_notification VARCHAR(50) NOT NULL,
    template TEXT NOT NULL, -- Avec variables {{nom}}, {{montant}}, etc.
    actif BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des configurations système
CREATE TABLE configurations (
    id SERIAL PRIMARY KEY,
    cle VARCHAR(100) UNIQUE NOT NULL,
    valeur TEXT,
    description TEXT,
    type_valeur VARCHAR(20) DEFAULT 'string', -- string, number, boolean, json
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour les performances
CREATE INDEX idx_notifications_sms_statut ON notifications_sms(statut);
CREATE INDEX idx_notifications_sms_type ON notifications_sms(type_notification);
CREATE INDEX idx_documents_membre ON documents(membre_id);
CREATE INDEX idx_documents_sinistre ON documents(sinistre_id);
CREATE INDEX idx_votes_statut ON votes(statut);
CREATE INDEX idx_votes_dates ON votes(date_debut, date_fin);
CREATE INDEX idx_audit_logs_membre ON audit_logs(membre_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_reunions_date ON reunions(date_reunion);

-- Insertion des modèles de SMS par défaut
INSERT INTO modeles_sms (nom, type_notification, template) VALUES
('Rappel cotisation', 'rappel_cotisation', 'Bonjour {{nom}}, votre cotisation de {{montant}} FCFA pour {{mois}}/{{annee}} est impayée. Échéance dépassée de {{jours_retard}} jour(s). LES COMBIS'),
('Sinistre approuvé', 'sinistre_approuve', 'Bonjour {{nom}}, votre sinistre {{type_sinistre}} a été approuvé pour {{montant}} FCFA. Paiement en cours. LES COMBIS'),
('Sinistre rejeté', 'sinistre_rejete', 'Bonjour {{nom}}, votre sinistre {{type_sinistre}} a été rejeté. Motif: {{motif}}. Contactez l''administration. LES COMBIS'),
('Convocation réunion', 'convocation_reunion', 'Bonjour {{nom}}, vous êtes convoqué(e) à la réunion "{{titre}}" le {{date}} à {{heure}} - {{lieu}}. LES COMBIS'),
('Paiement sinistre', 'paiement_sinistre', 'Bonjour {{nom}}, votre sinistre a été payé: {{montant}} FCFA via {{mode_paiement}}. Référence: {{reference}}. LES COMBIS'),
('Bienvenue nouveau membre', 'nouveau_membre', 'Bienvenue {{nom}} dans LES COMBIS! Votre cotisation: {{montant}} FCFA/mois. Téléchargez l''app: {{lien}}. LES COMBIS');

-- Insertion des configurations par défaut
INSERT INTO configurations (cle, valeur, description, type_valeur) VALUES
('sms_provider', 'orange_sms_api', 'Fournisseur SMS (orange_sms_api, mtn_api, nexmo)', 'string'),
('sms_api_key', '', 'Clé API du fournisseur SMS', 'string'),
('sms_sender_id', 'COMBIS', 'ID d''expéditeur pour les SMS', 'string'),
('sms_enabled', 'true', 'Activer/désactiver les SMS', 'boolean'),
('rappel_cotisation_jours', '7,15,30', 'Jours de retard pour rappels automatiques', 'string'),
('vote_duree_defaut_heures', '72', 'Durée par défaut des votes en heures', 'number'),
('quorum_defaut_pourcent', '60', 'Quorum par défaut en pourcentage', 'number'),
('backup_enabled', 'true', 'Activer les sauvegardes automatiques', 'boolean'),
('maintenance_mode', 'false', 'Mode maintenance', 'boolean');

COMMIT;