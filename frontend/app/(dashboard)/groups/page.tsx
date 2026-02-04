'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Users, Activity } from 'lucide-react'
import GroupsTable, { Group } from '@/components/dashboard/GroupsTable'
import GroupForm from '@/components/dashboard/GroupForm'
import { Category } from '@/components/dashboard/CategoriesTable'
import { toast } from 'sonner'

export default function GroupsPage() {
    const [groups, setGroups] = useState<Group[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    const [loading, setLoading] = useState(true)
    const [formOpen, setFormOpen] = useState(false)
    const [editingGroup, setEditingGroup] = useState<Group | null>(null)
    const { user, isAdmin, loading: authLoading, supabase } = useAuth()
    const router = useRouter()

    useEffect(() => {
        if (!authLoading && !isAdmin) {
            router.push('/')
            toast.error('Brak uprawnień do zarządzania grupami')
        }
    }, [authLoading, isAdmin, router])

    const fetchData = useCallback(async () => {
        if (!user || !supabase) {
            console.log('[GroupsPage] fetchData aborted: No user or supabase client')
            return
        }

        console.log(`[GroupsPage] fetchData started for user: ${user.id}`)
        setLoading(true)
        try {
            // 1. Pobierz grupy
            console.log('[GroupsPage] Fetching groups table...')

            // Timeout promise
            const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Request timeout')), 10000));

            const groupsRequest = supabase
                .from('groups')
                .select('*')
                .order('created_at', { ascending: false })

            // @ts-ignore
            const { data: groupsData, error: groupsError } = await Promise.race([groupsRequest, timeout])
                .then((res: any) => res)

            if (groupsError) throw groupsError
            console.log(`[GroupsPage] Groups fetched: ${groupsData?.length ?? 0}`)

            // 2. Pobierz kategorie (do wyświetlania w tabeli i selecta)
            console.log('[GroupsPage] Fetching categories table...')
            const { data: categoriesData, error: categoriesError } = await supabase
                .from('categories')
                .select('*')
                .order('name', { ascending: true })

            if (categoriesError) throw categoriesError
            console.log(`[GroupsPage] Categories fetched: ${categoriesData?.length ?? 0}`)

            setGroups(groupsData || [])
            setCategories(categoriesData || [])
        } catch (error) {
            console.error('[GroupsPage] Error fetching data:', error)
            toast.error('Błąd podczas pobierania danych')
        } finally {
            console.log('[GroupsPage] fetchData finally block - setLoading(false)')
            setLoading(false)
        }
    }, [user?.id, supabase])



    useEffect(() => {
        console.log(`[GroupsPage] useEffect triggered. User: ${!!user}, Admin: ${isAdmin}`)
        if (user && isAdmin) {
            fetchData()
        }
    }, [user?.id, isAdmin, fetchData])

    const handleEdit = (group: Group) => {
        setEditingGroup(group)
        setFormOpen(true)
    }

    const handleAddNew = () => {
        setEditingGroup(null)
        setFormOpen(true)
    }

    const handleFormSuccess = () => {
        fetchData()
        setFormOpen(false)
        setEditingGroup(null)
    }

    const handleFormOpenChange = (open: boolean) => {
        setFormOpen(open)
        if (!open) {
            setEditingGroup(null)
        }
    }

    if (authLoading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
                <div className="container mx-auto p-6">
                    <div className="flex items-center justify-center h-64">
                        <Activity className="w-8 h-8 animate-pulse" />
                    </div>
                </div>
            </div>
        )
    }

    if (!isAdmin) {
        return null
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
            <div className="container mx-auto p-6 space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                            Grupy Facebook
                        </h1>
                        <p className="text-muted-foreground mt-2">
                            Zarządzaj monitorowanymi grupami, przypisuj kategorie i śledź statystyki
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-lg px-4 py-2">
                            <Users className="w-4 h-4 mr-2" />
                            {groups.length} grup
                        </Badge>
                        <Button onClick={handleAddNew}>
                            <Plus className="w-4 h-4 mr-2" />
                            Nowa grupa
                        </Button>
                    </div>
                </div>

                <GroupsTable
                    groups={groups}
                    categories={categories}
                    loading={loading}
                    onRefresh={fetchData}
                    onEdit={handleEdit}
                />

                <GroupForm
                    open={formOpen}
                    onOpenChange={handleFormOpenChange}
                    group={editingGroup}
                    categories={categories}
                    onSuccess={handleFormSuccess}
                />
            </div>
        </div>
    )
}
