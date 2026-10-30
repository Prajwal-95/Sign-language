import Icon, { type IconName } from '../ui/Icon'
import { Shell, accentIconClass, accentTextClass, type Accent } from '../ui/Card'

interface ValueCard {
  icon: IconName
  accent: Accent
  title: string
  text: string
}

const CARDS: ValueCard[] = [
  {
    icon: 'users',
    accent: 'brand',
    title: 'Closes a daily communication gap',
    text: 'Deaf and hard-of-hearing people depend on interpreters for everyday conversation. This gives a small, concrete set of frequently used words an always-available, personal voice.',
  },
  {
    icon: 'globe',
    accent: 'violet',
    title: 'Output in the language you use',
    text: 'Every recognised sign is rendered and spoken in English, हिन्दी or ಕನ್ನಡ — the same gesture, three languages, one switch.',
  },
  {
    icon: 'shield',
    accent: 'teal',
    title: 'Private by architecture, not by policy',
    text: 'Hand tracking runs entirely in the browser. Only 21-point coordinates are transmitted, so the camera feed itself is never recorded, stored or uploaded.',
  },
]

export default function ValueSection() {
  return (
    <section aria-labelledby="value-heading" className="band-peach border-b border-line">
      <Shell className="py-14 sm:py-16">
        <div className="max-w-2xl">
          <p className="kicker">Why it exists</p>
          <h2 id="value-heading" className="mt-3 text-2xl font-bold text-ink sm:text-3xl">
            An accessibility tool, built as real engineering
          </h2>
          <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-ink-secondary">
            The interface is only half of the project — the other half is a trained model,
            an honest evaluation and an end-to-end pipeline that a hearing person can actually
            use without an interpreter in the room.
          </p>
        </div>

        <div className="mt-9 grid gap-4 md:grid-cols-3">
          {CARDS.map((card) => (
            <article key={card.title} className="surface card-hover flex flex-col p-6">
              <span
                className={`grid h-11 w-11 place-items-center rounded-xl border ${accentIconClass(card.accent)}`}
              >
                <Icon name={card.icon} size={21} />
              </span>
              <h3 className={`mt-4 text-[17px] font-semibold ${accentTextClass(card.accent)}`}>
                {card.title}
              </h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-secondary">{card.text}</p>
            </article>
          ))}
        </div>
      </Shell>
    </section>
  )
}