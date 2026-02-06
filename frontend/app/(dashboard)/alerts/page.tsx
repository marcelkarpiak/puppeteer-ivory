'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useAdminContext } from '@/lib/admin-context'
import { type Alert } from '@/lib/supabase'
import { Activity, Eye } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Alert as AlertUI, AlertDescription } from '@/components/ui/alert'
import AlertsTable from '@/components/dashboard/AlertsTable'
import { toast } from 'sonner'

export default function AlertsPage() {
    const [alerts, setAlerts] = useState<Alert[]>([])
    const [loading, setLoading] = useState(true)
    const { supabase, user, isAdmin } = useAuth()
    const { selectedUserId, selectedUser, isManagingOtherUser } = useAdminContext()

    const fetchAlerts = useCallback(async () => {
        if (!supabase || !user) return

        setLoading(true)
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let query: any = supabase
                .from('alerts')
                .select('*')

            if (isAdmin && selectedUserId) {
                query = query.eq('user_id', selectedUserId)
            }

            query = query.order('created_at', { ascending: false })

            const { data, error } = await query

            if (error) throw error
            setAlerts(data || [])
        } catch (error) {
            console.error('Error fetching alerts:', error)
            throw error // Throw for retry logic
        } finally {
            setLoading(false)
        }
    }, [supabase, user, isAdmin, selectedUserId])

    const fetchAlertsWithRetry = useCallback(async (retries = 3, delay = 1000) => {
        for (let i = 0; i < retries; i++) {
            try {
                await fetchAlerts()
                return
            } catch (error) {
                console.error(`[AlertsPage] Attempt ${i + 1} failed:`, error)
                if (i < retries - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay * (i + 1)))
                } else {
                    toast.error('Błąd pobierania alertów')
                }
            }
        }
    }, [fetchAlerts])

    useEffect(() => {
        fetchAlertsWithRetry()

        if (!supabase) return

        const channel = supabase
            .channel('alerts-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'alerts' },
                () => {
                    fetchAlertsWithRetry()
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [supabase, fetchAlertsWithRetry])

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

                {isManagingOtherUser && selectedUser && (
                    <AlertUI className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
                        <Eye className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        <AlertDescription className="text-blue-800 dark:text-blue-200">
                            Przeglądasz alerty użytkownika: <strong>{selectedUser.display_name || selectedUser.email}</strong>
                        </AlertDescription>
                    </AlertUI>
                )}

                <AlertsTable
                    alerts={alerts}
                    loading={loading}
                    onRefresh={() => fetchAlertsWithRetry()}
                />
            </div>
        </div>
    )
}
