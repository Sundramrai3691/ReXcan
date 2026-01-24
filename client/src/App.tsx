import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import Footer from '@/components/Footer';
import Header from '@/components/Header';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AuthProvider } from '@/contexts/AuthContext';
import Dashboard from '@/pages/Dashboard';
import Home from '@/pages/Home';
import Login from '@/pages/Login';
import Profile from '@/pages/Profile';
import Signup from '@/pages/Signup';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Auth pages without Header/Footer */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          
          {/* Main app pages with Header/Footer */}
          <Route
            path="/*"
            element={
              <div className="min-h-screen flex flex-col bg-white">
                <Header />
                <main className="flex-grow w-full">
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/features" element={<div className="min-h-screen bg-gradient-to-b from-rexcan-light-grey-secondary to-white"><div className="container mx-auto px-6 py-20"><h1 className="text-4xl md:text-5xl font-bold bg-text-gradient bg-clip-text text-transparent mb-4">Features</h1><p className="text-rexcan-dark-blue-secondary text-lg">Coming soon...</p></div></div>} />
                    <Route path="/about" element={<div className="min-h-screen bg-gradient-to-b from-rexcan-light-grey-secondary to-white"><div className="container mx-auto px-6 py-20"><h1 className="text-4xl md:text-5xl font-bold bg-text-gradient bg-clip-text text-transparent mb-4">About</h1><p className="text-rexcan-dark-blue-secondary text-lg">Coming soon...</p></div></div>} />
                    <Route path="/contact" element={<div className="min-h-screen bg-gradient-to-b from-rexcan-light-grey-secondary to-white"><div className="container mx-auto px-6 py-20"><h1 className="text-4xl md:text-5xl font-bold bg-text-gradient bg-clip-text text-transparent mb-4">Contact</h1><p className="text-rexcan-dark-blue-secondary text-lg">Coming soon...</p></div></div>} />
                    <Route path="/demo" element={<div className="min-h-screen bg-gradient-to-br from-rexcan-dark-blue-primary to-rexcan-dark-blue-secondary"><div className="container mx-auto px-6 py-20"><h1 className="text-4xl md:text-5xl font-bold text-white mb-4">Demo</h1><p className="text-rexcan-light-grey-secondary text-lg">Coming soon...</p></div></div>} />
                    {/* Protected Dashboard Route */}
                    <Route
                      path="/dashboard"
                      element={
                        <ProtectedRoute>
                          <Dashboard />
                        </ProtectedRoute>
                      }
                    />
                    {/* Protected Profile Route */}
                    <Route
                      path="/profile"
                      element={
                        <ProtectedRoute>
                          <Profile />
                        </ProtectedRoute>
                      }
                    />
                    {/* Example admin-only route */}
                    <Route
                      path="/admin"
                      element={
                        <ProtectedRoute requireAdmin>
                          <div className="min-h-screen bg-gradient-to-b from-rexcan-light-grey-secondary to-white">
                            <div className="container mx-auto px-6 py-20">
                              <h1 className="text-4xl md:text-5xl font-bold bg-text-gradient bg-clip-text text-transparent mb-4">
                                Admin Panel
                              </h1>
                              <p className="text-rexcan-dark-blue-secondary text-lg">
                                This is an admin-only route. Only users with admin role can access this page.
                              </p>
                            </div>
                          </div>
                        </ProtectedRoute>
                      }
                    />
                  </Routes>
                </main>
                <Footer />
              </div>
            }
          />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
