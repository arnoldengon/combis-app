-- Script d'initialisation avec les données des membres existants

-- Insertion des membres existants
INSERT INTO membres (nom, prenom, nom_complet, date_naissance, telephone_1, telephone_2, email, profession, cotisation_annuelle) VALUES
('NDJOCKI NDJOCKI', 'Anthony', 'NDJOCKI NDJOCKI Anthony', '1992-06-02', '674448847', '655994427', NULL, 'Ingénieur en Sciences Environnementales – Consultant en sauvegardes environnementales et sociales', 120000),
('Monguellet Ango', 'Jacques Charly', 'Jacques Charly Monguellet Ango', '1990-08-15', '690335868', '671124446', NULL, 'Enseignant vacataire de français', 12000),
('NNENGUE BESSELE', 'Marcel Landry', 'NNENGUE BESSELE Marcel Landry', '1992-03-04', '672305423', '696026634', NULL, 'Ingénieur en Sciences Environnementales', 12000),
('EFOUA', 'Vicky Landry', 'EFOUA Vicky Landry', '1994-04-10', '652970852', '691881281', NULL, 'Licenciate à l''EPC', 20000),
('TCHOUANDEM', 'Ariane Radine', 'TCHOUANDEM Ariane Radine', '1992-05-30', '694405795', '678359081', NULL, 'Comptable', 24000),
('BENGONO NLOZE', 'Myriam Laken', 'BENGONO NLOZE Myriam Laken', '1993-05-16', '690350701', '683038443', NULL, 'Enseignante en agriculture', 20000),
('ASSEMBE MBONGUE', 'Régine Eve Sandra L.', 'ASSEMBE MBONGUE Régine Eve Sandra L.', '1993-08-25', '696593369', NULL, NULL, 'Professeure de lycée – Traductrice principale', 20000),
('ESSEBA', 'Abel Brice', 'ESSEBA Abel Brice', '1992-08-05', '678727243', NULL, NULL, 'Avocat', 24000),
('Nkongo Ela', 'Arnauld Papy', 'Nkongo Ela Arnauld Papy', '1994-04-23', '695011380', NULL, NULL, 'Contrôleur qualité - certificateur / correspondant transport/ géographe urbaniste/ consultant en gestion des ressources humaines', 18000),
('Emvana Emvana', 'Martial', 'Emvana Emvana Martial', '1992-07-05', '655964657', '682083871', NULL, 'Prof d''Enieg', 15000),
('Ngah Ngaba', 'Henriette', 'Ngah Ngaba Henriette', '1992-07-05', '690892469', '650383355', NULL, 'Esthéticienne professionnelle', 20000),
('DIBAM LEVO', 'Emile Arnaud', 'DIBAM LEVO Emile Arnaud', '1993-01-25', '694111028', NULL, NULL, 'Ing Télécom', 12000),
('Bitom', 'Axel', 'Bitom Axel', '1994-05-30', '655629264', NULL, NULL, 'Enseignant', 12000),
('Nna Mvondo', 'Christian', 'Nna Mvondo Christian', '1992-05-28', '691950737', NULL, 'nnachristian78@gmail.com', 'Enseignant/Géographe', 18000),
('ENGON', 'Étienne Arnold', 'ENGON Étienne Arnold', '1994-08-03', NULL, NULL, 'arnoldengon@gmail.com', 'Enseignant', 120000);

-- Attribuer le rôle admin au premier membre et le rôle membre aux autres
INSERT INTO membre_roles (membre_id, role_id) VALUES
(1, 1), -- Anthony comme admin
(1, 2), -- Anthony aussi trésorier
(2, 3), (3, 3), (4, 3), (5, 3), (6, 3), (7, 3), (8, 3), (9, 3), (10, 3), (11, 3), (12, 3), (13, 3), (14, 3), (15, 3); -- Tous les autres comme membres

-- Générer les cotisations pour l'année en cours (2024)
-- Pour chaque membre, créer 12 cotisations mensuelles
DO $$
DECLARE
    membre_record RECORD;
    mois INTEGER;
    cotisation_mensuelle INTEGER;
BEGIN
    FOR membre_record IN SELECT id, cotisation_annuelle FROM membres LOOP
        cotisation_mensuelle := membre_record.cotisation_annuelle / 12;
        
        FOR mois IN 1..12 LOOP
            INSERT INTO cotisations (
                membre_id, 
                annee, 
                mois, 
                montant_mensuel, 
                date_echeance,
                statut
            ) VALUES (
                membre_record.id,
                2024,
                mois,
                cotisation_mensuelle,
                MAKE_DATE(2024, mois, 12),
                CASE 
                    WHEN mois <= 8 THEN 'payee'  -- Marquer les 8 premiers mois comme payés
                    ELSE 'impayee'
                END
            );
            
            -- Ajouter une date de paiement pour les cotisations payées
            IF mois <= 8 THEN
                UPDATE cotisations 
                SET date_paiement = MAKE_DATE(2024, mois, CASE WHEN mois <= 8 THEN 10 ELSE NULL END),
                    mode_paiement = 'mobile_money',
                    reference_paiement = 'REF' || membre_record.id || LPAD(mois::text, 2, '0') || '2024'
                WHERE membre_id = membre_record.id AND annee = 2024 AND mois = mois;
            END IF;
        END LOOP;
    END LOOP;
END $$;

-- Ajouter quelques sinistres d'exemple
INSERT INTO sinistres (membre_id, type_sinistre_id, date_sinistre, date_declaration, description, montant_demande, montant_approuve, statut, date_approbation, approuve_par) VALUES
(5, 5, '2024-06-15', '2024-06-16', 'Mariage de TCHOUANDEM Ariane Radine', 50000, 50000, 'paye', '2024-06-17', 1),
(8, 6, '2024-07-20', '2024-07-22', 'Naissance du premier enfant', 30000, 30000, 'approuve', '2024-07-23', 1),
(3, 3, '2024-08-10', '2024-08-12', 'Opération chirurgicale - appendicite', 75000, 75000, 'en_attente', NULL, NULL);

-- Ajouter les paiements pour les sinistres payés
INSERT INTO paiements_sinistres (sinistre_id, montant, date_paiement, mode_paiement, reference_paiement, effectue_par) VALUES
(1, 50000, '2024-06-20', 'virement', 'PAY001-2024', 1),
(2, 30000, '2024-07-25', 'mobile_money', 'PAY002-2024', 1);

COMMIT;