import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

const Hero = () => {
  const [isVisible, setIsVisible] = useState(false);
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <section 
      ref={heroRef}
      className="relative min-h-[90vh] flex items-center justify-center overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #FFFFFF 0%, #EAEAEA 50%, #FFFFFF 100%)'
      }}
    >
      {/* Animated decorative background elements */}
      <div className="absolute inset-0 overflow-hidden opacity-30">
        <div 
          className="absolute top-20 right-20 w-72 h-72 bg-rexcan-bright-cyan-primary rounded-full blur-3xl animate-pulse-slow"
          style={{ animation: 'float 6s ease-in-out infinite' }}
        ></div>
        <div 
          className="absolute bottom-20 left-20 w-72 h-72 bg-rexcan-bright-cyan-secondary rounded-full blur-3xl animate-pulse-slow"
          style={{ animation: 'float 8s ease-in-out infinite reverse' }}
        ></div>
      </div>

      <div className="container mx-auto px-6 py-20 relative z-10">
        <div className="max-w-5xl mx-auto text-center">
          {/* Main Heading with fade-in and slide-up animation */}
          <h1 
            className={`text-4xl md:text-6xl lg:text-7xl font-bold mb-8 leading-tight transition-all duration-1000 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
            }`}
            style={{ color: '#002D62' }}
          >
            <span className="block mb-3">Intelligent Invoice</span>
            <span 
              className="block"
              style={{ 
                transitionDelay: '0.2s',
                animation: isVisible ? 'gradient-shift 3s ease-in-out infinite' : 'none'
              }}
            >
              Processing Automation
            </span>
          </h1>

          {/* Subheading with fade-in animation */}
          <p 
            className={`text-xl md:text-2xl mb-12 leading-relaxed max-w-3xl mx-auto transition-all duration-1000 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'
            }`}
            style={{ 
              color: '#191970',
              transitionDelay: '0.4s'
            }}
          >
            Transform your Accounts Payable operations with AI-powered document processing.
            Extract, validate, and standardize invoice data in seconds—not hours.
          </p>

          {/* CTA Buttons with fade-in and scale animation */}
          <div 
            className={`flex flex-col sm:flex-row gap-5 justify-center items-center mb-16 transition-all duration-1000 ${
              isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-5 scale-95'
            }`}
            style={{ transitionDelay: '0.6s' }}
          >
            <Link
              to="/demo"
              className="px-10 py-5 rounded-xl font-bold text-lg hover:shadow-2xl hover:scale-105 transition-all w-full sm:w-auto shadow-lg transform hover:-translate-y-1"
              style={{
                backgroundColor: '#00FFD8',
                color: '#002D62'
              }}
            >
              Try Free Demo
            </Link>
            <Link
              to="/features"
              className="px-10 py-5 rounded-xl font-bold text-lg border-2 transition-all w-full sm:w-auto shadow-lg hover:shadow-2xl hover:scale-105 transform hover:-translate-y-1"
              style={{
                backgroundColor: '#002D62',
                borderColor: '#002D62',
                color: '#FFFFFF'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#191970';
                e.currentTarget.style.borderColor = '#191970';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#002D62';
                e.currentTarget.style.borderColor = '#002D62';
              }}
            >
              Learn More
            </Link>
          </div>
        </div>
      </div>

      {/* Scroll Indicator */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce">
        <svg
          className="w-6 h-6"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          stroke="currentColor"
          style={{ color: '#002D62' }}
        >
          <path d="M19 14l-7 7m0 0l-7-7m7 7V3"></path>
        </svg>
      </div>
    </section>
  );
};

export default Hero;
