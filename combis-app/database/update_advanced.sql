-- Script de mise à jour pour les fonctionnalités avancées

-- Exécuter le schéma des fonctionnalités avancées
\i advanced_features.sql

-- Exécuter les notifications temps réel
\i notifications_realtime.sql

-- Créer des vues utiles pour les statistiques avancées
CREATE OR REPLACE VIEW vue_membres_stats AS
SELECT 
    m.*,
    COALESCE(SUM(CASE WHEN c.statut = 'payee' THEN c.montant_mensuel ELSE 0 END), 0) as total_cotisations_payees,
    COALESCE(SUM(CASE WHEN c.statut = 'impayee' THEN c.montant_mensuel ELSE 0 END), 0) as total_cotisations_impayees,
    COUNT(DISTINCT c.id) as nombre_cotisations,
    COUNT(DISTINCT s.id) as nombre_sinistres,
    COALESCE(SUM(CASE WHEN s.statut = 'paye' THEN s.montant_approuve ELSE 0 END), 0) as total_sinistres_payes,
    COUNT(DISTINCT rv.id) as nombre_votes_participes,
    COALESCE(array_agg(DISTINCT r.nom) FILTER (WHERE r.nom IS NOT NULL), ARRAY[]::VARCHAR[]) as roles
FROM membres m
LEFT JOIN cotisations c ON m.id = c.membre_id
LEFT JOIN sinistres s ON m.id = s.membre_id
LEFT JOIN reponses_votes rv ON m.id = rv.membre_id
LEFT JOIN membre_roles mr ON m.id = mr.membre_id
LEFT JOIN roles r ON mr.role_id = r.id
GROUP BY m.id;

-- Vue pour les statistiques financières mensuelles
CREATE OR REPLACE VIEW vue_stats_financieres_mensuelles AS
WITH mois_serie AS (
    SELECT 
        generate_series(
            DATE_TRUNC('month', CURRENT_DATE - INTERVAL '11 months'), 
            DATE_TRUNC('month', CURRENT_DATE), 
            INTERVAL '1 month'
        ) as mois
),
cotisations_mois AS (
    SELECT 
        DATE_TRUNC('month', MAKE_DATE(annee, mois, 1)) as mois,
        COUNT(*) as nombre_cotisations,
        COUNT(CASE WHEN statut = 'payee' THEN 1 END) as cotisations_payees,
        COALESCE(SUM(CASE WHEN statut = 'payee' THEN montant_mensuel ELSE 0 END), 0) as recettes
    FROM cotisations
    WHERE MAKE_DATE(annee, mois, 1) >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '11 months')
    GROUP BY DATE_TRUNC('month', MAKE_DATE(annee, mois, 1))
),
sinistres_mois AS (
    SELECT 
        DATE_TRUNC('month', date_sinistre) as mois,
        COUNT(*) as nombre_sinistres,
        COUNT(CASE WHEN statut = 'paye' THEN 1 END) as sinistres_payes,
        COALESCE(SUM(CASE WHEN statut = 'paye' THEN montant_approuve ELSE 0 END), 0) as depenses
    FROM sinistres
    WHERE date_sinistre >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '11 months')
    GROUP BY DATE_TRUNC('month', date_sinistre)
)
SELECT 
    ms.mois,
    TO_CHAR(ms.mois, 'YYYY-MM') as mois_formatted,
    TO_CHAR(ms.mois, 'Month YYYY') as mois_nom,
    COALESCE(cm.nombre_cotisations, 0) as nombre_cotisations,
    COALESCE(cm.cotisations_payees, 0) as cotisations_payees,
    COALESCE(cm.recettes, 0) as recettes,
    COALESCE(sm.nombre_sinistres, 0) as nombre_sinistres,
    COALESCE(sm.sinistres_payes, 0) as sinistres_payes,
    COALESCE(sm.depenses, 0) as depenses,
    COALESCE(cm.recettes, 0) - COALESCE(sm.depenses, 0) as solde_mensuel
FROM mois_serie ms
LEFT JOIN cotisations_mois cm ON ms.mois = cm.mois
LEFT JOIN sinistres_mois sm ON ms.mois = sm.mois
ORDER BY ms.mois;

-- Fonction pour calculer le taux de participation aux votes
CREATE OR REPLACE FUNCTION calculer_taux_participation_votes()
RETURNS TABLE(
    vote_id INTEGER,
    titre VARCHAR,
    total_eligibles BIGINT,
    total_participants BIGINT,
    taux_participation NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        v.id,
        v.titre,
        (SELECT COUNT(*) FROM membres WHERE statut = 'actif') as total_eligibles,
        COUNT(rv.id) as total_participants,
        ROUND(
            (COUNT(rv.id)::NUMERIC / (SELECT COUNT(*) FROM membres WHERE statut = 'actif')::NUMERIC) * 100, 
            2
        ) as taux_participation
    FROM votes v
    LEFT JOIN reponses_votes rv ON v.id = rv.vote_id
    GROUP BY v.id, v.titre
    ORDER BY v.date_debut DESC;
END;
$$ LANGUAGE plpgsql;

-- Triggers pour l'audit automatique
CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_logs (membre_id, action, table_affectee, enregistrement_id, nouvelles_valeurs)
        VALUES (
            COALESCE(NEW.membre_id, NEW.id), 
            TG_OP || '_' || TG_TABLE_NAME, 
            TG_TABLE_NAME, 
            NEW.id, 
            row_to_json(NEW)
        );
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_logs (membre_id, action, table_affectee, enregistrement_id, anciennes_valeurs, nouvelles_valeurs)
        VALUES (
            COALESCE(NEW.membre_id, OLD.membre_id, NEW.id, OLD.id), 
            TG_OP || '_' || TG_TABLE_NAME, 
            TG_TABLE_NAME, 
            NEW.id, 
            row_to_json(OLD),
            row_to_json(NEW)
        );
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_logs (membre_id, action, table_affectee, enregistrement_id, anciennes_valeurs)
        VALUES (
            COALESCE(OLD.membre_id, OLD.id), 
            TG_OP || '_' || TG_TABLE_NAME, 
            TG_TABLE_NAME, 
            OLD.id, 
            row_to_json(OLD)
        );
        RETURN OLD;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Appliquer l'audit aux tables importantes
DROP TRIGGER IF EXISTS audit_trigger_membres ON membres;
CREATE TRIGGER audit_trigger_membres 
    AFTER INSERT OR UPDATE OR DELETE ON membres 
    FOR EACH ROW EXECUTE FUNCTION audit_trigger();

DROP TRIGGER IF EXISTS audit_trigger_sinistres ON sinistres;
CREATE TRIGGER audit_trigger_sinistres 
    AFTER INSERT OR UPDATE OR DELETE ON sinistres 
    FOR EACH ROW EXECUTE FUNCTION audit_trigger();

DROP TRIGGER IF EXISTS audit_trigger_votes ON votes;
CREATE TRIGGER audit_trigger_votes 
    AFTER INSERT OR UPDATE OR DELETE ON votes 
    FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- Insérer des données de configuration supplémentaires
INSERT INTO configurations (cle, valeur, description, type_valeur) VALUES
('app_version', '2.0.0', 'Version de l''application', 'string'),
('derniere_sauvegarde', '', 'Date de la dernière sauvegarde', 'string'),
('notifications_push_enabled', 'true', 'Activer les notifications push', 'boolean'),
('max_file_size_mb', '10', 'Taille maximale des fichiers en MB', 'number'),
('session_timeout_minutes', '120', 'Durée de session en minutes', 'number'),
('password_min_length', '8', 'Longueur minimale du mot de passe', 'number')
ON CONFLICT (cle) DO NOTHING;

-- Créer des index supplémentaires pour les performances
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_votes_date_fin ON votes(date_fin) WHERE statut = 'ouvert';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reunions_date_statut ON reunions(date_reunion, statut);

-- Mise à jour terminée
INSERT INTO configurations (cle, valeur, description) VALUES 
('advanced_features_installed', 'true', 'Fonctionnalités avancées installées')
ON CONFLICT (cle) DO UPDATE SET valeur = 'true';

COMMIT;