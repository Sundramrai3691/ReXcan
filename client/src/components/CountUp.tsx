import { useState, useEffect, useRef } from 'react';

interface CountUpProps {
  end: number;
  start?: number;
  duration?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
  style?: React.CSSProperties;
}

const CountUp = ({ 
  end, 
  start = 0, 
  duration = 2000,
  suffix = '',
  prefix = '',
  className = '',
  style
}: CountUpProps) => {
  const [count, setCount] = useState(start);
  const [hasAnimated, setHasAnimated] = useState(false);
  const countRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (hasAnimated) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasAnimated) {
            setHasAnimated(true);
            
            let startTime: number | null = null;
            const step = (timestamp: number) => {
              if (!startTime) startTime = timestamp;
              const progress = Math.min((timestamp - startTime) / duration, 1);
              
              // Easing function for smooth animation
              const easeOutQuart = 1 - Math.pow(1 - progress, 4);
              const currentCount = Math.floor(easeOutQuart * (end - start) + start);
              
              setCount(currentCount);
              
              if (progress < 1) {
                requestAnimationFrame(step);
              } else {
                setCount(end);
              }
            };
            
            requestAnimationFrame(step);
          }
        });
      },
      { threshold: 0.5 }
    );

    if (countRef.current) {
      observer.observe(countRef.current);
    }

    return () => {
      if (countRef.current) {
        observer.unobserve(countRef.current);
      }
    };
  }, [end, start, duration, hasAnimated]);

  return (
    <span ref={countRef} className={className} style={style}>
      {prefix}{count.toLocaleString()}{suffix}
    </span>
  );
};

export default CountUp;

