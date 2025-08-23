import React, { createContext, useContext, useReducer, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '../config/api';

const AuthContext = createContext();

const authReducer = (state, action) => {
  switch (action.type) {
    case 'LOGIN_START':
      return {
        ...state,
        loading: true,
        error: null
      };
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        loading: false,
        isAuthenticated: true,
        user: action.payload.user,
        token: action.payload.token,
        error: null
      };
    case 'LOGIN_FAILURE':
      return {
        ...state,
        loading: false,
        isAuthenticated: false,
        user: null,
        token: null,
        error: action.payload
      };
    case 'LOGOUT':
      return {
        ...state,
        isAuthenticated: false,
        user: null,
        token: null,
        loading: false,
        error: null
      };
    case 'SET_LOADING':
      return {
        ...state,
        loading: action.payload
      };
    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null
      };
    default:
      return state;
  }
};

const initialState = {
  isAuthenticated: false,
  user: null,
  token: localStorage.getItem('combis_token'),
  loading: true,
  error: null
};

export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Configurer axios avec le token et baseURL
  useEffect(() => {
    axios.defaults.baseURL = API_BASE_URL;
    if (state.token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${state.token}`;
      localStorage.setItem('combis_token', state.token);
    } else {
      delete axios.defaults.headers.common['Authorization'];
      localStorage.removeItem('combis_token');
    }
  }, [state.token]);

  // Vérifier le token au chargement
  useEffect(() => {
    const verifyToken = async () => {
      const token = localStorage.getItem('combis_token');
      if (token) {
        try {
          axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          const response = await axios.get('/api/auth/verify');
          dispatch({
            type: 'LOGIN_SUCCESS',
            payload: {
              user: response.data.user,
              token
            }
          });
        } catch (error) {
          dispatch({ type: 'LOGOUT' });
          localStorage.removeItem('combis_token');
        }
      } else {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    verifyToken();
  }, []);

  const login = async (telephone, password) => {
    try {
      dispatch({ type: 'LOGIN_START' });
      
      const response = await axios.post('/api/auth/login', {
        telephone,
        password
      });

      const { token, user } = response.data;
      
      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: { user, token }
      });

      if (user.premiere_connexion) {
        toast.success('Première connexion ! Veuillez changer votre mot de passe.');
        return { success: true, premiereConnexion: true };
      } else {
        toast.success(`Bienvenue, ${user.nom_complet} !`);
        return { success: true, premiereConnexion: false };
      }

    } catch (error) {
      const message = error.response?.data?.message || 'Erreur de connexion';
      dispatch({
        type: 'LOGIN_FAILURE',
        payload: message
      });
      toast.error(message);
      return { success: false, error: message };
    }
  };

  const changePassword = async (nouveauMotDePasse) => {
    try {
      await axios.post('/api/auth/change-password', {
        nouveauMotDePasse
      });

      toast.success('Mot de passe mis à jour avec succès !');
      return { success: true };

    } catch (error) {
      const message = error.response?.data?.message || 'Erreur lors du changement de mot de passe';
      toast.error(message);
      return { success: false, error: message };
    }
  };

  const logout = () => {
    dispatch({ type: 'LOGOUT' });
    toast.success('Déconnexion réussie');
  };

  const clearError = () => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  const hasRole = (role) => {
    return state.user?.roles?.includes(role) || false;
  };

  const isAdmin = () => hasRole('admin');
  const isTresorier = () => hasRole('tresorier') || hasRole('admin');

  const value = {
    ...state,
    login,
    logout,
    changePassword,
    clearError,
    hasRole,
    isAdmin,
    isTresorier
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};