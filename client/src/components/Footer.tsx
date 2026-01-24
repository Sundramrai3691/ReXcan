import { Link } from 'react-router-dom';

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer 
      className="text-white relative overflow-hidden"
      style={{
        backgroundColor: '#002D62'
      }}
    >
      <div className="container mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand Section */}
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center space-x-3 mb-4">
              <img 
                src="/logo.png" 
                alt="ReXcan Logo" 
                className="h-10 w-auto"
              />
              <span className="text-2xl font-bold text-white">ReXcan</span>
            </div>
            <p 
              className="mb-4 max-w-md"
              style={{ color: '#EAEAEA' }}
            >
              Intelligent invoice processing automation powered by AI. Transform your Accounts Payable 
              operations with accurate, fast, and scalable document processing.
            </p>
            <div className="flex space-x-4">
              <a
                href="#"
                className="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
                style={{
                  backgroundColor: '#191970'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#00FFD8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#191970';
                }}
                aria-label="LinkedIn"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                </svg>
              </a>
              <a
                href="#"
                className="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
                style={{
                  backgroundColor: '#191970'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#00FFD8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#191970';
                }}
                aria-label="Twitter"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z"/>
                </svg>
              </a>
              <a
                href="#"
                className="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
                style={{
                  backgroundColor: '#191970'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#00FFD8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#191970';
                }}
                aria-label="GitHub"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-lg font-semibold mb-4 text-white">Quick Links</h3>
            <ul className="space-y-2">
              <li>
                <Link 
                  to="/" 
                  className="transition-colors"
                  style={{ color: '#EAEAEA' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#00FFD8';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#EAEAEA';
                  }}
                >
                  Home
                </Link>
              </li>
              <li>
                <Link 
                  to="/features" 
                  className="transition-colors"
                  style={{ color: '#EAEAEA' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#00FFD8';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#EAEAEA';
                  }}
                >
                  Features
                </Link>
              </li>
              <li>
                <Link 
                  to="/about" 
                  className="transition-colors"
                  style={{ color: '#EAEAEA' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#00FFD8';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#EAEAEA';
                  }}
                >
                  About
                </Link>
              </li>
              <li>
                <Link 
                  to="/contact" 
                  className="transition-colors"
                  style={{ color: '#EAEAEA' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#00FFD8';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#EAEAEA';
                  }}
                >
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h3 className="text-lg font-semibold mb-4 text-white">Resources</h3>
            <ul className="space-y-2">
              <li>
                <a 
                  href="#" 
                  className="transition-colors"
                  style={{ color: '#EAEAEA' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#00FFD8';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#EAEAEA';
                  }}
                >
                  Documentation
                </a>
              </li>
              <li>
                <a 
                  href="#" 
                  className="transition-colors"
                  style={{ color: '#EAEAEA' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#00FFD8';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#EAEAEA';
                  }}
                >
                  API Reference
                </a>
              </li>
              <li>
                <a 
                  href="#" 
                  className="transition-colors"
                  style={{ color: '#EAEAEA' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#00FFD8';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#EAEAEA';
                  }}
                >
                  Support
                </a>
              </li>
              <li>
                <a 
                  href="#" 
                  className="transition-colors"
                  style={{ color: '#EAEAEA' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#00FFD8';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#EAEAEA';
                  }}
                >
                  Privacy Policy
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div 
          className="mt-8 pt-8 flex flex-col md:flex-row justify-between items-center"
          style={{
            borderTop: '1px solid #191970'
          }}
        >
          <p 
            className="text-sm"
            style={{ color: '#EAEAEA' }}
          >
            © {currentYear} ReXcan. All rights reserved.
          </p>
          <p 
            className="text-sm mt-2 md:mt-0"
            style={{ color: '#EAEAEA' }}
          >
            Powered by AI & Machine Learning
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
