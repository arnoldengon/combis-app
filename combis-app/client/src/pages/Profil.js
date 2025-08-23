import React, { useState } from 'react';
import { useQuery, useMutation } from 'react-query';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import {
  UserIcon,
  PhoneIcon,
  EnvelopeIcon,
  BriefcaseIcon,
  CreditCardIcon,
  DocumentTextIcon,
  KeyIcon,
  CalendarIcon
} from '@heroicons/react/24/outline';

const Profil = () => {
  const { user, changePassword } = useAuth();
  const [activeTab, setActiveTab] = useState('informations');
  const [showPasswordChange, setShowPasswordChange] = useState(false);

  const { data: profilData, isLoading } = useQuery(
    ['profil', user?.id],
    () => axios.get(`/api/membres/${user.id}`).then(res => res.data),
    { enabled: !!user?.id }
  );

  const { data: statutCotisation } = useQuery(
    ['statut-cotisation', user?.id],
    () => axios.get(`/api/membres/${user.id}/statut-cotisation`).then(res => res.data),
    { enabled: !!user?.id }
  );

  const { data: mesSinistres } = useQuery(
    ['mes-sinistres', user?.id],
    () => axios.get('/api/sinistres', { 
      params: { membre_id: user.id, limit: 10 }
    }).then(res => res.data),
    { enabled: !!user?.id }
  );

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount) + ' FCFA';
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('fr-FR');
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-combis-blue"></div>
      </div>
    );
  }

  const tabs = [
    { id: 'informations', name: 'Mes informations', icon: UserIcon },
    { id: 'cotisations', name: 'Mes cotisations', icon: CreditCardIcon },
    { id: 'sinistres', name: 'Mes sinistres', icon: DocumentTextIcon },
    { id: 'securite', name: 'Sécurité', icon: KeyIcon }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mon profil</h1>
          <p className="mt-1 text-sm text-gray-500">
            Gérez vos informations personnelles et votre compte
          </p>
        </div>
      </div>

      {/* Navigation par onglets */}
      <div className="card">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-combis-blue text-combis-blue'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <tab.icon className="h-5 w-5 mr-2" />
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-6">
          {activeTab === 'informations' && (
            <InformationsTab profil={profilData} />
          )}
          {activeTab === 'cotisations' && (
            <CotisationsTab statut={statutCotisation} />
          )}
          {activeTab === 'sinistres' && (
            <SinistresTab sinistres={mesSinistres?.sinistres || []} />
          )}
          {activeTab === 'securite' && (
            <SecuriteTab />
          )}
        </div>
      </div>
    </div>
  );
};

// Onglet Informations
const InformationsTab = ({ profil }) => {
  if (!profil) return <div>Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <div className="h-16 w-16 bg-combis-blue rounded-full flex items-center justify-center">
                <span className="text-xl font-bold text-white">
                  {profil.nom_complet.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </span>
              </div>
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900">{profil.nom_complet}</h3>
              <p className="text-sm text-gray-500">Membre depuis le {formatDate(profil.date_inscription)}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center space-x-3 text-sm">
              <CalendarIcon className="h-5 w-5 text-gray-400" />
              <span className="text-gray-600">Né(e) le:</span>
              <span className="font-medium">{formatDate(profil.date_naissance)}</span>
            </div>

            <div className="flex items-center space-x-3 text-sm">
              <PhoneIcon className="h-5 w-5 text-gray-400" />
              <span className="text-gray-600">Téléphone principal:</span>
              <span className="font-medium">{profil.telephone_1}</span>
            </div>

            {profil.telephone_2 && (
              <div className="flex items-center space-x-3 text-sm">
                <PhoneIcon className="h-5 w-5 text-gray-400" />
                <span className="text-gray-600">Téléphone secondaire:</span>
                <span className="font-medium">{profil.telephone_2}</span>
              </div>
            )}

            {profil.email && (
              <div className="flex items-center space-x-3 text-sm">
                <EnvelopeIcon className="h-5 w-5 text-gray-400" />
                <span className="text-gray-600">Email:</span>
                <span className="font-medium">{profil.email}</span>
              </div>
            )}

            <div className="flex items-center space-x-3 text-sm">
              <BriefcaseIcon className="h-5 w-5 text-gray-400" />
              <span className="text-gray-600">Profession:</span>
              <span className="font-medium">{profil.profession || 'Non renseigné'}</span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="font-medium text-gray-900">Cotisation annuelle</h4>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-combis-blue">
                {new Intl.NumberFormat('fr-FR').format(profil.cotisation_annuelle)} FCFA
              </p>
              <p className="text-sm text-gray-500">par an</p>
              <p className="text-lg font-semibold text-gray-700 mt-2">
                {new Intl.NumberFormat('fr-FR').format(Math.round(profil.cotisation_annuelle / 12))} FCFA/mois
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium text-gray-900">Rôles</h4>
            <div className="flex flex-wrap gap-2">
              {profil.roles && profil.roles.map(role => (
                <span key={role} className="inline-flex px-3 py-1 text-sm rounded-full bg-blue-100 text-blue-800 capitalize">
                  {role}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-medium text-gray-900 mb-2">Statut du compte</h4>
            <span className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${
              profil.statut === 'actif' ? 'bg-green-100 text-green-800' :
              profil.statut === 'inactif' ? 'bg-gray-100 text-gray-800' :
              'bg-red-100 text-red-800'
            }`}>
              {profil.statut}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Onglet Cotisations
const CotisationsTab = ({ statut }) => {
  if (!statut) return <div>Chargement...</div>;

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount) + ' FCFA';
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div className="card bg-gray-50">
          <h4 className="font-medium text-gray-900 mb-2">Statut général</h4>
          <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
            statut.est_a_jour ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            {statut.est_a_jour ? '✓ À jour' : '⚠️ En retard'}
          </div>
        </div>

        <div className="card bg-gray-50">
          <h4 className="font-medium text-gray-900 mb-2">Progression annuelle</h4>
          <div className="flex items-center space-x-2">
            <div className="flex-1 bg-gray-200 rounded-full h-2">
              <div
                className="bg-combis-blue h-2 rounded-full"
                style={{ width: `${statut.pourcentage_paye}%` }}
              ></div>
            </div>
            <span className="text-sm font-medium">{statut.pourcentage_paye}%</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {statut.mois_payes}/{statut.total_mois} mois payés
          </p>
        </div>

        <div className="card bg-gray-50">
          <h4 className="font-medium text-gray-900 mb-2">Cotisation mensuelle</h4>
          <p className="text-lg font-bold text-combis-blue">
            {formatCurrency(Math.round(statut.cotisation_annuelle / 12))}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <h4 className="font-medium text-gray-900 mb-3">Paiements effectués</h4>
          <div className="bg-green-50 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-green-600">
              {formatCurrency(statut.total_paye)}
            </p>
            <p className="text-sm text-green-700">{statut.mois_payes} mois payés</p>
          </div>
        </div>

        <div>
          <h4 className="font-medium text-gray-900 mb-3">Montant restant</h4>
          <div className={`rounded-lg p-4 text-center ${
            statut.total_impaye > 0 ? 'bg-red-50' : 'bg-gray-50'
          }`}>
            <p className={`text-2xl font-bold ${
              statut.total_impaye > 0 ? 'text-red-600' : 'text-gray-500'
            }`}>
              {formatCurrency(statut.total_impaye)}
            </p>
            <p className={`text-sm ${
              statut.total_impaye > 0 ? 'text-red-700' : 'text-gray-500'
            }`}>
              {statut.mois_en_retard > 0 ? `${statut.mois_en_retard} mois en retard` : 'Aucun retard'}
            </p>
          </div>
        </div>
      </div>

      {statut.mois_en_retard > 0 && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                Attention: Cotisations en retard
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>
                  Vous avez {statut.mois_en_retard} mois de cotisations en retard pour un montant de {formatCurrency(statut.total_impaye)}.
                  Veuillez régulariser votre situation pour pouvoir bénéficier des prestations d'assistance.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Onglet Sinistres
const SinistresTab = ({ sinistres }) => {
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

  return (
    <div className="space-y-6">
      {sinistres.length === 0 ? (
        <div className="text-center py-12">
          <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Aucun sinistre déclaré</h3>
          <p className="mt-1 text-sm text-gray-500">
            Vous n'avez encore déclaré aucun sinistre.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <h4 className="font-medium text-gray-900">Historique de mes sinistres</h4>
          
          <div className="space-y-3">
            {sinistres.map((sinistre) => (
              <div key={sinistre.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <h5 className="font-medium text-gray-900">{sinistre.type_sinistre_nom}</h5>
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatutColor(sinistre.statut)}`}>
                        {getStatutText(sinistre.statut)}
                      </span>
                    </div>
                    
                    <p className="text-sm text-gray-600 mt-1">{sinistre.description}</p>
                    
                    <div className="mt-2 flex items-center space-x-4 text-xs text-gray-500">
                      <span>Déclaré le {sinistre.date_declaration_formatted}</span>
                      <span>Sinistre du {sinistre.date_sinistre_formatted}</span>
                      <span>Montant: {formatCurrency(sinistre.montant_demande)}</span>
                    </div>
                    
                    {sinistre.montant_approuve && sinistre.montant_approuve !== sinistre.montant_demande && (
                      <p className="text-xs text-green-600 mt-1">
                        Montant approuvé: {formatCurrency(sinistre.montant_approuve)}
                      </p>
                    )}
                    
                    {sinistre.motif_rejet && (
                      <p className="text-xs text-red-600 mt-1 font-medium">
                        Motif de rejet: {sinistre.motif_rejet}
                      </p>
                    )}
                    
                    {sinistre.remarques && (
                      <p className="text-xs text-gray-600 mt-1">
                        Remarques: {sinistre.remarques}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Onglet Sécurité
const SecuriteTab = () => {
  const { changePassword } = useAuth();
  const [formData, setFormData] = useState({
    nouveauMotDePasse: '',
    confirmMotDePasse: ''
  });
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    
    if (formData.nouveauMotDePasse !== formData.confirmMotDePasse) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }

    if (formData.nouveauMotDePasse.length < 8) {
      toast.error('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }

    setIsChangingPassword(true);
    const result = await changePassword(formData.nouveauMotDePasse);
    
    if (result.success) {
      setFormData({ nouveauMotDePasse: '', confirmMotDePasse: '' });
    }
    
    setIsChangingPassword(false);
  };

  return (
    <div className="space-y-6">
      <div className="max-w-md">
        <h4 className="font-medium text-gray-900 mb-4">Changer le mot de passe</h4>
        
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label className="label">Nouveau mot de passe</label>
            <input
              type="password"
              value={formData.nouveauMotDePasse}
              onChange={(e) => setFormData({...formData, nouveauMotDePasse: e.target.value})}
              className="input-field"
              placeholder="Au moins 8 caractères"
              required
            />
          </div>

          <div>
            <label className="label">Confirmer le mot de passe</label>
            <input
              type="password"
              value={formData.confirmMotDePasse}
              onChange={(e) => setFormData({...formData, confirmMotDePasse: e.target.value})}
              className="input-field"
              placeholder="Répétez le mot de passe"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isChangingPassword}
            className="btn-primary"
          >
            {isChangingPassword ? 'Modification...' : 'Changer le mot de passe'}
          </button>
        </form>

        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <h5 className="font-medium text-blue-900 mb-2">Conseils de sécurité</h5>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Utilisez au moins 8 caractères</li>
            <li>• Mélangez lettres, chiffres et symboles</li>
            <li>• Ne partagez jamais votre mot de passe</li>
            <li>• Changez-le régulièrement</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Profil;