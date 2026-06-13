import Dashboard from '@/components/Dashboard'
import { Suspense } from 'react'

export default function Home() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-200">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-sm font-medium">Ładowanie panelu...</p>
        </div>
      </div>
    }>
      <Dashboard />
    </Suspense>
  )
}

