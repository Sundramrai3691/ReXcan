import FeaturesSection from '@/components/FeaturesSection';
import Hero from '@/components/Hero';
import HowItWorks from '@/components/HowItWorks';
import StatsSection from '@/components/StatsSection';

const Home = () => {
  return (
    <div>
      <Hero />
      <HowItWorks />
      <FeaturesSection />
      <StatsSection />
    </div>
  );
};

export default Home;

