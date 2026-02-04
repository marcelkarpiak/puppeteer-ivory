'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Activity, AlertCircle, FileText, TrendingUp, Users } from 'lucide-react'

interface StatsCardsProps {
  stats: {
    total: number
    done: number
    processing: number
    error: number
    processed: number
    today: number
    successRate: number
    topGroups: { name: string, count: number }[]
  }
}

export default function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div className="space-y-4">
      {/* Main Stats Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Leady Dzisiaj</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.today}</div>
            <p className="text-xs text-muted-foreground">Nowe posty pobrane dzisiaj</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Wskaźnik Sukcesu</CardTitle>
            <Activity className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.successRate}%</div>
            <p className="text-xs text-muted-foreground">Posty przetworzone pomyślnie</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-red-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Wymagają Uwagi</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.error}</div>
            <p className="text-xs text-muted-foreground">Błędy i odrzucone</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-purple-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Całkowita Baza</CardTitle>
            <FileText className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Wszystkie zebrane posty</p>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Status Breakdown */}
        <Card className="col-span-4 lg:col-span-5 hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Status Postów</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-between items-center text-sm pt-0">
            <div className="flex flex-col items-center">
              <span className="font-bold text-lg text-blue-600">{stats.processing}</span>
              <span className="text-muted-foreground text-xs">W trakcie</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="font-bold text-lg text-green-600">{stats.done}</span>
              <span className="text-muted-foreground text-xs">Gotowe</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="font-bold text-lg text-purple-600">{stats.processed}</span>
              <span className="text-muted-foreground text-xs">Opracowane</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="font-bold text-lg text-red-600">{stats.error}</span>
              <span className="text-muted-foreground text-xs">Błędy</span>
            </div>
          </CardContent>
        </Card>

        {/* Top Groups */}
        <Card className="col-span-4 lg:col-span-2 hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <Users className="h-4 w-4 mr-2" /> Top Grupy (Dziś)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2 mt-2">
              {stats.topGroups.length > 0 ? (
                stats.topGroups.map((g, i) => (
                  <div key={i} className="flex justify-between items-center text-sm">
                    <span className="truncate max-w-[120px]" title={g.name}>{g.name}</span>
                    <span className="font-mono font-bold bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-xs">{g.count}</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">Brak aktywności dzisiaj</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
