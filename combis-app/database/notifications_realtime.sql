-- Table des notifications temps réel
CREATE TABLE IF NOT EXISTS notifications_realtime (
    id SERIAL PRIMARY KEY,
    destinataire_id INTEGER REFERENCES membres(id),
    titre VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    type_notification VARCHAR(50) DEFAULT 'info', -- info, success, warning, error, vote, sinistre
    donnees_extra JSONB,
    lien_action VARCHAR(300),
    lu BOOLEAN DEFAULT FALSE,
    date_lecture TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_notifications_realtime_destinataire ON notifications_realtime(destinataire_id);
CREATE INDEX IF NOT EXISTS idx_notifications_realtime_lu ON notifications_realtime(lu);
CREATE INDEX IF NOT EXISTS idx_notifications_realtime_created_at ON notifications_realtime(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_realtime_type ON notifications_realtime(type_notification);

-- Mise à jour du schéma principal
INSERT INTO modeles_sms (nom, type_notification, template) VALUES
('Nouveau vote', 'nouveau_vote', 'Bonjour {{nom}}, nouveau vote disponible: "{{titre}}". Votez avant le {{date_fin}}. Lien: {{lien_vote}}. LES COMBIS')
ON CONFLICT (nom) DO NOTHING;