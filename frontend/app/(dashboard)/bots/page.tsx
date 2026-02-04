'use client'

import BotInstancesTable from '@/components/dashboard/BotInstancesTable'

export default function BotsPage() {
    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Monitoring Botów</h1>
                    <p className="text-muted-foreground">
                        Sprawdź status, aktywność i kondycję uruchomionych instancji botów.
                    </p>
                </div>
            </div>

            <BotInstancesTable />
        </div>
    )
}
