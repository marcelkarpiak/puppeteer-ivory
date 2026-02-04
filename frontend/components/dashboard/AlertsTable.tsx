'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { type Alert } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    AlertTriangle,
    AlertOctagon,
    Activity,
    Check,
    Clock
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { pl } from 'date-fns/locale'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface AlertsTableProps {
    alerts: Alert[]
    loading: boolean
    onRefresh: () => void
}

export default function AlertsTable({ alerts, onRefresh }: AlertsTableProps) {
    const [resolving, setResolving] = useState<string | null>(null)
    const supabase = createClient()

    const resolveAlert = async (alertId: string) => {
        setResolving(alertId)
        try {
            const { error } = await supabase
                .from('alerts')
                .update({
                    status: 'resolved',
                    resolved_at: new Date().toISOString()
                })
                .eq('id', alertId)

            if (error) throw error
            onRefresh()

            // Notify other components (like Sidebar) to refresh
            window.dispatchEvent(new Event('refresh-alerts'))

            toast.success('Alert rozwiązany')
        } catch (error) {
            console.error('Error resolving alert:', error)
            toast.error('Błąd aktualizacji statusu')
        } finally {
            setResolving(null)
        }
    }

    const getTypeBadge = (type: Alert['type']) => {
        switch (type) {
            case 'checkpoint':
                return <Badge variant="destructive" className="gap-1"><AlertOctagon className="w-3 h-3" /> Checkpoint</Badge>
            case 'error':
                return <Badge variant="destructive" className="gap-1"><AlertTriangle className="w-3 h-3" /> Błąd</Badge>
            case 'no_activity':
                return <Badge variant="secondary" className="gap-1 bg-yellow-100 text-yellow-800 hover:bg-yellow-200 dark:bg-yellow-900 dark:text-yellow-100"><Clock className="w-3 h-3" /> Brak aktywności</Badge>
            case 'bot_offline':
                return <Badge variant="secondary" className="gap-1 bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100"><Activity className="w-3 h-3" /> Bot Offline</Badge>
            default:
                return <Badge variant="outline">{type}</Badge>
        }
    }

    const getStatusBadge = (status: Alert['status']) => {
        switch (status) {
            case 'new':
                return <Badge variant="default" className="bg-blue-500">Nowy</Badge>
            case 'reviewed':
                return <Badge variant="secondary">Przejrzany</Badge>
            case 'resolved':
                return <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800">Rozwiązany</Badge>
            default:
                return <Badge variant="outline">{status}</Badge>
        }
    }

    const renderTable = (filteredAlerts: Alert[], showActions: boolean) => (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Typ</TableHead>
                        <TableHead>Wiadomość</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Czas wystąpienia</TableHead>
                        {showActions && <TableHead className="text-right">Akcje</TableHead>}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredAlerts.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={showActions ? 5 : 4} className="h-24 text-center text-muted-foreground">
                                Brak alertów w tej kategorii.
                            </TableCell>
                        </TableRow>
                    ) : (
                        filteredAlerts.map((alert) => (
                            <TableRow key={alert.id}>
                                <TableCell>{getTypeBadge(alert.type)}</TableCell>
                                <TableCell className="font-medium">{alert.message}</TableCell>
                                <TableCell>{getStatusBadge(alert.status)}</TableCell>
                                <TableCell className="text-muted-foreground text-sm">
                                    {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true, locale: pl })}
                                </TableCell>
                                {showActions && (
                                    <TableCell className="text-right">
                                        {alert.status !== 'resolved' && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-8 gap-1 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                                                onClick={() => resolveAlert(alert.id)}
                                                disabled={resolving === alert.id}
                                            >
                                                <Check className="w-3 h-3" />
                                                {resolving === alert.id ? '...' : 'Rozwiąż'}
                                            </Button>
                                        )}
                                    </TableCell>
                                )}
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    )

    const activeAlerts = alerts.filter(a => a.status === 'new' || a.status === 'reviewed')
    const resolvedAlerts = alerts.filter(a => a.status === 'resolved')

    return (
        <Card>
            <CardHeader>
                <CardTitle>Centrum Alertów</CardTitle>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="active" className="space-y-4">
                    <TabsList>
                        <TabsTrigger value="active">
                            Aktywne ({activeAlerts.length})
                        </TabsTrigger>
                        <TabsTrigger value="resolved">
                            Rozwiązane ({resolvedAlerts.length})
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="active">
                        {renderTable(activeAlerts, true)}
                    </TabsContent>

                    <TabsContent value="resolved">
                        {renderTable(resolvedAlerts, false)}
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    )
}
