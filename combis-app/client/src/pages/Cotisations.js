import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import {
  CreditCardIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ClockIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline';

const Cotisations = () => {
  const { isTresorier } = useAuth();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    annee: new Date().getFullYear(),
    mois: '',
    statut: 'all',
    search: ''
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCotisation, setSelectedCotisation] = useState(null);
  const [paymentModal, setPaymentModal] = useState(false);

  const { data: cotisationsData, isLoading } = useQuery(
    ['cotisations', currentPage, filters],
    () => axios.get('/api/cotisations', {
      params: {
        page: currentPage,
        limit: 20,
        ...filters
      }
    }).then(res => res.data),
    { keepPreviousData: true }
  );

  const { data: resumeData } = useQuery(
    ['cotisations-resume', filters.annee],
    () => axios.get(`/api/cotisations/resume/${filters.annee}`).then(res => res.data)
  );

  const paymentMutation = useMutation(
    ({ id, paymentData }) => axios.post(`/api/cotisations/${id}/paiement`, paymentData),
    {
      onSuccess: () => {
        toast.success('Paiement enregistré avec succès');
        queryClient.invalidateQueries('cotisations');
        queryClient.invalidateQueries('cotisations-resume');
        setPaymentModal(false);
        setSelectedCotisation(null);
      },
      onError: (error) => {
        toast.error(error.response?.data?.message || 'Erreur lors de l\'enregistrement');
      }
    }
  );

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount) + ' FCFA';
  };

  const getStatutColor = (statut) => {
    switch (statut) {
      case 'payee': return 'bg-green-100 text-green-800';
      case 'en_retard': return 'bg-red-100 text-red-800';
      case 'impayee': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatutText = (statut) => {
    switch (statut) {
      case 'payee': return 'Payée';
      case 'en_retard': return 'En retard';
      case 'impayee': return 'Impayée';
      default: return statut;
    }
  };

  const getStatutIcon = (statut) => {
    switch (statut) {
      case 'payee': return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'en_retard': return <ExclamationCircleIcon className="h-5 w-5 text-red-500" />;
      case 'impayee': return <ClockIcon className="h-5 w-5 text-yellow-500" />;
      default: return null;
    }
  };

  const handlePayment = (data) => {
    paymentMutation.mutate({
      id: selectedCotisation.id,
      paymentData: data
    });
  };

  const months = [
    { value: '', label: 'Tous les mois' },
    { value: 1, label: 'Janvier' },
    { value: 2, label: 'Février' },
    { value: 3, label: 'Mars' },
    { value: 4, label: 'Avril' },
    { value: 5, label: 'Mai' },
    { value: 6, label: 'Juin' },
    { value: 7, label: 'Juillet' },
    { value: 8, label: 'Août' },
    { value: 9, label: 'Septembre' },
    { value: 10, label: 'Octobre' },
    { value: 11, label: 'Novembre' },
    { value: 12, label: 'Décembre' }
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-combis-blue"></div>
      </div>
    );
  }

  const { cotisations = [], pagination = {} } = cotisationsData || {};
  const { resume, par_mois = [] } = resumeData || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestion des cotisations</h1>
          <p className="mt-1 text-sm text-gray-500">
            Suivi des paiements mensuels - {filters.annee}
          </p>
        </div>
      </div>

      {/* Résumé */}
      {resume && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="card">
            <div className="flex items-center">
              <div className="p-3 rounded-lg bg-combis-blue">
                <CreditCardIcon className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-500">Total cotisations</h3>
                <p className="text-2xl font-bold text-gray-900">{resume.total_cotisations}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center">
              <div className="p-3 rounded-lg bg-combis-green">
                <CheckCircleIcon className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-500">Payées</h3>
                <p className="text-2xl font-bold text-combis-green">{resume.cotisations_payees}</p>
                <p className="text-sm text-gray-500">{formatCurrency(resume.montant_encaisse)}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center">
              <div className="p-3 rounded-lg bg-yellow-500">
                <ClockIcon className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-500">Impayées</h3>
                <p className="text-2xl font-bold text-yellow-600">{resume.cotisations_impayees}</p>
                <p className="text-sm text-gray-500">{formatCurrency(resume.montant_attendu)}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center">
              <div className="p-3 rounded-lg bg-red-500">
                <ExclamationCircleIcon className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-500">En retard</h3>
                <p className="text-2xl font-bold text-red-600">{resume.cotisations_en_retard}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Évolution mensuelle */}
      {par_mois.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Évolution mensuelle</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {par_mois.map((mois) => (
              <div key={mois.mois} className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium text-gray-900">{mois.nom_mois.trim()}</p>
                <p className="text-xs text-gray-500">{mois.payes}/{mois.total}</p>
                <p className="text-sm font-semibold text-combis-blue">
                  {formatCurrency(mois.montant_encaisse)}
                </p>
                <div className="mt-2 w-full bg-gray-200 rounded-full h-1">
                  <div
                    className="bg-combis-blue h-1 rounded-full"
                    style={{ width: `${mois.total > 0 ? (mois.payes / mois.total) * 100 : 0}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtres */}
      <div className="card">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
          <div>
            <label className="label">Année</label>
            <select
              value={filters.annee}
              onChange={(e) => setFilters({...filters, annee: e.target.value})}
              className="input-field"
            >
              <option value={2024}>2024</option>
              <option value={2023}>2023</option>
              <option value={2025}>2025</option>
            </select>
          </div>

          <div>
            <label className="label">Mois</label>
            <select
              value={filters.mois}
              onChange={(e) => setFilters({...filters, mois: e.target.value})}
              className="input-field"
            >
              {months.map(month => (
                <option key={month.value} value={month.value}>{month.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Statut</label>
            <select
              value={filters.statut}
              onChange={(e) => setFilters({...filters, statut: e.target.value})}
              className="input-field"
            >
              <option value="all">Tous</option>
              <option value="payee">Payées</option>
              <option value="impayee">Impayées</option>
              <option value="en_retard">En retard</option>
            </select>
          </div>

          <div>
            <label className="label">Rechercher</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Nom du membre..."
                value={filters.search}
                onChange={(e) => setFilters({...filters, search: e.target.value})}
                className="input-field pl-10"
              />
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            </div>
          </div>

          <div className="flex items-end">
            <button 
              onClick={() => setFilters({
                annee: new Date().getFullYear(),
                mois: '',
                statut: 'all',
                search: ''
              })}
              className="btn-secondary w-full"
            >
              Réinitialiser
            </button>
          </div>
        </div>
      </div>

      {/* Liste des cotisations */}
      <div className="card">
        {cotisations.length === 0 ? (
          <div className="text-center py-12">
            <CreditCardIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Aucune cotisation trouvée</h3>
            <p className="mt-1 text-sm text-gray-500">
              Aucune cotisation ne correspond à vos critères de recherche.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Membre
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Période
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Montant
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Échéance
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Statut
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Paiement
                  </th>
                  {isTresorier() && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {cotisations.map((cotisation) => (
                  <tr key={cotisation.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {cotisation.nom_complet}
                      </div>
                      <div className="text-sm text-gray-500">
                        {cotisation.telephone_1}
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {months.find(m => m.value === cotisation.mois)?.label} {cotisation.annee}
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {formatCurrency(cotisation.montant_mensuel)}
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {cotisation.date_echeance_formatted}
                      </div>
                      {cotisation.jours_retard > 0 && (
                        <div className="text-xs text-red-500">
                          {cotisation.jours_retard} jour(s) de retard
                        </div>
                      )}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {getStatutIcon(cotisation.statut_reel)}
                        <span className={`ml-2 inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatutColor(cotisation.statut_reel)}`}>
                          {getStatutText(cotisation.statut_reel)}
                        </span>
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      {cotisation.statut === 'payee' ? (
                        <div className="text-sm text-gray-900">
                          <div>{cotisation.date_paiement_formatted}</div>
                          <div className="text-xs text-gray-500 capitalize">
                            {cotisation.mode_paiement?.replace('_', ' ')}
                          </div>
                          {cotisation.reference_paiement && (
                            <div className="text-xs text-gray-500">
                              {cotisation.reference_paiement}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-500">—</span>
                      )}
                    </td>

                    {isTresorier() && (
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {cotisation.statut !== 'payee' && (
                          <button
                            onClick={() => {
                              setSelectedCotisation(cotisation);
                              setPaymentModal(true);
                            }}
                            className="text-combis-blue hover:text-blue-700"
                          >
                            Enregistrer paiement
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-gray-700">
                      Affichage de <span className="font-medium">{((currentPage - 1) * pagination.limit) + 1}</span> à{' '}
                      <span className="font-medium">
                        {Math.min(currentPage * pagination.limit, pagination.total)}
                      </span> sur <span className="font-medium">{pagination.total}</span> résultats
                    </p>
                  </div>
                  
                  <div>
                    <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                      <button
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Précédent
                      </button>
                      
                      <button
                        onClick={() => setCurrentPage(Math.min(pagination.pages, currentPage + 1))}
                        disabled={currentPage === pagination.pages}
                        className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Suivant
                      </button>
                    </nav>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de paiement */}
      {paymentModal && selectedCotisation && (
        <PaymentModal
          cotisation={selectedCotisation}
          onClose={() => {
            setPaymentModal(false);
            setSelectedCotisation(null);
          }}
          onSubmit={handlePayment}
          loading={paymentMutation.isLoading}
        />
      )}
    </div>
  );
};

// Modal de paiement
const PaymentModal = ({ cotisation, onClose, onSubmit, loading }) => {
  const [formData, setFormData] = useState({
    mode_paiement: 'mobile_money',
    reference_paiement: '',
    date_paiement: new Date().toISOString().split('T')[0]
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <h3 className="text-lg font-medium text-gray-900 text-center mb-4">
            Enregistrer le paiement
          </h3>
          
          <div className="mb-4 p-3 bg-gray-50 rounded">
            <p className="text-sm text-gray-600">
              <strong>{cotisation.nom_complet}</strong><br />
              {months.find(m => m.value === cotisation.mois)?.label} {cotisation.annee}<br />
              Montant: <strong>{new Intl.NumberFormat('fr-FR').format(cotisation.montant_mensuel)} FCFA</strong>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Mode de paiement</label>
              <select
                value={formData.mode_paiement}
                onChange={(e) => setFormData({...formData, mode_paiement: e.target.value})}
                className="input-field"
                required
              >
                <option value="mobile_money">Mobile Money</option>
                <option value="especes">Espèces</option>
                <option value="virement">Virement</option>
              </select>
            </div>

            <div>
              <label className="label">Référence de paiement</label>
              <input
                type="text"
                value={formData.reference_paiement}
                onChange={(e) => setFormData({...formData, reference_paiement: e.target.value})}
                className="input-field"
                placeholder="Numéro de transaction, reçu..."
              />
            </div>

            <div>
              <label className="label">Date de paiement</label>
              <input
                type="date"
                value={formData.date_paiement}
                onChange={(e) => setFormData({...formData, date_paiement: e.target.value})}
                className="input-field"
                required
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={loading}
                className="btn-primary"
              >
                {loading ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// Mois pour référence
const months = [
  { value: '', label: 'Tous les mois' },
  { value: 1, label: 'Janvier' },
  { value: 2, label: 'Février' },
  { value: 3, label: 'Mars' },
  { value: 4, label: 'Avril' },
  { value: 5, label: 'Mai' },
  { value: 6, label: 'Juin' },
  { value: 7, label: 'Juillet' },
  { value: 8, label: 'Août' },
  { value: 9, label: 'Septembre' },
  { value: 10, label: 'Octobre' },
  { value: 11, label: 'Novembre' },
  { value: 12, label: 'Décembre' }
];

export default Cotisations;