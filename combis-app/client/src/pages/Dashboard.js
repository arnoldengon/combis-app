import React from 'react';
import { useQuery } from 'react-query';
import axios from 'axios';
import { 
  UsersIcon, 
  CreditCardIcon, 
  DocumentTextIcon,
  CurrencyDollarIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';

const Dashboard = () => {
  const { data: dashboardData, isLoading } = useQuery(
    'dashboard',
    () => axios.get('/api/dashboard').then(res => res.data),
    { refetchInterval: 300000 } // Actualiser toutes les 5 minutes
  );

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'XAF',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount).replace('XAF', 'FCFA');
  };

  const StatCard = ({ title, value, icon: Icon, color, subtitle }) => (
    <div className="card">
      <div className="flex items-center">
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
        <div className="ml-4">
          <h3 className="text-sm font-medium text-gray-500">{title}</h3>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
      </div>
    </div>
  );

  const ProgressBar = ({ percentage, color = 'bg-combis-blue' }) => (
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div
        className={`${color} h-2 rounded-full transition-all duration-300`}
        style={{ width: `${Math.min(percentage, 100)}%` }}
      ></div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-combis-blue"></div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Erreur de chargement des données</p>
      </div>
    );
  }

  const { statistiques, evolution_cotisations, membres_en_retard, sinistres_recents } = dashboardData;

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
        <p className="mt-1 text-sm text-gray-500">
          Vue d'ensemble du système d'assistance solidaire - {dashboardData.annee}
        </p>
      </div>

      {/* Statistiques principales */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Membres actifs"
          value={statistiques.membres.membres_actifs}
          icon={UsersIcon}
          color="bg-combis-blue"
          subtitle={`Total: ${statistiques.membres.total_membres}`}
        />
        
        <StatCard
          title="Taux de recouvrement"
          value={`${statistiques.cotisations.taux_recouvrement}%`}
          icon={CreditCardIcon}
          color="bg-combis-green"
          subtitle={`${statistiques.cotisations.cotisations_payees}/${statistiques.cotisations.total_cotisations}`}
        />
        
        <StatCard
          title="Sinistres en attente"
          value={statistiques.sinistres.sinistres_en_attente}
          icon={ExclamationTriangleIcon}
          color="bg-yellow-500"
          subtitle={`Total: ${statistiques.sinistres.total_sinistres}`}
        />
        
        <StatCard
          title="Solde disponible"
          value={formatCurrency(statistiques.financier.solde_actuel)}
          icon={CurrencyDollarIcon}
          color={statistiques.financier.solde_actuel >= 0 ? 'bg-combis-green' : 'bg-red-500'}
        />
      </div>

      {/* Détails financiers */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Situation financière</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Cotisations encaissées</span>
              <span className="font-semibold text-combis-green">
                {formatCurrency(statistiques.financier.montant_encaisse)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Sinistres payés</span>
              <span className="font-semibold text-red-600">
                {formatCurrency(statistiques.financier.montant_paye_sinistres)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">À payer (sinistres)</span>
              <span className="font-semibold text-orange-600">
                {formatCurrency(statistiques.financier.montant_a_payer_sinistres)}
              </span>
            </div>
            <hr />
            <div className="flex justify-between items-center">
              <span className="font-medium">Solde net</span>
              <span className={`font-bold ${statistiques.financier.solde_actuel >= 0 ? 'text-combis-green' : 'text-red-600'}`}>
                {formatCurrency(statistiques.financier.solde_actuel)}
              </span>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-4">État des cotisations</h3>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm">
                <span>Payées ({statistiques.cotisations.cotisations_payees})</span>
                <span>{statistiques.cotisations.taux_recouvrement}%</span>
              </div>
              <ProgressBar percentage={statistiques.cotisations.taux_recouvrement} color="bg-combis-green" />
            </div>
            
            {statistiques.cotisations.cotisations_impayees > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-red-600">
                  Impayées: {statistiques.cotisations.cotisations_impayees}
                </span>
                <span className="text-red-600">
                  {formatCurrency(statistiques.financier.montant_attendu_cotisations)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Évolution mensuelle et alertes */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Évolution des cotisations */}
        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Évolution mensuelle des cotisations</h3>
          <div className="space-y-2">
            {evolution_cotisations.map((mois) => (
              <div key={mois.mois} className="flex items-center justify-between text-sm">
                <span className="w-12">{mois.nom_mois}</span>
                <div className="flex-1 mx-4">
                  <ProgressBar 
                    percentage={mois.total > 0 ? (mois.payes / mois.total) * 100 : 0} 
                    color="bg-combis-blue"
                  />
                </div>
                <span className="text-gray-600">
                  {mois.payes}/{mois.total}
                </span>
                <span className="w-20 text-right font-medium">
                  {formatCurrency(mois.montant_encaisse)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Membres en retard */}
        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Membres en retard de cotisation
            {membres_en_retard.length > 0 && (
              <span className="ml-2 bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full">
                {membres_en_retard.length}
              </span>
            )}
          </h3>
          
          {membres_en_retard.length === 0 ? (
            <div className="flex items-center text-combis-green">
              <CheckCircleIcon className="h-5 w-5 mr-2" />
              <span className="text-sm">Tous les membres sont à jour!</span>
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {membres_en_retard.slice(0, 5).map((membre) => (
                <div key={membre.nom_complet} className="flex justify-between items-center text-sm py-2 border-b border-gray-100 last:border-b-0">
                  <div>
                    <p className="font-medium truncate">{membre.nom_complet}</p>
                    <p className="text-gray-500 text-xs">{membre.telephone_1}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-red-600">{formatCurrency(membre.montant_du)}</p>
                    <p className="text-xs text-gray-500">{membre.nombre_retards} mois</p>
                  </div>
                </div>
              ))}
              {membres_en_retard.length > 5 && (
                <p className="text-xs text-gray-500 text-center pt-2">
                  et {membres_en_retard.length - 5} autres...
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sinistres récents */}
      {sinistres_recents.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Sinistres récents</h3>
          <div className="overflow-hidden">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Membre</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Montant</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sinistres_recents.map((sinistre) => (
                  <tr key={sinistre.id}>
                    <td className="px-3 py-2 text-sm text-gray-900 truncate">{sinistre.nom_complet}</td>
                    <td className="px-3 py-2 text-sm text-gray-500">{sinistre.type_sinistre}</td>
                    <td className="px-3 py-2 text-sm text-gray-900">{formatCurrency(sinistre.montant_demande)}</td>
                    <td className="px-3 py-2 text-sm text-gray-500">{sinistre.date_declaration_formatted}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        sinistre.statut === 'paye' ? 'bg-green-100 text-green-800' :
                        sinistre.statut === 'approuve' ? 'bg-blue-100 text-blue-800' :
                        sinistre.statut === 'en_attente' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {sinistre.statut === 'en_attente' ? 'En attente' :
                         sinistre.statut === 'approuve' ? 'Approuvé' :
                         sinistre.statut === 'paye' ? 'Payé' : 'Rejeté'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;