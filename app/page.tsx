'use client'
import PerfectGame from '../components/PerfectGame'
import AuthGate from '../components/AuthGate'

export default function Page() {
  return (
    <AuthGate>
      <PerfectGame />
    </AuthGate>
  )
}
