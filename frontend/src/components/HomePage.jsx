import HeroBanner from './HeroBanner'
import TripCarousel from './TripCarousel'
import DomesticTours from './DomesticTours'
import DestinationCategories from './DestinationCategories'
import Testimonials from './Testimonials'
import TravelGuides from './TravelGuides'
import GetInTouch from './GetInTouch'

const HomePage = () => {
  return (
    <>
      <HeroBanner />
      <TripCarousel />
      <DestinationCategories />
      <DomesticTours />
      <Testimonials />
      <TravelGuides />
      <GetInTouch />
    </>
  )
}

export default HomePage
