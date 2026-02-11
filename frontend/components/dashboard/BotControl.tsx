'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Play,
  Square,
  AlertCircle,
  CheckCircle2,
  Activity
} from 'lucide-react'

export default function BotControl() {
  const [botStatus, setBotStatus] = useState<'stopped' | 'running'>('stopped')

  return (
    <div className="grid gap-6">
      <Card className="border-blue-200 dark:border-blue-900">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-600" />
              <CardTitle>Scraper Bot</CardTitle>
            </div>
            <Badge
              variant={botStatus === 'running' ? 'default' : 'secondary'}
              className={botStatus === 'running' ? 'bg-green-500' : ''}
            >
              {botStatus === 'running' ? (
                <>
                  <Activity className="w-3 h-3 mr-1 animate-pulse" />
                  Aktywny
                </>
              ) : (
                'Zatrzymany'
              )}
            </Badge>
          </div>
          <CardDescription>
            Skanuje grupy, robi screenshoty pasujacych postow i uploaduje do Storage
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Workflow:</h4>
            <ol className="text-sm space-y-1 text-muted-foreground">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-600" />
                Skanuje feed grupy
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-600" />
                Filtruje posty wedlug slow kluczowych
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-600" />
                Robi screenshot bezposrednio z feeda
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-600" />
                Uploaduje do Supabase Storage
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-600" />
                Zapisuje post ze statusem &quot;done&quot;
              </li>
            </ol>
          </div>

          <div className="pt-4 border-t">
            <p className="text-sm text-muted-foreground mb-4">
              <AlertCircle className="w-4 h-4 inline mr-1" />
              Uruchom bota recznie w terminalu:
            </p>
            <code className="block bg-black text-green-400 p-3 rounded text-xs font-mono">
              node fb-bot.js
            </code>
          </div>

          <Button
            className="w-full"
            variant={botStatus === 'running' ? 'destructive' : 'default'}
            onClick={() => setBotStatus(botStatus === 'running' ? 'stopped' : 'running')}
            disabled
          >
            {botStatus === 'running' ? (
              <>
                <Square className="w-4 h-4 mr-2" />
                Zatrzymaj (wymaga terminala)
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Uruchom (wymaga terminala)
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-amber-200 dark:border-amber-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            Instrukcja uruchamiania
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold mb-2">1. Przygotowanie sesji</h4>
              <p className="text-sm text-muted-foreground mb-2">
                Zaloguj sie na konto w profilu Chrome (userDataDir).
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">2. Konfiguracja srodowiska</h4>
              <p className="text-sm text-muted-foreground mb-2">
                Upewnij sie, ze plik .env zawiera:
              </p>
              <code className="block bg-muted p-2 rounded text-xs">
                SUPABASE_URL=...<br />
                SUPABASE_SERVICE_ROLE_KEY=...
              </code>
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-2">3. Uruchomienie bota</h4>
            <p className="text-sm text-muted-foreground mb-2">
              W jednym terminalu uruchom:
            </p>
            <code className="block bg-black text-green-400 p-3 rounded text-xs font-mono">
              node fb-bot.js
            </code>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
