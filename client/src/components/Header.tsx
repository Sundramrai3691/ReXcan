import { Link } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthContext';

const Header = () => {
  const { isAuthenticated, user } = useAuth();
  
  // Get first name from full name
  const firstName = user?.name?.split(' ')[0] || '';

  return (
    <header 
      className="sticky top-0 z-50 shadow-lg"
      style={{
        backgroundColor: '#002D62'
      }}
    >
      <nav className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-3 group">
            <img 
              src="/logo.png" 
              alt="ReXcan Logo" 
              className="h-10 w-auto group-hover:scale-110 transition-transform"
            />
            <span className="text-2xl font-bold text-white">
              ReXcan
            </span>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-8">
            <Link
              to="/"
              className="text-white hover:text-rexcan-bright-cyan-primary transition-colors font-medium"
              style={{ color: '#FFFFFF' }}
            >
              Home
            </Link>
            <Link
              to="/features"
              className="text-white hover:text-rexcan-bright-cyan-primary transition-colors font-medium"
              style={{ color: '#FFFFFF' }}
            >
              Features
            </Link>
            <Link
              to="/about"
              className="text-white hover:text-rexcan-bright-cyan-primary transition-colors font-medium"
              style={{ color: '#FFFFFF' }}
            >
              About
            </Link>
            <Link
              to="/contact"
              className="text-white hover:text-rexcan-bright-cyan-primary transition-colors font-medium"
              style={{ color: '#FFFFFF' }}
            >
              Contact
            </Link>
            {isAuthenticated && (
              <>
                <Link
                  to="/dashboard"
                  className="text-white hover:text-rexcan-bright-cyan-primary transition-colors font-medium"
                  style={{ color: '#FFFFFF' }}
                >
                  Dashboard
                </Link>
              </>
            )}
          </div>

          {/* Auth Buttons */}
          <div className="flex items-center space-x-4">
            {isAuthenticated ? (
              <Link
                to="/profile"
                className="flex items-center space-x-2 group"
                title="Profile"
              >
                <span className="text-white font-medium hidden sm:block group-hover:text-rexcan-bright-cyan-primary transition-colors">
                  {firstName}
                </span>
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 transition-all hover:scale-110">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </div>
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-white hover:text-rexcan-bright-cyan-primary transition-colors font-medium"
                  style={{ color: '#FFFFFF' }}
                >
                  Login
                </Link>
                <Link
                  to="/signup"
                  className="px-6 py-2 rounded-lg font-semibold text-white hover:shadow-lg hover:scale-105 transition-all"
                  style={{
                    backgroundColor: '#00FFD8',
                    color: '#002D62'
                  }}
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
};

export default Header;
