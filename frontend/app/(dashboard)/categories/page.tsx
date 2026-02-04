'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, FolderOpen, Activity } from 'lucide-react'
import CategoriesTable, { Category } from '@/components/dashboard/CategoriesTable'
import CategoryForm from '@/components/dashboard/CategoryForm'
import { toast } from 'sonner'

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const { user, isAdmin, loading: authLoading, supabase } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/')
      toast.error('Brak uprawnień do zarządzania kategoriami')
    }
  }, [authLoading, isAdmin, router])

  const fetchCategories = useCallback(async () => {
    if (!user || !supabase) return

    setLoading(true)
    try {
      // Pobierz kategorie z licznikami grup i słów kluczowych
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('categories')
        .select('*')
        .order('created_at', { ascending: true })

      if (categoriesError) throw categoriesError

      // Pobierz liczbę grup dla każdej kategorii
      const { data: groupsCount } = await supabase
        .from('groups')
        .select('category_id')

      // Pobierz liczbę słów kluczowych dla każdej kategorii
      const { data: keywordsCount } = await supabase
        .from('keywords')
        .select('category_id')

      // Połącz dane
      const categoriesWithCounts = categoriesData?.map((category: any) => ({
        ...category,
        groups_count: groupsCount?.filter((g: any) => g.category_id === category.id).length || 0,
        keywords_count: keywordsCount?.filter((k: any) => k.category_id === category.id).length || 0
      })) || []

      setCategories(categoriesWithCounts)
    } catch (error) {
      console.error('Error fetching categories:', error)
      toast.error('Błąd podczas pobierania kategorii')
    } finally {
      setLoading(false)
    }
  }, [user?.id, supabase])



  useEffect(() => {
    if (user && isAdmin) {
      fetchCategories()
    }
  }, [user?.id, isAdmin, fetchCategories])

  const handleEdit = (category: Category) => {
    setEditingCategory(category)
    setFormOpen(true)
  }

  const handleAddNew = () => {
    setEditingCategory(null)
    setFormOpen(true)
  }

  const handleFormSuccess = () => {
    fetchCategories()
    setFormOpen(false)
    setEditingCategory(null)
  }

  const handleFormOpenChange = (open: boolean) => {
    setFormOpen(open)
    if (!open) {
      setEditingCategory(null)
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
            <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">
              Kategorie
            </h1>
            <p className="text-muted-foreground mt-2">
              Zarządzaj kategoriami dla grup Facebook i słów kluczowych
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-lg px-4 py-2">
              <FolderOpen className="w-4 h-4 mr-2" />
              {categories.length} kategorii
            </Badge>
            <Button onClick={handleAddNew}>
              <Plus className="w-4 h-4 mr-2" />
              Nowa kategoria
            </Button>
          </div>
        </div>

        <CategoriesTable
          categories={categories}
          loading={loading}
          onRefresh={fetchCategories}
          onEdit={handleEdit}
        />

        <CategoryForm
          open={formOpen}
          onOpenChange={handleFormOpenChange}
          category={editingCategory}
          onSuccess={handleFormSuccess}
        />
      </div>
    </div>
  )
}
