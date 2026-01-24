import { useEffect, useRef, useState } from 'react';

interface SplitTextProps {
  text: string;
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
  splitBy?: 'char' | 'word';
}

const SplitText = ({ 
  text, 
  delay = 0, 
  className = '',
  style,
  splitBy = 'char'
}: SplitTextProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
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
      { threshold: 0.1 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      if (containerRef.current) {
        observer.unobserve(containerRef.current);
      }
    };
  }, [delay]);

  const splitContent = splitBy === 'char' 
    ? text.split('').map((char, index) => ({ content: char, key: index }))
    : text.split(' ').map((word, index) => ({ content: word, key: index }));

  return (
    <span ref={containerRef} className={className} style={style}>
      {splitContent.map((item, index) => (
        <span
          key={item.key}
          className={`inline-block ${isVisible ? 'animate-fade-in-up' : 'opacity-0 translate-y-5'}`}
          style={{
            animationDelay: `${delay + index * 0.05}s`,
            animationFillMode: 'forwards'
          }}
        >
          {item.content}
          {splitBy === 'word' && index < splitContent.length - 1 && '\u00A0'}
        </span>
      ))}
    </span>
  );
};

export default SplitText;

