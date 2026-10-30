import { useEffect } from 'react'
import Hero from '../components/home/Hero'
import MetricsSection from '../components/home/MetricsSection'
import PipelineSection from '../components/home/PipelineSection'
import ValueSection from '../components/home/ValueSection'
import VocabularySection from '../components/home/VocabularySection'
import CtaSection from '../components/home/CtaSection'

export default function Home() {
  useEffect(() => {
    document.title = 'ISL to Speech · Speak with your hands'
  }, [])

  return (
    <>
      <Hero />
      <MetricsSection />
      <PipelineSection />
      <ValueSection />
      <VocabularySection />
      <CtaSection />
    </>
  )
}