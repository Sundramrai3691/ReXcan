import { useEffect, useRef, useState } from 'react';

interface FeatureCardProps {
  icon: string;
  title: string;
  description: string;
  delay: string;
  borderColor: string;
  glowColor: string;
  hoverColor: string;
  isVisible: boolean;
  slideDirection: 'left' | 'right';
}

const FeatureCard = ({
  icon,
  title,
  description,
  delay,
  borderColor,
  glowColor,
  hoverColor,
  isVisible,
  slideDirection,
}: FeatureCardProps) => {
  return (
    <div
      className={`group relative bg-white/10 backdrop-blur-md p-10 rounded-2xl border-2 transition-all duration-700 hover:scale-[1.02] hover:-translate-y-2 hover:shadow-2xl ${
        isVisible ? 'opacity-100 translate-x-0' : `opacity-0 ${slideDirection === 'left' ? '-translate-x-10' : 'translate-x-10'}`
      }`}
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        borderColor,
        transitionDelay: delay,
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
      }}
    >
      {/* Glow effect on hover */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-500"
        style={{ backgroundColor: glowColor }}
      ></div>

      <div className="relative z-10">
        <div
          className="w-16 h-16 bg-gradient-to-br from-rexcan-bright-cyan-primary to-rexcan-bright-cyan-secondary rounded-xl flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-500"
          style={{
            background:
              slideDirection === 'left'
                ? 'linear-gradient(135deg, #00FFD8 0%, #39FF14 100%)'
                : 'linear-gradient(135deg, #39FF14 0%, #00FFD8 100%)',
          }}
        >
          <span className="text-3xl">{icon}</span>
        </div>
        <h3
          className="text-3xl font-bold text-white mb-4 transition-colors"
          style={{
            color: 'white',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = hoverColor;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'white';
          }}
        >
          {title}
        </h3>
        <p className="text-lg leading-relaxed text-rexcan-light-grey-secondary" style={{ color: '#D3D3D3' }}>
          {description}
        </p>
      </div>
    </div>
  );
};

const FeaturesSection = () => {
  const [featuresVisible, setFeaturesVisible] = useState(false);
  const featuresRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const currentRef = featuresRef.current;
    if (!currentRef) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setFeaturesVisible(true);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2 }
    );

    observer.observe(currentRef);

    return () => {
      observer.unobserve(currentRef);
    };
  }, []);

  const features = [
    {
      icon: '⚡',
      title: 'Lightning Fast',
      description: 'Process thousands of invoices in minutes, not days. Our AI pipeline handles high-volume processing with ease.',
      delay: '0.2s',
      borderColor: 'rgba(0, 255, 216, 0.4)',
      glowColor: '#00FFD8',
      hoverColor: '#00FFD8',
      slideDirection: 'left' as const,
    },
    {
      icon: '🎯',
      title: '99%+ Accuracy',
      description: 'Advanced NLP and validation rules ensure near-perfect extraction. Low-confidence fields are flagged for review.',
      delay: '0.4s',
      borderColor: 'rgba(57, 255, 20, 0.4)',
      glowColor: '#39FF14',
      hoverColor: '#39FF14',
      slideDirection: 'right' as const,
    },
    {
      icon: '🔄',
      title: 'Universal Format Support',
      description: 'Handles any invoice format—text PDFs, scanned documents, emails. No template matching required.',
      delay: '0.6s',
      borderColor: 'rgba(0, 255, 216, 0.4)',
      glowColor: '#00FFD8',
      hoverColor: '#00FFD8',
      slideDirection: 'left' as const,
    },
    {
      icon: '📊',
      title: 'Standardized Output',
      description: 'Automatic canonicalization ensures consistent dates, currencies, and vendor IDs across all invoices.',
      delay: '0.8s',
      borderColor: 'rgba(57, 255, 20, 0.4)',
      glowColor: '#39FF14',
      hoverColor: '#39FF14',
      slideDirection: 'right' as const,
    },
  ];

  return (
    <section
      ref={featuresRef}
      className="py-24 bg-gradient-to-br from-rexcan-dark-blue-primary via-rexcan-dark-blue-secondary to-rexcan-dark-blue-primary relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #002D62 0%, #191970 50%, #002D62 100%)',
      }}
    >
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden opacity-20">
        <div className="absolute top-0 right-0 w-96 h-96 bg-rexcan-bright-cyan-primary rounded-full blur-[120px]"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-rexcan-bright-cyan-secondary rounded-full blur-[120px]"></div>
      </div>

      <div className="container mx-auto px-6 relative z-10">
        <div className="max-w-6xl mx-auto">
          <div
            className={`text-center mb-16 transition-all duration-1000 ${
              featuresVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
            }`}
          >
            <div className="inline-block mb-6">
              <span
                className="text-sm font-semibold uppercase tracking-wider px-4 py-2 rounded-full"
                style={{
                  backgroundColor: '#00FFD8',
                  color: '#002D62',
                }}
              >
                Why Choose Us
              </span>
            </div>
            <h2
              className="text-5xl md:text-6xl lg:text-7xl font-bold mb-6"
              style={{
                background: 'linear-gradient(135deg, #FFFFFF 0%, #00FFD8 50%, #FFFFFF 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Why Choose ReXcan?
            </h2>
            <p className="text-xl md:text-2xl text-rexcan-light-grey-secondary max-w-3xl mx-auto leading-relaxed">
              Powerful features that transform your invoice processing workflow
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {features.map((feature, index) => (
              <FeatureCard key={index} {...feature} isVisible={featuresVisible} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;

