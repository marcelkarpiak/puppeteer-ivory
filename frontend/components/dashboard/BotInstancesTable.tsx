'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { useAdminContext } from '@/lib/admin-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Activity, RefreshCw, Server } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { pl } from 'date-fns/locale'

interface BotInstance {
    id: string
    name: string
    type: string | null
    status: 'online' | 'offline' | 'error'
    last_heartbeat: string | null
    posts_today: number
    config: Record<string, unknown>
}

export default function BotInstancesTable() {
    const supabase = createClient()
    const { isAdmin } = useAuth()
    const { selectedUserId } = useAdminContext()
    const [bots, setBots] = useState<BotInstance[]>([])
    const [loading, setLoading] = useState(true)

    const fetchBots = useCallback(async () => {
        setLoading(true)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let query: any = supabase
            .from('bot_instances')
            .select('*')

        if (isAdmin && selectedUserId) {
            query = query.eq('user_id', selectedUserId)
        }

        query = query.order('name', { ascending: true })

        const { data, error } = await query

        if (error) {
            console.error('Error fetching bots:', error)
        } else {
            setBots(data || [])
        }
        setLoading(false)
    }, [supabase, isAdmin, selectedUserId])

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchBots()

        // Realtime subscription
        const channel = supabase
            .channel('bot_instances_changes')
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            .on('postgres_changes', { event: '*', schema: 'public', table: 'bot_instances' }, (_payload) => {
                fetchBots()
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [fetchBots, supabase])

    const getStatusColor = (status: string, lastHeartbeat: string | null) => {
        // If no heartbeat for > 2 mins, mark as offline implicitly if not already
        if (lastHeartbeat) {
            const diff = new Date().getTime() - new Date(lastHeartbeat).getTime()
            if (diff > 120000) return 'bg-gray-500 hover:bg-gray-600' // Offline/Timeout
        }

        switch (status) {
            case 'online': return 'bg-green-500 hover:bg-green-600'
            case 'error': return 'bg-red-500 hover:bg-red-600'
            default: return 'bg-gray-500 hover:bg-gray-600'
        }
    }

    const getStatusLabel = (status: string, lastHeartbeat: string | null) => {
        if (lastHeartbeat) {
            const diff = new Date().getTime() - new Date(lastHeartbeat).getTime()
            if (diff > 120000) return 'Offline (Timeout)'
        }
        return status === 'online' ? 'Online' : (status === 'error' ? 'Błąd' : 'Offline')
    }

    if (loading && bots.length === 0) {
        return <div className="p-4 text-center">Ładowanie botów...</div>
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                    <Server className="h-5 w-5" /> Instancje Botów
                </CardTitle>
                <Button variant="outline" size="sm" onClick={fetchBots}>
                    <RefreshCw className="mr-2 h-4 w-4" /> Odśwież
                </Button>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nazwa</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Ostatni sygnał</TableHead>
                            <TableHead>Posty dzisiaj</TableHead>
                            <TableHead>Typ</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {bots.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center text-muted-foreground h-24">
                                    Brak aktywnych botów. Uruchom skrypt, aby zarejestrować bota.
                                </TableCell>
                            </TableRow>
                        ) : (
                            bots.map((bot) => (
                                <TableRow key={bot.id}>
                                    <TableCell className="font-medium">{bot.name}</TableCell>
                                    <TableCell>
                                        <Badge className={getStatusColor(bot.status, bot.last_heartbeat)}>
                                            {getStatusLabel(bot.status, bot.last_heartbeat)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        {bot.last_heartbeat ? (
                                            <div className="flex items-center gap-2" suppressHydrationWarning>
                                                <Activity className="h-3 w-3 text-muted-foreground" />
                                                {formatDistanceToNow(new Date(bot.last_heartbeat), { addSuffix: true, locale: pl })}
                                            </div>
                                        ) : '-'}
                                    </TableCell>
                                    <TableCell>{bot.posts_today}</TableCell>
                                    <TableCell>{bot.type || 'Standard'}</TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    )
}
