-- Schéma de base de données pour l'application "LES COMBIS"

-- Table des membres
CREATE TABLE membres (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    nom_complet VARCHAR(200) NOT NULL,
    date_naissance DATE NOT NULL,
    telephone_1 VARCHAR(20) NOT NULL,
    telephone_2 VARCHAR(20),
    email VARCHAR(100),
    profession VARCHAR(150),
    cotisation_annuelle INTEGER NOT NULL, -- en FCFA
    mot_de_passe VARCHAR(255), -- Hash du mot de passe
    date_inscription DATE DEFAULT CURRENT_DATE,
    statut VARCHAR(20) DEFAULT 'actif', -- actif, inactif, suspendu
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des cotisations mensuelles
CREATE TABLE cotisations (
    id SERIAL PRIMARY KEY,
    membre_id INTEGER REFERENCES membres(id),
    annee INTEGER NOT NULL,
    mois INTEGER NOT NULL CHECK (mois BETWEEN 1 AND 12),
    montant_mensuel INTEGER NOT NULL, -- cotisation_annuelle/12
    date_echeance DATE NOT NULL, -- 12e jour du mois
    date_paiement DATE,
    statut VARCHAR(20) DEFAULT 'impayee', -- impayee, payee, en_retard
    mode_paiement VARCHAR(30), -- especes, virement, mobile_money
    reference_paiement VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(membre_id, annee, mois)
);

-- Table des types de sinistres
CREATE TABLE types_sinistres (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    description TEXT,
    montant_couverture INTEGER NOT NULL, -- en FCFA
    necessite_validation BOOLEAN DEFAULT FALSE, -- pour "main levée"
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des sinistres déclarés
CREATE TABLE sinistres (
    id SERIAL PRIMARY KEY,
    membre_id INTEGER REFERENCES membres(id),
    type_sinistre_id INTEGER REFERENCES types_sinistres(id),
    date_sinistre DATE NOT NULL,
    date_declaration DATE DEFAULT CURRENT_DATE,
    description TEXT,
    montant_demande INTEGER,
    montant_approuve INTEGER,
    statut VARCHAR(30) DEFAULT 'en_attente', -- en_attente, approuve, rejete, paye
    documents_fournis TEXT[], -- array des chemins de fichiers
    motif_rejet TEXT,
    date_approbation DATE,
    date_paiement DATE,
    approuve_par INTEGER REFERENCES membres(id), -- membre qui a approuvé
    remarques TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des paiements de sinistres
CREATE TABLE paiements_sinistres (
    id SERIAL PRIMARY KEY,
    sinistre_id INTEGER REFERENCES sinistres(id),
    montant INTEGER NOT NULL,
    date_paiement DATE DEFAULT CURRENT_DATE,
    mode_paiement VARCHAR(30),
    reference_paiement VARCHAR(100),
    effectue_par INTEGER REFERENCES membres(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des rôles et permissions
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(50) NOT NULL UNIQUE,
    description TEXT
);

CREATE TABLE membre_roles (
    membre_id INTEGER REFERENCES membres(id),
    role_id INTEGER REFERENCES roles(id),
    date_attribution DATE DEFAULT CURRENT_DATE,
    PRIMARY KEY (membre_id, role_id)
);

-- Table des sessions utilisateur
CREATE TABLE sessions (
    id VARCHAR(100) PRIMARY KEY,
    membre_id INTEGER REFERENCES membres(id),
    data TEXT,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour optimiser les performances
CREATE INDEX idx_cotisations_membre_annee_mois ON cotisations(membre_id, annee, mois);
CREATE INDEX idx_sinistres_membre ON sinistres(membre_id);
CREATE INDEX idx_sinistres_statut ON sinistres(statut);
CREATE INDEX idx_cotisations_statut ON cotisations(statut);

-- Insertion des types de sinistres par défaut
INSERT INTO types_sinistres (nom, description, montant_couverture, necessite_validation) VALUES
('Décès parent/enfant', 'Décès en ligne directe ascendante (parent) ou descendante (enfant)', 100000, FALSE),
('Décès du membre', 'Décès du membre titulaire', 200000, FALSE),
('Opération chirurgicale', 'Maladie impliquant une opération chirurgicale', 75000, FALSE),
('Maladie grave', 'Maladie grave sans opération (sur main levée)', 50000, TRUE),
('Mariage', 'Mariage du membre', 50000, FALSE),
('Naissance', 'Naissance d\'un enfant du membre', 30000, FALSE);

-- Insertion des rôles par défaut
INSERT INTO roles (nom, description) VALUES
('admin', 'Administrateur avec tous les droits'),
('tresorier', 'Gestionnaire des finances et paiements'),
('membre', 'Membre ordinaire du groupe');