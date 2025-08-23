import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Toaster } from 'react-hot-toast';

// Contexts
import { AuthProvider } from './contexts/AuthContext';

// Components
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';

// Pages
import Login from './pages/auth/Login';
import Dashboard from './pages/Dashboard';
import Membres from './pages/Membres';
import Cotisations from './pages/Cotisations';
import Sinistres from './pages/Sinistres';
import Profil from './pages/Profil';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <div className="min-h-screen bg-gray-50">
            <Routes>
              {/* Route publique */}
              <Route path="/login" element={<Login />} />
              
              {/* Routes protégées */}
              <Route path="/" element={
                <ProtectedRoute>
                  <Layout>
                    <Dashboard />
                  </Layout>
                </ProtectedRoute>
              } />
              
              <Route path="/membres" element={
                <ProtectedRoute>
                  <Layout>
                    <Membres />
                  </Layout>
                </ProtectedRoute>
              } />
              
              <Route path="/cotisations" element={
                <ProtectedRoute>
                  <Layout>
                    <Cotisations />
                  </Layout>
                </ProtectedRoute>
              } />
              
              <Route path="/sinistres" element={
                <ProtectedRoute>
                  <Layout>
                    <Sinistres />
                  </Layout>
                </ProtectedRoute>
              } />
              
              <Route path="/profil" element={
                <ProtectedRoute>
                  <Layout>
                    <Profil />
                  </Layout>
                </ProtectedRoute>
              } />
            </Routes>
            
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 4000,
                style: {
                  background: '#363636',
                  color: '#fff',
                },
                success: {
                  iconTheme: {
                    primary: '#059669',
                    secondary: '#fff',
                  },
                },
                error: {
                  iconTheme: {
                    primary: '#dc2626',
                    secondary: '#fff',
                  },
                },
              }}
            />
          </div>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;