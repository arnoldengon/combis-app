import React, { useState } from 'react';
import { useQuery } from 'react-query';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  UserIcon,
  PhoneIcon,
  EnvelopeIcon,
  BriefcaseIcon,
  CreditCardIcon
} from '@heroicons/react/24/outline';

const Membres = () => {
  const { isAdmin } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  const { data: membresData, isLoading } = useQuery(
    ['membres', currentPage, searchTerm, statusFilter],
    () => axios.get('/api/membres', {
      params: {
        page: currentPage,
        limit: 20,
        search: searchTerm,
        statut: statusFilter
      }
    }).then(res => res.data),
    { keepPreviousData: true }
  );

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount) + ' FCFA';
  };

  const getStatusColor = (statut) => {
    switch (statut) {
      case 'actif': return 'bg-green-100 text-green-800';
      case 'inactif': return 'bg-gray-100 text-gray-800';
      case 'suspendu': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getCotisationStatus = (totalPaye, totalImpaye) => {
    if (totalImpaye === 0) return { text: 'À jour', color: 'text-green-600' };
    if (totalPaye === 0) return { text: 'Aucun paiement', color: 'text-red-600' };
    return { text: 'En retard', color: 'text-orange-600' };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-combis-blue"></div>
      </div>
    );
  }

  const { membres = [], pagination = {} } = membresData || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestion des membres</h1>
          <p className="mt-1 text-sm text-gray-500">
            {pagination.total} membre(s) au total
          </p>
        </div>
        {isAdmin() && (
          <button className="mt-4 sm:mt-0 btn-primary inline-flex items-center">
            <PlusIcon className="h-5 w-5 mr-2" />
            Ajouter un membre
          </button>
        )}
      </div>

      {/* Filtres */}
      <div className="card">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Rechercher</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Nom, téléphone, profession..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field pl-10"
              />
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            </div>
          </div>

          <div>
            <label className="label">Statut</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input-field"
            >
              <option value="all">Tous les statuts</option>
              <option value="actif">Actif</option>
              <option value="inactif">Inactif</option>
              <option value="suspendu">Suspendu</option>
            </select>
          </div>

          <div className="flex items-end">
            <button 
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
                setCurrentPage(1);
              }}
              className="btn-secondary w-full sm:w-auto"
            >
              Réinitialiser
            </button>
          </div>
        </div>
      </div>

      {/* Liste des membres */}
      <div className="card">
        {membres.length === 0 ? (
          <div className="text-center py-12">
            <UserIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Aucun membre trouvé</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm || statusFilter !== 'all' 
                ? 'Essayez de modifier vos critères de recherche.'
                : 'Commencez par ajouter un nouveau membre.'
              }
            </p>
          </div>
        ) : (
          <div className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Membre
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Profession
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Cotisation
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      État cotisations
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Statut
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {membres.map((membre) => {
                    const cotisationStatus = getCotisationStatus(membre.total_paye, membre.total_impaye);
                    return (
                      <tr key={membre.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10">
                              <div className="h-10 w-10 rounded-full bg-combis-blue flex items-center justify-center">
                                <span className="text-sm font-medium text-white">
                                  {membre.nom_complet.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                </span>
                              </div>
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">
                                {membre.nom_complet}
                              </div>
                              <div className="text-sm text-gray-500">
                                Inscrit le {membre.date_inscription}
                              </div>
                            </div>
                          </div>
                        </td>
                        
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            <div className="flex items-center">
                              <PhoneIcon className="h-4 w-4 mr-1 text-gray-400" />
                              {membre.telephone_1}
                            </div>
                            {membre.telephone_2 && (
                              <div className="flex items-center mt-1">
                                <PhoneIcon className="h-4 w-4 mr-1 text-gray-400" />
                                {membre.telephone_2}
                              </div>
                            )}
                            {membre.email && (
                              <div className="flex items-center mt-1">
                                <EnvelopeIcon className="h-4 w-4 mr-1 text-gray-400" />
                                <span className="text-xs">{membre.email}</span>
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center text-sm text-gray-900">
                            <BriefcaseIcon className="h-4 w-4 mr-1 text-gray-400" />
                            <span className="truncate max-w-xs" title={membre.profession}>
                              {membre.profession || 'Non renseigné'}
                            </span>
                          </div>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            <div className="flex items-center">
                              <CreditCardIcon className="h-4 w-4 mr-1 text-gray-400" />
                              {formatCurrency(membre.cotisation_annuelle)}/an
                            </div>
                            <div className="text-xs text-gray-500">
                              {formatCurrency(membre.cotisation_mensuelle)}/mois
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className={`text-sm font-medium ${cotisationStatus.color}`}>
                            {cotisationStatus.text}
                          </div>
                          <div className="text-xs text-gray-500">
                            Payé: {formatCurrency(membre.total_paye)}
                            {membre.total_impaye > 0 && (
                              <div className="text-red-500">
                                Dû: {formatCurrency(membre.total_impaye)}
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(membre.statut)}`}>
                            {membre.statut}
                          </span>
                          {membre.roles && membre.roles.length > 0 && (
                            <div className="mt-1">
                              {membre.roles.map(role => (
                                <span key={role} className="inline-flex px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 mr-1">
                                  {role}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                <div className="flex-1 flex justify-between sm:hidden">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    Précédent
                  </button>
                  <button
                    onClick={() => setCurrentPage(Math.min(pagination.pages, currentPage + 1))}
                    disabled={currentPage === pagination.pages}
                    className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    Suivant
                  </button>
                </div>

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
                      
                      {[...Array(Math.min(5, pagination.pages))].map((_, i) => {
                        const page = i + 1;
                        return (
                          <button
                            key={page}
                            onClick={() => setCurrentPage(page)}
                            className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                              currentPage === page
                                ? 'z-10 bg-combis-blue border-combis-blue text-white'
                                : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                            }`}
                          >
                            {page}
                          </button>
                        );
                      })}
                      
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
    </div>
  );
};

export default Membres;