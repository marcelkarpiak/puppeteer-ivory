'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { type Alert } from '@/lib/supabase'
import { Activity } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import AlertsTable from '@/components/dashboard/AlertsTable'
import { toast } from 'sonner'

export default function AlertsPage() {
    const [alerts, setAlerts] = useState<Alert[]>([])
    const [loading, setLoading] = useState(true)
    const { supabase, user } = useAuth()

    const fetchAlerts = useCallback(async () => {
        if (!supabase || !user) return

        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('alerts')
                .select('*')
                .order('created_at', { ascending: false })

            if (error) throw error
            setAlerts(data || [])
        } catch (error) {
            console.error('Error fetching alerts:', error)
            toast.error('Błąd pobierania alertów')
        } finally {
            setLoading(false)
        }
    }, [supabase, user])

    useEffect(() => {
        fetchAlerts()

        if (!supabase) return

        const channel = supabase
            .channel('alerts-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'alerts' },
                () => {
                    fetchAlerts()
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [supabase, fetchAlerts])

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
            <div className="container mx-auto p-6 space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-transparent">
                            System Alertów
                        </h1>
                        <p className="text-muted-foreground mt-2">
                            Monitoruj statusy botów i interwencje wymagające uwagi
                        </p>
                    </div>
                </div>

                <AlertsTable
                    alerts={alerts}
                    loading={loading}
                    onRefresh={fetchAlerts}
                />
            </div>
        </div>
    )
}
