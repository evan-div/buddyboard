import { notFound } from 'next/navigation'
import WalkHarness from './WalkHarness'

// Development-only route backing the walk-mode end-to-end test. A production
// build resolves this to a 404, so the harness never ships to users.
export default function WalkHarnessPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <WalkHarness />
}
