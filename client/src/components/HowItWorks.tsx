import { useEffect, useRef, useState } from 'react';

interface StepCardProps {
  number: number;
  title: string;
  description: string;
  delay: number;
  icon: string;
}

const StepCard = ({ number, title, description, delay, icon }: StepCardProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const currentRef = cardRef.current;
    if (!currentRef) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setTimeout(() => {
              setIsVisible(true);
            }, delay);
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
  }, [delay]);

  return (
    <div
      ref={cardRef}
      className={`group relative p-12 rounded-3xl transition-all duration-700 hover:-translate-y-5 ${
        number === 2 
          ? 'bg-white shadow-2xl hover:shadow-3xl border-2' 
          : 'bg-white shadow-2xl hover:shadow-3xl'
      } ${
        isVisible 
          ? 'opacity-100 translate-y-0 scale-100' 
          : 'opacity-0 translate-y-16 scale-95'
      }`}
      style={{
        transitionDelay: isVisible ? `${delay}ms` : '0ms',
        borderColor: number === 2 ? '#00FFD8' : 'transparent'
      }}
    >
      {/* Glow effect on hover */}
      <div 
        className={`absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl ${
          number === 2 
            ? 'bg-rexcan-bright-cyan-primary' 
            : 'bg-rexcan-bright-cyan-primary'
        }`}
        style={{
          background: number === 2 
            ? 'rgba(0, 255, 216, 0.3)' 
            : 'rgba(0, 255, 216, 0.2)'
        }}
      />
      
      <div className="relative z-10">
        {/* Icon Badge */}
        <div 
          className="w-28 h-28 rounded-3xl flex items-center justify-center mb-8 mx-auto transition-all duration-500 group-hover:scale-110 group-hover:rotate-3 bg-logo-gradient text-white shadow-2xl"
          style={{
            background: 'linear-gradient(135deg, #002D62 0%, #191970 50%, #00FFD8 100%)'
          }}
        >
          <span className="text-5xl">{icon}</span>
        </div>

        {/* Step Number */}
        <div 
          className="absolute top-6 right-6 w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold bg-rexcan-dark-blue-primary/10 text-rexcan-dark-blue-secondary"
        >
          {number}
        </div>

        <h3 
          className={`text-3xl font-bold mb-6 text-center ${
            number === 2 ? 'text-rexcan-dark-blue-primary' : 'text-rexcan-dark-blue-secondary'
          }`}
          style={number === 2 ? { color: '#002D62' } : {}}
        >
          {title}
        </h3>
        <p 
          className={`text-lg leading-relaxed text-center ${
            number === 2 ? 'text-rexcan-dark-blue-primary' : 'text-rexcan-dark-blue-primary'
          }`}
        >
          {description}
        </p>
      </div>
    </div>
  );
};

const HowItWorks = () => {
  const [titleVisible, setTitleVisible] = useState(false);
  const titleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const currentRef = titleRef.current;
    if (!currentRef) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setTitleVisible(true);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.3 }
    );

    observer.observe(currentRef);

    return () => {
      observer.unobserve(currentRef);
    };
  }, []);

  return (
    <section 
      className="py-32 bg-white relative overflow-hidden"
      style={{
        backgroundColor: '#FFFFFF'
      }}
    >
      {/* Decorative gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-rexcan-light-grey-secondary via-white to-white opacity-50"></div>
      
      {/* Animated decorative elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden">
        <div className="absolute top-40 right-20 w-[500px] h-[500px] bg-rexcan-bright-cyan-primary rounded-full blur-[120px] opacity-20 animate-pulse"></div>
        <div className="absolute bottom-40 left-20 w-[500px] h-[500px] bg-rexcan-bright-cyan-secondary rounded-full blur-[120px] opacity-20 animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      <div className="container mx-auto px-6 relative z-10">
        <div className="max-w-7xl mx-auto">
          <div 
            ref={titleRef}
            className={`text-center mb-20 transition-all duration-1000 ${
              titleVisible 
                ? 'opacity-100 translate-y-0' 
                : 'opacity-0 translate-y-10'
            }`}
          >
            <div className="inline-block mb-6">
              <span 
                className="text-sm font-semibold uppercase tracking-wider px-4 py-2 rounded-full"
                style={{
                  backgroundColor: '#00FFD8',
                  color: '#002D62'
                }}
              >
                Simple Process
              </span>
            </div>
            <h2 
              className="text-6xl md:text-7xl font-bold mb-8"
              style={{
                background: 'linear-gradient(135deg, #191970 0%, #002D62 50%, #00FFD8 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}
            >
              How It Works
            </h2>
            <p 
              className="text-2xl md:text-3xl font-medium max-w-3xl mx-auto leading-relaxed"
              style={{ color: '#191970' }}
            >
              Our AI-powered pipeline processes invoices in three simple steps
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-12 relative">
            <StepCard
              number={1}
              title="Upload Invoice"
              description="Upload invoices in any format—PDF, scanned images, or email attachments. Our system handles everything automatically."
              delay={0}
              icon="📄"
            />
            <StepCard
              number={2}
              title="AI Extraction"
              description="Our advanced AI extracts key fields like invoice number, vendor, amount, and dates with 99%+ accuracy."
              delay={200}
              icon="🤖"
            />
            <StepCard
              number={3}
              title="Get Structured Data"
              description="Receive clean, standardized JSON/CSV output ready for your accounting system. No manual work required."
              delay={400}
              icon="📊"
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
