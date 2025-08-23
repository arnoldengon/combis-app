import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import {
  DocumentTextIcon,
  PlusIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  CurrencyDollarIcon
} from '@heroicons/react/24/outline';

const Sinistres = () => {
  const { user, isTresorier } = useAuth();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    statut: 'all',
    type_sinistre_id: '',
    date_debut: '',
    date_fin: ''
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [showDeclarationModal, setShowDeclarationModal] = useState(false);
  const [showTraitementModal, setShowTraitementModal] = useState(false);
  const [selectedSinistre, setSelectedSinistre] = useState(null);

  const { data: sinistresData, isLoading } = useQuery(
    ['sinistres', currentPage, filters],
    () => axios.get('/api/sinistres', {
      params: {
        page: currentPage,
        limit: 20,
        ...filters
      }
    }).then(res => res.data),
    { keepPreviousData: true }
  );

  const { data: typesSinistres } = useQuery(
    'types-sinistres',
    () => axios.get('/api/sinistres/types').then(res => res.data)
  );

  const { data: statistiques } = useQuery(
    'sinistres-stats',
    () => axios.get('/api/sinistres/stats/resume').then(res => res.data)
  );

  const declarationMutation = useMutation(
    (data) => axios.post('/api/sinistres', data),
    {
      onSuccess: () => {
        toast.success('Sinistre déclaré avec succès');
        queryClient.invalidateQueries('sinistres');
        queryClient.invalidateQueries('sinistres-stats');
        setShowDeclarationModal(false);
      },
      onError: (error) => {
        toast.error(error.response?.data?.message || 'Erreur lors de la déclaration');
      }
    }
  );

  const traitementMutation = useMutation(
    ({ id, data }) => axios.patch(`/api/sinistres/${id}/statut`, data),
    {
      onSuccess: () => {
        toast.success('Sinistre traité avec succès');
        queryClient.invalidateQueries('sinistres');
        queryClient.invalidateQueries('sinistres-stats');
        setShowTraitementModal(false);
        setSelectedSinistre(null);
      },
      onError: (error) => {
        toast.error(error.response?.data?.message || 'Erreur lors du traitement');
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
      case 'paye': return 'bg-green-100 text-green-800';
      case 'approuve': return 'bg-blue-100 text-blue-800';
      case 'en_attente': return 'bg-yellow-100 text-yellow-800';
      case 'rejete': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatutText = (statut) => {
    switch (statut) {
      case 'en_attente': return 'En attente';
      case 'approuve': return 'Approuvé';
      case 'rejete': return 'Rejeté';
      case 'paye': return 'Payé';
      default: return statut;
    }
  };

  const getStatutIcon = (statut) => {
    switch (statut) {
      case 'paye': return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'approuve': return <CheckCircleIcon className="h-5 w-5 text-blue-500" />;
      case 'en_attente': return <ClockIcon className="h-5 w-5 text-yellow-500" />;
      case 'rejete': return <XCircleIcon className="h-5 w-5 text-red-500" />;
      default: return null;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-combis-blue"></div>
      </div>
    );
  }

  const { sinistres = [], pagination = {} } = sinistresData || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestion des sinistres</h1>
          <p className="mt-1 text-sm text-gray-500">
            Déclarations et traitement des sinistres
          </p>
        </div>
        <button
          onClick={() => setShowDeclarationModal(true)}
          className="mt-4 sm:mt-0 btn-primary inline-flex items-center"
        >
          <PlusIcon className="h-5 w-5 mr-2" />
          Déclarer un sinistre
        </button>
      </div>

      {/* Statistiques */}
      {statistiques && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="card">
            <div className="flex items-center">
              <div className="p-3 rounded-lg bg-combis-blue">
                <DocumentTextIcon className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-500">Total sinistres</h3>
                <p className="text-2xl font-bold text-gray-900">{statistiques.statistiques_generales.total_sinistres}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center">
              <div className="p-3 rounded-lg bg-yellow-500">
                <ClockIcon className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-500">En attente</h3>
                <p className="text-2xl font-bold text-yellow-600">{statistiques.statistiques_generales.en_attente}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center">
              <div className="p-3 rounded-lg bg-combis-green">
                <CheckCircleIcon className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-500">Payés</h3>
                <p className="text-2xl font-bold text-combis-green">{statistiques.statistiques_generales.payes}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center">
              <div className="p-3 rounded-lg bg-orange-500">
                <CurrencyDollarIcon className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-500">Total payé</h3>
                <p className="text-lg font-bold text-gray-900">{formatCurrency(statistiques.statistiques_generales.montant_paye)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filtres */}
      <div className="card">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <label className="label">Statut</label>
            <select
              value={filters.statut}
              onChange={(e) => setFilters({...filters, statut: e.target.value})}
              className="input-field"
            >
              <option value="all">Tous les statuts</option>
              <option value="en_attente">En attente</option>
              <option value="approuve">Approuvé</option>
              <option value="rejete">Rejeté</option>
              <option value="paye">Payé</option>
            </select>
          </div>

          <div>
            <label className="label">Type de sinistre</label>
            <select
              value={filters.type_sinistre_id}
              onChange={(e) => setFilters({...filters, type_sinistre_id: e.target.value})}
              className="input-field"
            >
              <option value="">Tous les types</option>
              {typesSinistres?.map(type => (
                <option key={type.id} value={type.id}>{type.nom}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Date début</label>
            <input
              type="date"
              value={filters.date_debut}
              onChange={(e) => setFilters({...filters, date_debut: e.target.value})}
              className="input-field"
            />
          </div>

          <div>
            <label className="label">Date fin</label>
            <input
              type="date"
              value={filters.date_fin}
              onChange={(e) => setFilters({...filters, date_fin: e.target.value})}
              className="input-field"
            />
          </div>
        </div>
      </div>

      {/* Liste des sinistres */}
      <div className="card">
        {sinistres.length === 0 ? (
          <div className="text-center py-12">
            <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Aucun sinistre trouvé</h3>
            <p className="mt-1 text-sm text-gray-500">
              Commencez par déclarer votre premier sinistre.
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
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Montant
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date sinistre
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Statut
                  </th>
                  {isTresorier() && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sinistres.map((sinistre) => (
                  <tr key={sinistre.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {sinistre.nom_complet}
                      </div>
                      <div className="text-sm text-gray-500">
                        {sinistre.telephone_1}
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{sinistre.type_sinistre_nom}</div>
                      <div className="text-xs text-gray-500">
                        Couverture: {formatCurrency(sinistre.montant_couverture)}
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 max-w-xs truncate" title={sinistre.description}>
                        {sinistre.description}
                      </div>
                      <div className="text-xs text-gray-500">
                        Déclaré le {sinistre.date_declaration_formatted}
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {formatCurrency(sinistre.montant_demande)}
                      </div>
                      {sinistre.montant_approuve && sinistre.montant_approuve !== sinistre.montant_demande && (
                        <div className="text-xs text-green-600">
                          Approuvé: {formatCurrency(sinistre.montant_approuve)}
                        </div>
                      )}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {sinistre.date_sinistre_formatted}
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {getStatutIcon(sinistre.statut)}
                        <span className={`ml-2 inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatutColor(sinistre.statut)}`}>
                          {getStatutText(sinistre.statut)}
                        </span>
                      </div>
                      {sinistre.necessite_validation && sinistre.statut === 'en_attente' && (
                        <div className="text-xs text-orange-600 mt-1">
                          <ExclamationTriangleIcon className="h-3 w-3 inline mr-1" />
                          Validation requise
                        </div>
                      )}
                    </td>

                    {isTresorier() && (
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {sinistre.statut === 'en_attente' && (
                          <button
                            onClick={() => {
                              setSelectedSinistre(sinistre);
                              setShowTraitementModal(true);
                            }}
                            className="text-combis-blue hover:text-blue-700"
                          >
                            Traiter
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

      {/* Modal déclaration */}
      {showDeclarationModal && (
        <DeclarationModal
          typesSinistres={typesSinistres || []}
          onClose={() => setShowDeclarationModal(false)}
          onSubmit={(data) => declarationMutation.mutate(data)}
          loading={declarationMutation.isLoading}
        />
      )}

      {/* Modal traitement */}
      {showTraitementModal && selectedSinistre && (
        <TraitementModal
          sinistre={selectedSinistre}
          onClose={() => {
            setShowTraitementModal(false);
            setSelectedSinistre(null);
          }}
          onSubmit={(data) => traitementMutation.mutate({ id: selectedSinistre.id, data })}
          loading={traitementMutation.isLoading}
        />
      )}
    </div>
  );
};

// Modal de déclaration
const DeclarationModal = ({ typesSinistres, onClose, onSubmit, loading }) => {
  const [formData, setFormData] = useState({
    type_sinistre_id: '',
    date_sinistre: '',
    description: '',
    montant_demande: ''
  });

  const selectedType = typesSinistres.find(t => t.id == formData.type_sinistre_id);

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {
      ...formData,
      type_sinistre_id: parseInt(formData.type_sinistre_id),
      montant_demande: formData.montant_demande ? parseInt(formData.montant_demande) : undefined
    };
    onSubmit(data);
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <h3 className="text-lg font-medium text-gray-900 text-center mb-4">
            Déclarer un sinistre
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Type de sinistre *</label>
              <select
                value={formData.type_sinistre_id}
                onChange={(e) => setFormData({...formData, type_sinistre_id: e.target.value})}
                className="input-field"
                required
              >
                <option value="">Sélectionnez un type</option>
                {typesSinistres.map(type => (
                  <option key={type.id} value={type.id}>
                    {type.nom} ({new Intl.NumberFormat('fr-FR').format(type.montant_couverture)} FCFA)
                  </option>
                ))}
              </select>
            </div>

            {selectedType && (
              <div className="p-3 bg-blue-50 rounded-md">
                <p className="text-sm text-blue-800">
                  <strong>Couverture:</strong> {new Intl.NumberFormat('fr-FR').format(selectedType.montant_couverture)} FCFA
                  {selectedType.necessite_validation && (
                    <span className="block text-orange-600 mt-1">
                      ⚠️ Ce type de sinistre nécessite une validation manuelle
                    </span>
                  )}
                </p>
              </div>
            )}

            <div>
              <label className="label">Date du sinistre *</label>
              <input
                type="date"
                value={formData.date_sinistre}
                onChange={(e) => setFormData({...formData, date_sinistre: e.target.value})}
                className="input-field"
                required
                max={new Date().toISOString().split('T')[0]}
              />
            </div>

            <div>
              <label className="label">Description détaillée *</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                className="input-field"
                rows={4}
                placeholder="Décrivez les circonstances du sinistre..."
                required
              />
            </div>

            <div>
              <label className="label">Montant demandé (optionnel)</label>
              <input
                type="number"
                value={formData.montant_demande}
                onChange={(e) => setFormData({...formData, montant_demande: e.target.value})}
                className="input-field"
                placeholder="Laisser vide pour le montant standard"
              />
              <p className="text-xs text-gray-500 mt-1">
                Si vide, le montant de couverture standard sera appliqué
              </p>
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
                {loading ? 'Déclaration...' : 'Déclarer'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// Modal de traitement
const TraitementModal = ({ sinistre, onClose, onSubmit, loading }) => {
  const [formData, setFormData] = useState({
    statut: 'approuve',
    montant_approuve: sinistre.montant_demande,
    motif_rejet: '',
    remarques: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {
      statut: formData.statut,
      ...(formData.statut === 'approuve' && { montant_approuve: parseInt(formData.montant_approuve) }),
      ...(formData.statut === 'rejete' && { motif_rejet: formData.motif_rejet }),
      remarques: formData.remarques || undefined
    };
    onSubmit(data);
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <h3 className="text-lg font-medium text-gray-900 text-center mb-4">
            Traiter le sinistre
          </h3>
          
          <div className="mb-4 p-3 bg-gray-50 rounded">
            <p className="text-sm text-gray-600">
              <strong>{sinistre.nom_complet}</strong><br />
              {sinistre.type_sinistre_nom}<br />
              Montant demandé: <strong>{new Intl.NumberFormat('fr-FR').format(sinistre.montant_demande)} FCFA</strong>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Décision *</label>
              <select
                value={formData.statut}
                onChange={(e) => setFormData({...formData, statut: e.target.value})}
                className="input-field"
                required
              >
                <option value="approuve">Approuver</option>
                <option value="rejete">Rejeter</option>
              </select>
            </div>

            {formData.statut === 'approuve' && (
              <div>
                <label className="label">Montant approuvé *</label>
                <input
                  type="number"
                  value={formData.montant_approuve}
                  onChange={(e) => setFormData({...formData, montant_approuve: e.target.value})}
                  className="input-field"
                  required
                  min="0"
                />
              </div>
            )}

            {formData.statut === 'rejete' && (
              <div>
                <label className="label">Motif de rejet *</label>
                <textarea
                  value={formData.motif_rejet}
                  onChange={(e) => setFormData({...formData, motif_rejet: e.target.value})}
                  className="input-field"
                  rows={3}
                  placeholder="Expliquez les raisons du rejet..."
                  required
                />
              </div>
            )}

            <div>
              <label className="label">Remarques (optionnel)</label>
              <textarea
                value={formData.remarques}
                onChange={(e) => setFormData({...formData, remarques: e.target.value})}
                className="input-field"
                rows={2}
                placeholder="Commentaires supplémentaires..."
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
                className={`px-4 py-2 rounded-md font-medium ${
                  formData.statut === 'approuve' 
                    ? 'bg-combis-green text-white hover:bg-green-700' 
                    : 'bg-red-600 text-white hover:bg-red-700'
                } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {loading ? 'Traitement...' : (formData.statut === 'approuve' ? 'Approuver' : 'Rejeter')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Sinistres;