import { useEffect, useRef, useState } from 'react';

import CountUp from './CountUp';

const StatsSection = () => {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const currentRef = sectionRef.current;
    if (!currentRef) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
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

  return (
    <section 
      ref={sectionRef}
      className="py-20 bg-white"
      style={{
        backgroundColor: '#FFFFFF'
      }}
    >
      <div className="container mx-auto px-6">
        <div className="max-w-6xl mx-auto">
          <div 
            className={`text-center mb-12 transition-all duration-1000 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
            }`}
          >
            <h2 
              className="text-4xl md:text-5xl font-bold mb-4"
              style={{ color: '#002D62' }}
            >
              Trusted by Industry Leaders
            </h2>
            <p 
              className="text-xl"
              style={{ color: '#191970' }}
            >
              Join thousands of companies transforming their invoice processing
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Customers Satisfied */}
            <div 
              className={`text-center p-8 rounded-xl border-2 transition-all duration-700 hover:shadow-xl hover:-translate-y-2 ${
                isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-10 scale-95'
              }`}
              style={{ 
                borderColor: '#D3D3D3',
                transitionDelay: '0.2s'
              }}
            >
              <div 
                className="text-5xl md:text-6xl font-bold mb-4"
                style={{ color: '#00FFD8' }}
              >
                {isVisible && (
                  <CountUp 
                    end={500}
                    duration={2000}
                    suffix="+"
                  />
                )}
              </div>
              <h3 
                className="text-2xl font-semibold mb-2"
                style={{ color: '#002D62' }}
              >
                Customers Satisfied
              </h3>
              <p 
                className="text-lg"
                style={{ color: '#191970' }}
              >
                Happy clients across industries
              </p>
            </div>

            {/* Companies */}
            <div 
              className={`text-center p-8 rounded-xl border-2 transition-all duration-700 hover:shadow-xl hover:-translate-y-2 ${
                isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-10 scale-95'
              }`}
              style={{ 
                borderColor: '#D3D3D3',
                transitionDelay: '0.4s'
              }}
            >
              <div 
                className="text-5xl md:text-6xl font-bold mb-4"
                style={{ color: '#00FFD8' }}
              >
                {isVisible && (
                  <CountUp 
                    end={25}
                    duration={2000}
                    suffix="+"
                  />
                )}
              </div>
              <h3 
                className="text-2xl font-semibold mb-2"
                style={{ color: '#002D62' }}
              >
                Companies Trust Us
              </h3>
              <p 
                className="text-lg"
                style={{ color: '#191970' }}
              >
                From startups to enterprises
              </p>
            </div>

            {/* PDFs Scanned */}
            <div 
              className={`text-center p-8 rounded-xl border-2 transition-all duration-700 hover:shadow-xl hover:-translate-y-2 ${
                isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-10 scale-95'
              }`}
              style={{ 
                borderColor: '#D3D3D3',
                transitionDelay: '0.6s'
              }}
            >
              <div 
                className="text-5xl md:text-6xl font-bold mb-4"
                style={{ color: '#00FFD8' }}
              >
                {isVisible && (
                  <CountUp 
                    end={1000}
                    duration={2000}
                    suffix="+"
                  />
                )}
              </div>
              <h3 
                className="text-2xl font-semibold mb-2"
                style={{ color: '#002D62' }}
              >
                PDFs Scanned
              </h3>
              <p 
                className="text-lg"
                style={{ color: '#191970' }}
              >
                Documents processed and counting
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default StatsSection;

