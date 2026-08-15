import { notFound } from 'next/navigation'
import PactHarness from './PactHarness'

// Development-only route for looking at the Commitments tab without auth, a
// group, or the week a real commitment takes. A production build resolves this
// to a 404, so the harness never ships to users.
export default function PactHarnessPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <PactHarness />
}
