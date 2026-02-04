'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Pencil,
    Trash2,
    RefreshCw,
    Search,
    Hash
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { pl } from 'date-fns/locale'
import { toast } from 'sonner'
import { Category } from './CategoriesTable'

export interface Keyword {
    id: string
    user_id: string
    keyword: string
    category_id?: string
    match_count: number
    is_active: boolean
    created_at: string
}

interface KeywordsTableProps {
    keywords: Keyword[]
    categories: Category[]
    loading: boolean
    onRefresh: () => void
    onEdit: (keyword: Keyword) => void
}

export default function KeywordsTable({
    keywords,
    categories,
    loading,
    onRefresh,
    onEdit
}: KeywordsTableProps) {
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [keywordToDelete, setKeywordToDelete] = useState<Keyword | null>(null)
    const [deleting, setDeleting] = useState(false)
    const [toggling, setToggling] = useState<string | null>(null)
    const supabase = createClient()

    const handleDeleteClick = (keyword: Keyword) => {
        setKeywordToDelete(keyword)
        setDeleteDialogOpen(true)
    }

    const handleDeleteConfirm = async () => {
        if (!keywordToDelete) return

        setDeleting(true)
        try {
            const { error } = await supabase
                .from('keywords')
                .delete()
                .eq('id', keywordToDelete.id)

            if (error) throw error

            toast.success('Słowo kluczowe zostało usunięte')
            onRefresh()
        } catch (error) {
            console.error('Error deleting keyword:', error)
            toast.error('Błąd podczas usuwania słowa kluczowego')
        } finally {
            setDeleting(false)
            setDeleteDialogOpen(false)
            setKeywordToDelete(null)
        }
    }

    const handleToggleActive = async (keyword: Keyword) => {
        setToggling(keyword.id)
        try {
            const { error } = await supabase
                .from('keywords')
                .update({ is_active: !keyword.is_active })
                .eq('id', keyword.id)

            if (error) throw error

            toast.success(`Słowo ${keyword.is_active ? 'wyłączone' : 'włączone'}`)
            onRefresh()
        } catch (error) {
            console.error('Error toggling keyword:', error)
            toast.error('Błąd zmiany statusu słowa')
        } finally {
            setToggling(null)
        }
    }

    const getCategoryName = (categoryId?: string) => {
        if (!categoryId) return <span className="text-muted-foreground italic">Brak</span>
        const category = categories.find(c => c.id === categoryId)
        return category ? (
            <Badge variant="secondary" style={{ backgroundColor: category.color, color: '#fff' }}>
                {category.name}
            </Badge>
        ) : (
            <span className="text-muted-foreground">Nieznana</span>
        )
    }

    if (loading) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center h-64">
                    <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        )
    }

    if (keywords.length === 0) {
        return (
            <Card>
                <CardContent className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                    <Search className="w-12 h-12 mb-4" />
                    <p className="text-lg font-medium">Brak słów kluczowych</p>
                    <p className="text-sm">Dodaj słowa, które bot ma wyszukiwać w postach</p>
                </CardContent>
            </Card>
        )
    }

    return (
        <>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Lista słów kluczowych ({keywords.length})</CardTitle>
                    <Button onClick={onRefresh} variant="outline" size="sm">
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Odśwież
                    </Button>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Słowo kluczowe</TableHead>
                                    <TableHead>Kategoria</TableHead>
                                    <TableHead>Dopasowania</TableHead>
                                    <TableHead>Utworzono</TableHead>
                                    <TableHead className="text-right">Akcje</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {keywords.map((keyword) => (
                                    <TableRow key={keyword.id}>
                                        <TableCell>
                                            <Switch
                                                checked={keyword.is_active}
                                                onCheckedChange={() => handleToggleActive(keyword)}
                                                disabled={toggling === keyword.id}
                                                className={keyword.is_active ? "bg-green-500" : ""}
                                            />
                                        </TableCell>
                                        <TableCell className="font-medium">
                                            {keyword.keyword}
                                        </TableCell>
                                        <TableCell>
                                            {getCategoryName(keyword.category_id)}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1 text-sm">
                                                <Hash className="w-4 h-4 text-muted-foreground" />
                                                {keyword.match_count || 0}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-xs text-muted-foreground">
                                                {formatDistanceToNow(new Date(keyword.created_at), {
                                                    addSuffix: true,
                                                    locale: pl
                                                })}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex gap-2 justify-end">
                                                <Button
                                                    onClick={() => onEdit(keyword)}
                                                    variant="ghost"
                                                    size="sm"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    onClick={() => handleDeleteClick(keyword)}
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Potwierdź usunięcie</DialogTitle>
                        <DialogDescription>
                            Czy na pewno chcesz usunąć słowo kluczowe <strong>{keywordToDelete?.keyword}</strong>?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeleteDialogOpen(false)}
                            disabled={deleting}
                        >
                            Anuluj
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteConfirm}
                            disabled={deleting}
                        >
                            {deleting ? (
                                <>
                                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                    Usuwanie...
                                </>
                            ) : (
                                <>
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Usuń
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
