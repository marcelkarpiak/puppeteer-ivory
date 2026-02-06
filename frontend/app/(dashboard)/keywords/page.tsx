'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useAdminContext } from '@/lib/admin-context'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Search, Activity, Upload } from 'lucide-react'
import KeywordsTable, { Keyword } from '@/components/dashboard/KeywordsTable'
import KeywordForm from '@/components/dashboard/KeywordForm'
import KeywordsBulkImport from '@/components/dashboard/KeywordsBulkImport'
import { Category } from '@/components/dashboard/CategoriesTable'
import { toast } from 'sonner'

export default function KeywordsPage() {
    const [keywords, setKeywords] = useState<Keyword[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    const [loading, setLoading] = useState(true)
    const [formOpen, setFormOpen] = useState(false)
    const [bulkImportOpen, setBulkImportOpen] = useState(false)
    const [editingKeyword, setEditingKeyword] = useState<Keyword | null>(null)
    const { user, isAdmin, loading: authLoading, supabase } = useAuth()
    const { selectedUserId } = useAdminContext()
    const router = useRouter()

    useEffect(() => {
        // Read-only access for non-admin — no redirect needed
    }, [authLoading, isAdmin, router])

    const fetchData = useCallback(async () => {
        if (!user || !supabase) return

        setLoading(true)
        try {
            // 1. Pobierz słowa kluczowe
            let query = supabase
                .from('keywords')
                .select('*')
                .order('created_at', { ascending: false })

            if (selectedUserId) {
                query = query.eq('user_id', selectedUserId)
            }

            const { data: keywordsData, error: keywordsError } = await query

            if (keywordsError) throw keywordsError

            // 2. Pobierz kategorie
            const { data: categoriesData, error: categoriesError } = await supabase
                .from('categories')
                .select('*')
                .order('name', { ascending: true })

            if (categoriesError) throw categoriesError

            setKeywords(keywordsData || [])
            setCategories(categoriesData || [])
        } catch (error) {
            console.error('Error fetching data:', error)
            toast.error('Błąd podczas pobierania danych')
        } finally {
            setLoading(false)
        }
    }, [user?.id, supabase, selectedUserId])



    useEffect(() => {
        if (user) {
            fetchData()
        }
    }, [user?.id, isAdmin, fetchData, selectedUserId])

    const handleEdit = (keyword: Keyword) => {
        if (!isAdmin) return
        setEditingKeyword(keyword)
        setFormOpen(true)
    }

    const handleAddNew = () => {
        setEditingKeyword(null)
        setFormOpen(true)
    }

    const handleFormSuccess = () => {
        fetchData()
        setFormOpen(false)
        setEditingKeyword(null)
    }

    const handleFormOpenChange = (open: boolean) => {
        setFormOpen(open)
        if (!open) {
            setEditingKeyword(null)
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

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
            <div className="container mx-auto p-6 space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                            Słowa kluczowe
                        </h1>
                        <p className="text-muted-foreground mt-2">
                            {isAdmin
                                ? "Definiuj frazy, które bot scanner ma wykrywać w postach"
                                : "Przeglądaj słowa kluczowe monitorowane przez bota"
                            }
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-lg px-4 py-2">
                            <Search className="w-4 h-4 mr-2" />
                            {keywords.length} słów
                        </Badge>
                        {isAdmin && (
                            <>
                                <Button variant="outline" onClick={() => setBulkImportOpen(true)}>
                                    <Upload className="w-4 h-4 mr-2" />
                                    Importuj wiele
                                </Button>
                                <Button onClick={handleAddNew}>
                                    <Plus className="w-4 h-4 mr-2" />
                                    Nowe słowo
                                </Button>
                            </>
                        )}
                    </div>
                </div>

                <KeywordsTable
                    keywords={keywords}
                    categories={categories}
                    loading={loading}
                    onRefresh={fetchData}
                    onEdit={handleEdit}
                    readOnly={!isAdmin}
                />

                {isAdmin && (
                    <>
                        <KeywordForm
                            open={formOpen}
                            onOpenChange={handleFormOpenChange}
                            keyword={editingKeyword}
                            categories={categories}
                            onSuccess={handleFormSuccess}
                            targetUserId={selectedUserId || undefined}
                        />

                        <KeywordsBulkImport
                            open={bulkImportOpen}
                            onOpenChange={setBulkImportOpen}
                            categories={categories}
                            onSuccess={fetchData}
                            targetUserId={selectedUserId || undefined}
                        />
                    </>
                )}
            </div>
        </div>
    )
}
